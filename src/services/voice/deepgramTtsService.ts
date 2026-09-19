import { duringApi } from '../../api/duringApi';

let currentAudioElement: HTMLAudioElement | null = null;

/**
 * Service for synthesizing and playing speech via Deepgram TTS through STRIDE backend.
 */
export async function synthesizeSpeechWithDeepgram(
  text: string,
  clientRequestId?: string
): Promise<{ audioBase64: string; mimeType: string }> {
  if (!text || text.trim() === '') {
    throw new Error('Text is required for TTS synthesis.');
  }

  try {
    const response = await duringApi.deepgramTts(text.trim(), clientRequestId);
    if (!response || !response.audioBase64) {
      throw new Error('Deepgram TTS returned an empty audio response.');
    }
    return {
      audioBase64: response.audioBase64,
      mimeType: response.mimeType || 'audio/mp3',
    };
  } catch (err: any) {
    console.error('[Deepgram TTS Service] Synthesis request failed:', err?.message || err);
    throw err;
  }
}

/**
 * Plays base64-encoded audio in the browser and resolves when playback finishes.
 */
export function playDeepgramAudio(audioBase64: string, mimeType: string = 'audio/mp3'): Promise<void> {
  return new Promise((resolve, reject) => {
    // If Audio API is unavailable (e.g. Node/test runner), resolve immediately
    if (typeof Audio === 'undefined') {
      console.warn('[Deepgram TTS Service] Browser Audio API not available in current environment.');
      resolve();
      return;
    }

    try {
      // Stop any existing playback
      stopDeepgramAudio();

      const audioSrc = `data:${mimeType};base64,${audioBase64}`;
      const audio = new Audio(audioSrc);
      currentAudioElement = audio;

      audio.onended = () => {
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
        resolve();
      };

      audio.onerror = (e) => {
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
        console.warn('[Deepgram TTS Service] Audio element playback error:', e);
        reject(new Error('Audio playback failed in browser'));
      };

      audio.play().catch((playErr) => {
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
        console.warn('[Deepgram TTS Service] Audio autoplay blocked or failed:', playErr?.message || playErr);
        // Autoplay may be blocked by browser policy; treat as completed rather than crashing
        resolve();
      });
    } catch (err: any) {
      currentAudioElement = null;
      console.warn('[Deepgram TTS Service] Failed to initialize audio playback:', err?.message || err);
      reject(err);
    }
  });
}

/**
 * Stops any currently playing Deepgram audio.
 */
export function stopDeepgramAudio(): void {
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
      currentAudioElement.src = '';
    } catch (err) {
      // Ignore pause errors
    }
    currentAudioElement = null;
  }
}
