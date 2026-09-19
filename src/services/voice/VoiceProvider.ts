/**
 * Interchangeable Voice Provider Interface for STRIDE.
 *
 * This contract decouples the Citizen Emergency Assistant UI and deterministic
 * STRIDE triage/SOS logic from underlying speech transport technologies.
 *
 * Current concrete implementation: GeminiLiveProvider
 * Future potential implementations: OpenAIRealtimeProvider, DeepgramProvider
 */

export type VoiceProviderStatus = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR';

export interface VoiceProviderCallbacks {
  /** Emitted whenever the provider transitions between operational states */
  onStatusChange?: (status: VoiceProviderStatus) => void;
  /** Emitted while the citizen is speaking with speculative/partial transcript */
  onInterimTranscript?: (transcript: string) => void;
  /** Emitted with the authoritative, finalized user utterance for STRIDE deterministic triage */
  onFinalTranscript?: (transcript: string) => void;
  /** Emitted when raw 24kHz PCM audio samples are received from the model for playback */
  onAudioChunk?: (pcm24kChunk: Int16Array) => void;
  /** Emitted when the assistant model finishes speaking the current turn */
  onTurnComplete?: () => void;
  /** Emitted on connection, microphone, or transport errors */
  onError?: (error: Error | string) => void;
}

export interface VoiceProviderConfig {
  sessionId?: string;
  systemInstruction?: string;
  language?: string;
}

export interface VoiceProvider {
  /** Unique identifying name of the provider implementation (e.g. 'gemini-live') */
  readonly name: string;
  /** Current operational lifecycle status */
  readonly status: VoiceProviderStatus;

  /** Establishes connection to the speech service (e.g. WebSocket handshake) */
  connect(config?: VoiceProviderConfig): Promise<void>;

  /** Activates microphone capture and begins streaming 16kHz PCM audio */
  startListening(): Promise<void>;

  /** Signals end of user speech, flushes buffer, and waits for final transcript */
  stopListening(): Promise<void>;

  /** Tears down audio hardware tracks, AudioContexts, and network connections */
  disconnect(): Promise<void>;

  /** Registers event callbacks for transcripts, audio, turn completions, and errors */
  setCallbacks(callbacks: VoiceProviderCallbacks): void;

  /** Synthesizes and plays spoken audio for assistant responses (e.g. Deepgram TTS) */
  speak?(text: string): Promise<void>;
}
