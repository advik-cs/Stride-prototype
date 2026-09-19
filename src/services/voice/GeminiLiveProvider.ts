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

    // 1. Request short-lived ephemeral token from STRIDE backend
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
        console.log('[STRIDE GeminiLiveProvider] Connecting to Live WebSocket...');
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
              outputAudioTranscription: {},
            },
          };

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
            this.handleServerMessage(msg);

            // Resolve initial connection once setup is acknowledged
            if (msg.setupComplete && !setupResolved) {
              setupResolved = true;
              this.isSetupComplete = true;
              console.log('[STRIDE GeminiLiveProvider] SetupComplete confirmed. Provider ready.');
              resolve();
            }
          } catch (jsonErr) {
            console.warn('[STRIDE GeminiLiveProvider] Error parsing server message:', jsonErr);
          }
        };

        this.ws.onerror = (errEvent: Event) => {
          console.error('[STRIDE GeminiLiveProvider] WebSocket error:', errEvent);
          this.setStatus('ERROR');
          const err = new Error('Gemini Live WebSocket encountered a connection error.');
          this.callbacks.onError?.(err);
          if (!setupResolved) {
            reject(err);
          }
        };

        this.ws.onclose = (closeEvent: CloseEvent) => {
          console.log('[STRIDE GeminiLiveProvider] WebSocket closed:', closeEvent.code, closeEvent.reason);
          this.isConnected = false;
          this.isSetupComplete = false;
          if (this.status === 'LISTENING') {
            this.pcmRecorder.stop();
          }
          if (this.status !== 'ERROR') {
            this.setStatus('IDLE');
          }
          if (!setupResolved) {
            reject(new Error(`WebSocket closed before setup completed (code: ${closeEvent.code}).`));
          }
        };

        // 10s connection timeout
        setTimeout(() => {
          if (!setupResolved) {
            const timeoutErr = new Error('Timeout waiting for Gemini Live setup completion.');
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

  private handleServerMessage(msg: any): void {
    const serverContent = msg.serverContent;
    if (!serverContent) return;

    // 1. Live interim transcription (speculative feedback while speaking)
    const interimText =
      serverContent.interimInputTranscription?.text ||
      serverContent.interimTranscript?.text ||
      serverContent.interim_input_transcription?.text;

    if (typeof interimText === 'string' && interimText.trim()) {
      this.callbacks.onInterimTranscript?.(interimText.trim());
    }

    // 2. Authoritative final input transcription
    const finalText =
      serverContent.inputTranscription?.text ||
      serverContent.input_transcription?.text ||
      serverContent.finalTranscript?.text;

    if (typeof finalText === 'string' && finalText.trim()) {
      console.log('[STRIDE GeminiLiveProvider] Authoritative final transcript:', finalText.trim());
      this.callbacks.onFinalTranscript?.(finalText.trim());
    }

    // 3. Model spoken response audio chunks (24kHz 16-bit PCM)
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
    }

    // 4. Turn completion
    if (serverContent.turnComplete) {
      console.log('[STRIDE GeminiLiveProvider] Model turn complete.');
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
      });
    } catch (err: any) {
      console.error('[STRIDE GeminiLiveProvider] Error starting microphone capture:', err);
      this.setStatus('ERROR');
      this.callbacks.onError?.(err);
      throw err;
    }
  }

  async stopListening(): Promise<void> {
    if (this.status !== 'LISTENING') return;

    this.setStatus('PROCESSING');
    this.pcmRecorder.stop();

    // Signal end of audio stream
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const endStreamMessage = {
        realtimeInput: {
          audioStreamEnd: true,
        },
      };
      this.sendJson(endStreamMessage);
    }
  }

  async disconnect(): Promise<void> {
    this.pcmRecorder.stop();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.isConnected = false;
    this.isSetupComplete = false;
    this.setStatus('IDLE');
  }
}
