import { duringApi } from '../../api/duringApi';

/**
 * Service for transcribing recorded audio using Deepgram STT through the STRIDE backend.
 */
export async function transcribeAudioWithDeepgram(
  audioBlob: Blob,
  clientRequestId?: string
): Promise<string> {
  if (!audioBlob || audioBlob.size === 0) {
    throw new Error('Cannot transcribe empty audio recording.');
  }

  if (audioBlob.size < 100) {
    console.warn(`[Deepgram STT Service] Audio blob is suspiciously small (${audioBlob.size} bytes).`);
    throw new Error('Audio recording was too short or empty.');
  }

  try {
    const response = await duringApi.deepgramStt(audioBlob, clientRequestId);
    const transcript = (response?.transcript || '').trim();
    return transcript;
  } catch (err: any) {
    console.error('[Deepgram STT Service] Transcription request failed:', err?.message || err);
    throw err;
  }
}
