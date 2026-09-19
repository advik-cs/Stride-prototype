/**
 * Robust, Universal Browser Web Audio PCM Capture & Playback Utility.
 *
 * Requirements:
 * - Input: RAW 16-bit signed little-endian PCM, 16 kHz, mono.
 * - Output: 24 kHz 16-bit signed PCM decode & queue playback.
 * - Universal browser compatibility (Chrome, Safari, Edge, Firefox mobile/desktop).
 */

/**
 * Converts Float32Array audio samples (-1.0 to 1.0) into 16-bit signed integer PCM.
 */
export function float32ToInt16PCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/**
 * Downsamples Float32Array from sourceSampleRate to targetSampleRate (16kHz).
 */
export function downsampleTo16k(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 16000
): Float32Array {
  if (sourceSampleRate === targetSampleRate) return input;
  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetInput = 0;

  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }
  return result;
}

/**
 * Converts Int16Array to Base64 string (little-endian byte order).
 */
export function pcmToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string back into Int16Array.
 */
export function base64ToPCM(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

/**
 * Converts 16-bit signed PCM samples to Float32Array for Web Audio playback.
 */
export function int16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    output[i] = input[i] / 32768.0;
  }
  return output;
}

/**
 * High-reliability Microphone PCM Recorder.
 * Captures audio, downsamples if necessary, converts to 16kHz 16-bit mono PCM,
 * and emits Base64 chunks (~128-256ms) for streaming over WebSockets.
 */
export class PcmRecorder {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private totalChunksEmitted = 0;
  private totalBytesEmitted = 0;
  private peakRms = 0;
  private sourceSampleRate = 0;

  async start(onPcmChunk: (base64Chunk: string) => void): Promise<void> {
    if (this.isRecording) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access is not supported by your browser environment.');
    }

    this.totalChunksEmitted = 0;
    this.totalBytesEmitted = 0;
    this.peakRms = 0;

    // Request mono audio with noise suppression and echo cancellation
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.mediaStream = stream;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioCtx();

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.sourceSampleRate = this.audioContext.sampleRate;
    console.log(
      `[STRIDE PcmRecorder] Mic recording started. AudioContext sampleRate: ${this.sourceSampleRate}Hz (resampling target: 16000Hz).`
    );

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);

    // Buffer size 4096 gives ~85-256ms chunk depending on hardware sample rate
    const bufferSize = 4096;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.isRecording) return;
      const channelData = event.inputBuffer.getChannelData(0);

      // Downsample to 16kHz if audioContext is running at 44.1k or 48k
      const resampled =
        this.sourceSampleRate !== 16000
          ? downsampleTo16k(channelData, this.sourceSampleRate, 16000)
          : channelData;

      // Convert to 16-bit linear PCM little-endian
      const pcm16 = float32ToInt16PCM(resampled);

      if (pcm16.length > 0) {
        // Calculate RMS audio energy for diagnostics
        let sumSquares = 0;
        for (let i = 0; i < pcm16.length; i++) {
          const norm = pcm16[i] / 32768;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / pcm16.length);
        if (rms > this.peakRms) this.peakRms = rms;

        const base64 = pcmToBase64(pcm16);
        const bytes = pcm16.byteLength;
        this.totalChunksEmitted += 1;
        this.totalBytesEmitted += bytes;

        onPcmChunk(base64);
      }

      // Prevent microphone feedback to local speakers
      try {
        const out = event.outputBuffer.getChannelData(0);
        out.fill(0);
      } catch {}
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
    this.isRecording = true;
  }

  stop(): void {
    if (!this.isRecording && !this.audioContext && !this.mediaStream) {
      return;
    }

    console.log(
      `[STRIDE PcmRecorder] Mic recording stopped. Total chunks: ${this.totalChunksEmitted}, Total PCM bytes: ${this.totalBytesEmitted}, Peak RMS: ${this.peakRms.toFixed(4)}`
    );

    this.isRecording = false;

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }

  getStats(): { totalChunks: number; totalBytes: number; peakRms: number; sampleRate: number } {
    return {
      totalChunks: this.totalChunksEmitted,
      totalBytes: this.totalBytesEmitted,
      peakRms: this.peakRms,
      sampleRate: this.sourceSampleRate,
    };
  }

  isActive(): boolean {
    return this.isRecording;
  }
}

/**
 * Native 24kHz PCM Audio Queue Player.
 * Decodes streaming 24kHz 16-bit mono PCM chunks returned by Gemini Live
 * and schedules them smoothly in chronological order using Web Audio API.
 */
export class PcmPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isMuted = false;
  private gainNode: GainNode | null = null;

  private initAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 24000 });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.nextStartTime = 0;
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  enqueueChunk(pcm24k: Int16Array): void {
    if (this.isMuted || pcm24k.length === 0) return;

    try {
      const ctx = this.initAudioContext();
      const float32 = int16ToFloat32(pcm24k);

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      if (this.gainNode) {
        source.connect(this.gainNode);
      } else {
        source.connect(ctx.destination);
      }

      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextStartTime);
      source.start(startTime);
      this.nextStartTime = startTime + buffer.duration;

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
      };
    } catch (err) {
      console.warn('[STRIDE PcmPlayer] Error playing audio chunk:', err);
    }
  }

  stop(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.activeSources = [];
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.gainNode) {
      this.gainNode.gain.value = muted ? 0 : 1;
    }
    if (muted) {
      this.stop();
    }
  }

  close(): void {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
