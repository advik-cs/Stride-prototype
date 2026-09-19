import {
  VoiceProvider,
  VoiceProviderCallbacks,
  VoiceProviderConfig,
  VoiceProviderStatus,
} from './VoiceProvider';
import { PcmRecorder, base64ToPCM } from './pcmAudioProcessor';
import { duringApi } from '../../api/duringApi';

/**
 * Concrete VoiceProvider implementation powered by Google Gemini Live API.
 * Uses client-side WebSockets connected to BidiGenerateContentConstrained
 * authenticated via server-provisioned ephemeral tokens.
 */
export class GeminiLiveProvider implements VoiceProvider {
  readonly name = 'gemini-live';
  status: VoiceProviderStatus = 'IDLE';

  private ws: WebSocket | null = null;
  private pcmRecorder: PcmRecorder = new PcmRecorder();
  private callbacks: VoiceProviderCallbacks = {};
  private config: VoiceProviderConfig = { sessionId: `live-${Date.now()}` };
  private isConnected = false;
  private isSetupComplete = false;
  private connectionPromise: Promise<void> | null = null;
  private lastServerError: any = null;

  // Turn management & transcript accumulation
  private accumulatedTranscript = '';
  private hasEmittedFinalTranscript = false;
  private isFinalizingTurn = false;
  private stopWatchdogTimer: any = null;
  private audioChunksSentCount = 0;
  private audioBytesSentCount = 0;

  setCallbacks(callbacks: VoiceProviderCallbacks): void {
    this.callbacks = callbacks;
  }

  private setStatus(status: VoiceProviderStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.callbacks.onStatusChange?.(status);
    }
  }

  async connect(config?: VoiceProviderConfig): Promise<void> {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.connectionPromise = this.performConnect();
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async performConnect(): Promise<void> {
    this.setStatus('IDLE');
    this.isSetupComplete = false;
    this.lastServerError = null;

    // 1. Request short-lived ephemeral token from STRIDE backend
    console.log('[STRIDE GeminiLiveProvider] Requesting ephemeral session token via POST /api/voice/session-token...');
    let tokenData: {
      liveEnabled: boolean;
      token?: string;
      tokenName?: string;
      model: string;
      webSocketUrl: string;
      reason?: string;
    };

    try {
      tokenData = await duringApi.getLiveSessionToken();
    } catch (tokenErr: any) {
      const msg = tokenErr?.message || 'Failed to obtain live session token from server';
      console.error('[STRIDE GeminiLiveProvider] Token request failed:', msg);
      this.setStatus('ERROR');
      this.callbacks.onError?.(new Error(msg));
      throw new Error(msg);
    }

    let hostAndPath = '';
    let hasAccessToken = false;
    try {
      const u = new URL(tokenData.webSocketUrl);
      hostAndPath = `${u.origin}${u.pathname}`;
      hasAccessToken = u.searchParams.has('access_token');
    } catch {
      hostAndPath = tokenData.webSocketUrl || 'none';
    }

    console.log('[STRIDE GeminiLiveProvider] Session token response received:', {
      liveEnabled: tokenData.liveEnabled,
      model: tokenData.model,
      tokenName: tokenData.tokenName || 'none',
      hasToken: !!tokenData.token,
      tokenLength: tokenData.token ? tokenData.token.length : 0,
      tokenPrefix: tokenData.token ? tokenData.token.slice(0, 15) : 'none',
      webSocketHostAndPath: hostAndPath,
      hasAccessToken,
    });

    if (!tokenData.liveEnabled || !tokenData.webSocketUrl) {
      const reason = tokenData.reason || 'Gemini Live is not enabled on the server.';
      console.warn('[STRIDE GeminiLiveProvider] Live connection unconfigured:', reason);
      this.setStatus('ERROR');
      this.callbacks.onError?.(new Error(reason));
      throw new Error(reason);
    }

    // 2. Open WebSocket connection to BidiGenerateContentConstrained
    return new Promise<void>((resolve, reject) => {
      try {
        console.log(`[STRIDE GeminiLiveProvider] Connecting to Live WebSocket at: ${hostAndPath}?access_token=<MASKED>`);
        this.ws = new WebSocket(tokenData.webSocketUrl);

        let setupResolved = false;

        this.ws.onopen = () => {
          console.log('[STRIDE GeminiLiveProvider] WebSocket connected. Sending setup frame...');
          this.isConnected = true;

          // Send initial BidiGenerateContentSetup frame
          const setupModel = tokenData.model.startsWith('models/')
            ? tokenData.model
            : `models/${tokenData.model}`;

          const setupMessage = {
            setup: {
              model: setupModel,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: 'Aoede',
                    },
                  },
                },
              },
              systemInstruction: {
                parts: [
                  {
                    text:
                      this.config.systemInstruction ||
                      'You are the STRIDE Emergency Voice Assistant for Bengaluru, Karnataka during a disaster operation. Speak naturally, empathetically, and concisely in English. Prioritize citizen safety.',
                  },
                ],
              },
              inputAudioTranscription: {},
            },
          };

          console.log('[STRIDE GeminiLiveProvider] Setup frame payload:', JSON.stringify(setupMessage, null, 2));
          this.sendJson(setupMessage);
        };

        this.ws.onmessage = async (event: MessageEvent) => {
          let textData = '';
          if (typeof event.data === 'string') {
            textData = event.data;
          } else if (event.data instanceof Blob) {
            textData = await event.data.text();
          } else if (event.data instanceof ArrayBuffer) {
            textData = new TextDecoder().decode(event.data);
          }

          try {
            const msg = JSON.parse(textData);
            console.log('[STRIDE GeminiLiveProvider] Server message received:', JSON.stringify(msg, null, 2));

            if (msg.error) {
              console.error('[STRIDE GeminiLiveProvider] Server returned ERROR frame:', msg.error);
              this.lastServerError = msg.error;
            }

            if (msg.goaway) {
              console.warn('[STRIDE GeminiLiveProvider] Server sent GOAWAY frame:', msg.goaway);
              this.lastServerError = msg.goaway;
            }

            this.handleServerMessage(msg);

            // Resolve initial connection once setup is acknowledged
            if (msg.setupComplete && !setupResolved) {
              setupResolved = true;
              this.isSetupComplete = true;
              console.log('[STRIDE GeminiLiveProvider] SetupComplete confirmed! Provider ready for live audio.');
              resolve();
            }
          } catch (jsonErr) {
            console.warn('[STRIDE GeminiLiveProvider] Error parsing server message:', jsonErr, 'Raw data:', textData);
          }
        };

        this.ws.onerror = (errEvent: Event) => {
          console.error('[STRIDE GeminiLiveProvider] WebSocket onerror event triggered:', errEvent);
          // onerror typically does not contain detailed message; onclose will follow
        };

        this.ws.onclose = (closeEvent: CloseEvent) => {
          console.warn('[STRIDE GeminiLiveProvider] WebSocket closed:', {
            code: closeEvent.code,
            reason: closeEvent.reason,
            wasClean: closeEvent.wasClean,
            lastServerError: this.lastServerError,
          });

          this.isConnected = false;
          this.isSetupComplete = false;
          if (this.status === 'LISTENING') {
            this.pcmRecorder.stop();
          }
          if (this.status !== 'ERROR') {
            this.setStatus('IDLE');
          }

          if (!setupResolved) {
            const reasonDetail = closeEvent.reason ? ` - ${closeEvent.reason}` : '';
            const serverErrDetail = this.lastServerError
              ? ` (Server error payload: ${typeof this.lastServerError === 'object' ? JSON.stringify(this.lastServerError) : this.lastServerError})`
              : '';
            const fullErrorMsg = `WebSocket closed before setup completed (code: ${closeEvent.code}${reasonDetail})${serverErrDetail}`;

            console.error('[STRIDE GeminiLiveProvider] Connection failed:', fullErrorMsg);
            const err = new Error(fullErrorMsg);
            this.setStatus('ERROR');
            this.callbacks.onError?.(err);
            reject(err);
          }
        };

        // 10s connection timeout
        setTimeout(() => {
          if (!setupResolved) {
            const timeoutErr = new Error('Timeout waiting for Gemini Live setup completion (10s).');
            this.disconnect();
            reject(timeoutErr);
          }
        }, 10000);
      } catch (err: any) {
        this.setStatus('ERROR');
        this.callbacks.onError?.(err);
        reject(err);
      }
    });
  }

  private emitFinalTranscript(text: string): void {
    if (this.hasEmittedFinalTranscript) return;
    this.hasEmittedFinalTranscript = true;

    if (this.stopWatchdogTimer) {
      clearTimeout(this.stopWatchdogTimer);
      this.stopWatchdogTimer = null;
    }

    const trimmed = text.trim();
    console.log('[STRIDE GeminiLiveProvider] Emitting authoritative final transcript to STRIDE triage:', trimmed);
    this.callbacks.onFinalTranscript?.(trimmed);
  }

  private handleTurnWatchdogTimeout(): void {
    if (this.hasEmittedFinalTranscript) {
      return;
    }

    console.warn('[STRIDE GeminiLiveProvider] Watchdog timeout (3.5s) waiting for server turn/transcription.');

    if (this.accumulatedTranscript && this.accumulatedTranscript.trim().length > 0) {
      console.log(
        '[STRIDE GeminiLiveProvider] Watchdog promoting accumulated interim transcript:',
        this.accumulatedTranscript.trim()
      );
      this.emitFinalTranscript(this.accumulatedTranscript.trim());
    } else {
      console.warn(
        '[STRIDE GeminiLiveProvider] Watchdog: No speech detected in recording. Recovering UI directly without STRIDE triage.'
      );
      this.setStatus('IDLE');
      this.callbacks.onError?.(new Error('No speech detected in recording. Please try speaking again.'));
    }
  }

  private handleServerMessage(msg: any): void {
    const serverContent = msg.serverContent;
    if (!serverContent) return;

    // 1. Live interim transcription (speculative feedback while speaking)
    const interimText =
      serverContent.interimInputTranscription?.text ||
      serverContent.interimTranscript?.text ||
      serverContent.interim_input_transcription?.text ||
      msg.interimInputTranscription?.text;

    if (typeof interimText === 'string' && interimText.trim()) {
      const cleanInterim = interimText.trim();
      this.accumulatedTranscript = cleanInterim;
      this.callbacks.onInterimTranscript?.(cleanInterim);
    }

    // 2. Authoritative final input transcription
    const finalText =
      serverContent.inputTranscription?.text ||
      serverContent.input_transcription?.text ||
      serverContent.finalTranscript?.text ||
      msg.inputTranscription?.text;

    if (typeof finalText === 'string' && finalText.trim()) {
      const cleanFinal = finalText.trim();
      this.accumulatedTranscript = cleanFinal;
      this.emitFinalTranscript(cleanFinal);
    }

    // 3. Model spoken response audio chunks (24kHz 16-bit PCM) & text
    const modelParts = serverContent.modelTurn?.parts || [];
    for (const part of modelParts) {
      if (part.inlineData && part.inlineData.data) {
        const mime = part.inlineData.mimeType || '';
        if (mime.includes('audio/pcm') || mime.includes('rate=24000') || !mime) {
          const pcmChunk = base64ToPCM(part.inlineData.data);
          if (pcmChunk.length > 0) {
            this.setStatus('SPEAKING');
            this.callbacks.onAudioChunk?.(pcmChunk);
          }
        }
      }
      if (part.text && typeof part.text === 'string' && part.text.trim()) {
        console.log('[STRIDE GeminiLiveProvider] Model response text part:', part.text.trim());
      }
    }

    // 4. Turn completion handling
    if (serverContent.turnComplete) {
      console.log('[STRIDE GeminiLiveProvider] Model turnComplete frame received from server.');

      if (this.stopWatchdogTimer) {
        clearTimeout(this.stopWatchdogTimer);
        this.stopWatchdogTimer = null;
      }

      // If server sent turnComplete without an explicit inputTranscription frame, promote accumulated interim transcript
      if (!this.hasEmittedFinalTranscript && this.accumulatedTranscript.trim().length > 0) {
        console.log(
          '[STRIDE GeminiLiveProvider] Promoting accumulated interim transcript on turnComplete:',
          this.accumulatedTranscript.trim()
        );
        this.emitFinalTranscript(this.accumulatedTranscript.trim());
      } else if (!this.hasEmittedFinalTranscript) {
        console.warn('[STRIDE GeminiLiveProvider] TurnComplete received but no transcript accumulated.');
        if (this.status === 'PROCESSING') {
          this.setStatus('IDLE');
        }
      }

      this.callbacks.onTurnComplete?.();
      if (this.status === 'SPEAKING' || this.status === 'PROCESSING') {
        this.setStatus('IDLE');
      }
    }

    // 5. Interruption handling
    if (serverContent.interrupted) {
      console.log('[STRIDE GeminiLiveProvider] Model generation interrupted.');
      if (this.status === 'SPEAKING') {
        this.setStatus('IDLE');
      }
    }
  }

  private sendJson(payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn('[STRIDE GeminiLiveProvider] Cannot send JSON: WebSocket not OPEN.');
    }
  }

  async startListening(): Promise<void> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    if (this.stopWatchdogTimer) {
      clearTimeout(this.stopWatchdogTimer);
      this.stopWatchdogTimer = null;
    }

    // Reset per-turn state
    this.accumulatedTranscript = '';
    this.hasEmittedFinalTranscript = false;
    this.isFinalizingTurn = false;
    this.audioChunksSentCount = 0;
    this.audioBytesSentCount = 0;

    this.setStatus('LISTENING');

    try {
      await this.pcmRecorder.start((base64PcmChunk: string) => {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
          return;
        }

        // Stream real-time 16kHz 16-bit mono PCM chunks over WebSocket
        const realtimeMessage = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64PcmChunk,
              },
            ],
          },
        };

        this.sendJson(realtimeMessage);

        this.audioChunksSentCount += 1;
        this.audioBytesSentCount += Math.floor((base64PcmChunk.length * 3) / 4);

        if (this.audioChunksSentCount === 1 || this.audioChunksSentCount % 20 === 0) {
          console.log(
            `[STRIDE GeminiLiveProvider] Streaming audio chunk #${this.audioChunksSentCount} (~${this.audioBytesSentCount} bytes total)...`
          );
        }
      });
    } catch (err: any) {
      console.error('[STRIDE GeminiLiveProvider] Error starting microphone capture:', err);
      this.setStatus('ERROR');
      this.callbacks.onError?.(err);
      throw err;
    }
  }

  async stopListening(): Promise<void> {
    // Idempotent guard against rapid user taps or racing events
    if (this.status !== 'LISTENING' || this.isFinalizingTurn) {
      return;
    }
    this.isFinalizingTurn = true;

    this.setStatus('PROCESSING');
    this.pcmRecorder.stop();

    const recorderStats = this.pcmRecorder.getStats();
    console.log(
      `[STRIDE GeminiLiveProvider] stopListening: Finalizing turn. Total chunks streamed: ${this.audioChunksSentCount} (~${this.audioBytesSentCount} bytes), peak RMS: ${recorderStats.peakRms.toFixed(4)}`
    );

    // Signal end of audio stream AND client turn completion
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(
        '[STRIDE GeminiLiveProvider] Transmitting audioStreamEnd and clientContent.turnComplete...'
      );
      this.sendJson({
        realtimeInput: {
          audioStreamEnd: true,
        },
      });
      this.sendJson({
        clientContent: {
          turnComplete: true,
        },
      });
    }

    // Safety watchdog timer (3.5s) to guarantee UI never hangs in PROCESSING
    if (this.stopWatchdogTimer) {
      clearTimeout(this.stopWatchdogTimer);
    }
    this.stopWatchdogTimer = setTimeout(() => {
      this.handleTurnWatchdogTimeout();
    }, 3500);
  }

  async disconnect(): Promise<void> {
    if (this.stopWatchdogTimer) {
      clearTimeout(this.stopWatchdogTimer);
      this.stopWatchdogTimer = null;
    }

    this.pcmRecorder.stop();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.isConnected = false;
    this.isSetupComplete = false;
    this.isFinalizingTurn = false;
    this.setStatus('IDLE');
  }
}
