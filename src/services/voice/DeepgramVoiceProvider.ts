import {
  VoiceProvider,
  VoiceProviderCallbacks,
  VoiceProviderConfig,
  VoiceProviderStatus,
} from './VoiceProvider';
import { transcribeAudioWithDeepgram } from './deepgramSttService';
import {
  synthesizeSpeechWithDeepgram,
  playDeepgramAudio,
  stopDeepgramAudio,
} from './deepgramTtsService';

/**
 * Concrete VoiceProvider implementation powered by Deepgram STT and TTS.
 * Operates turn-based: records audio via MediaRecorder, transcribes via Deepgram STT,
 * feeds into STRIDE deterministic triage, and speaks response via Deepgram TTS.
 */
export class DeepgramVoiceProvider implements VoiceProvider {
  readonly name = 'deepgram-turn';
  status: VoiceProviderStatus = 'IDLE';

  private callbacks: VoiceProviderCallbacks = {};
  private config: VoiceProviderConfig = {};
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isStopping = false;
  private isSpeaking = false;

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
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.setStatus('IDLE');
  }

  async startListening(): Promise<void> {
    if (this.status === 'LISTENING') {
      return;
    }

    // Stop any ongoing speech playback
    if (this.isSpeaking) {
      stopDeepgramAudio();
      this.isSpeaking = false;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const err = new Error('Microphone access is not supported by your browser.');
      this.setStatus('ERROR');
      this.callbacks.onError?.(err);
      throw err;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mediaStream = stream;
      this.recordedChunks = [];
      this.isStopping = false;

      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else {
            mimeType = '';
          }
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      recorder.start(250);
      this.setStatus('LISTENING');
    } catch (err: any) {
      console.error('[STRIDE DeepgramVoiceProvider] getUserMedia failed:', err);
      this.setStatus('ERROR');
      this.callbacks.onError?.(err);
      throw err;
    }
  }

  async stopListening(): Promise<void> {
    if (this.isStopping || this.status !== 'LISTENING') {
      return;
    }
    this.isStopping = true;

    try {
      const audioBlob = await new Promise<Blob>((resolve) => {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
          const blobType = this.recordedChunks[0]?.type || 'audio/webm';
          resolve(new Blob(this.recordedChunks, { type: blobType }));
          return;
        }

        this.mediaRecorder.onstop = () => {
          const blobType =
            this.recordedChunks[0]?.type || this.mediaRecorder?.mimeType || 'audio/webm';
          resolve(new Blob(this.recordedChunks, { type: blobType }));
        };

        try {
          this.mediaRecorder.stop();
        } catch {
          const blobType = this.recordedChunks[0]?.type || 'audio/webm';
          resolve(new Blob(this.recordedChunks, { type: blobType }));
        }
      });

      // Turn off microphone hardware indicator immediately
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
      }
      this.mediaRecorder = null;

      // Check for empty or too-short recording
      if (audioBlob.size < 100) {
        console.warn(`[STRIDE DeepgramVoiceProvider] Audio recording too small (${audioBlob.size} bytes).`);
        this.setStatus('IDLE');
        this.callbacks.onError?.(new Error('No speech detected in recording. Please try again.'));
        return;
      }

      this.setStatus('PROCESSING');

      // Transcribe via Deepgram STT
      const transcript = await transcribeAudioWithDeepgram(audioBlob);
      const cleaned = (transcript || '').trim();

      if (!cleaned) {
        console.warn('[STRIDE DeepgramVoiceProvider] No speech detected in recording.');
        this.setStatus('IDLE');
        this.callbacks.onError?.(new Error('No speech detected in recording. Please try again.'));
        return;
      }

      console.log(`[STRIDE DeepgramVoiceProvider] Deepgram STT final transcript: "${cleaned}"`);
      this.callbacks.onFinalTranscript?.(cleaned);
    } catch (err: any) {
      console.error('[STRIDE DeepgramVoiceProvider] Transcription error:', err);
      this.setStatus('IDLE');
      this.callbacks.onError?.(err?.message || 'Transcription failed. Please try again.');
    } finally {
      this.isStopping = false;
    }
  }

  async speak(text: string): Promise<void> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return;
    }

    this.setStatus('SPEAKING');
    this.isSpeaking = true;

    try {
      const { audioBase64, mimeType } = await synthesizeSpeechWithDeepgram(trimmed);
      if (audioBase64) {
        await playDeepgramAudio(audioBase64, mimeType);
      }
    } catch (err: any) {
      console.warn('[STRIDE DeepgramVoiceProvider] TTS synthesis or playback failed (continuing safely):', err?.message || err);
    } finally {
      this.isSpeaking = false;
      this.setStatus('IDLE');
      this.callbacks.onTurnComplete?.();
    }
  }

  async disconnect(): Promise<void> {
    this.isStopping = false;
    this.isSpeaking = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.mediaRecorder = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.recordedChunks = [];
    stopDeepgramAudio();
    this.setStatus('IDLE');
  }
}
