/**
 * Server-Side Deepgram Voice Service for STRIDE.
 *
 * Provides turn-based Speech-to-Text (STT) and Text-to-Speech (TTS)
 * via Deepgram's official REST APIs.
 *
 * Security Guarantee:
 * - DEEPGRAM_API_KEY is strictly server-side (process.env.DEEPGRAM_API_KEY).
 * - Never exposed to client bundles or logged in application logs.
 */

export interface DeepgramServiceConfig {
  sttModel?: string;
  ttsModel?: string;
  baseUrl?: string;
}

export function getDeepgramSttModel(): string {
  return (process.env.DEEPGRAM_STT_MODEL || 'nova-3').trim();
}

export function getDeepgramTtsModel(): string {
  return (process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en').trim();
}

export function getDeepgramBaseUrl(): string {
  return (process.env.DEEPGRAM_BASE_URL || 'https://api.deepgram.com').replace(/\/+$/, '');
}

/**
 * STRIDE Emergency Domain Vocabulary for Nova-3 Keyterm Prompting.
 * Boosts speech recognition accuracy for critical disaster terms naturally
 * without string replacement or fuzzy tampering.
 */
export const DEFAULT_STRIDE_EMERGENCY_KEYTERMS: string[] = [
  'trapped',
  'trapped upstairs',
  'need rescue',
  'water rising',
  'fire',
  'injured',
  'heavily injured',
  'seriously unwell',
  'physically disabled',
  'children',
  'infants',
  'elderly',
  'grandmother',
  'grandfather',
  'rescue',
  'bleeding',
  'unconscious',
  'missing',
  'cannot move',
];

/**
 * Retrieves configured keyterms for Nova-3 STT.
 * Defaults to DEFAULT_STRIDE_EMERGENCY_KEYTERMS, overridable via DEEPGRAM_KEYTERMS.
 */
export function getDeepgramKeyterms(): string[] {
  if (process.env.DEEPGRAM_KEYTERMS) {
    const custom = process.env.DEEPGRAM_KEYTERMS.split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (custom.length > 0) return custom;
  }
  return [...DEFAULT_STRIDE_EMERGENCY_KEYTERMS];
}

/**
 * Transcribes audio buffer using Deepgram STT REST API (/v1/listen).
 */
export async function transcribeAudioWithDeepgram(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm',
  correlationId?: string
): Promise<string> {
  const reqId = correlationId || `stt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  if (!audioBuffer || audioBuffer.length < 100) {
    throw new Error(`Audio recording too short or empty (${audioBuffer?.length || 0} bytes).`);
  }

  const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not configured on the server.');
  }

  const sttModel = getDeepgramSttModel();
  const baseUrl = getDeepgramBaseUrl();
  const keyterms = getDeepgramKeyterms();
  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';

  const queryParams = [
    `model=${encodeURIComponent(sttModel)}`,
    'smart_format=true',
    'punctuate=true',
    ...keyterms.map((term) => `keyterm=${encodeURIComponent(term)}`),
  ].join('&');

  const targetUrl = `${baseUrl}/v1/listen?${queryParams}`;

  const startTime = Date.now();
  console.log(`[STRIDE Deepgram STT] Dispatching transcription request (id: ${reqId}):`, {
    model: sttModel,
    bufferBytes: audioBuffer.length,
    mimeType: cleanMime,
    keytermsCount: keyterms.length,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': cleanMime,
      },
      body: audioBuffer,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {}
      console.warn(`[STRIDE Deepgram STT] Deepgram API returned status ${response.status} (id: ${reqId}, duration: ${durationMs}ms):`, errorBody);
      throw new Error(`Deepgram STT failed with status ${response.status}: ${errorBody || response.statusText}`);
    }

    const data = (await response.json()) as any;
    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      data.results?.utterances?.map((u: any) => u.transcript).join(' ') ||
      '';

    const trimmed = transcript.trim();
    console.log(`[STRIDE Deepgram STT] Transcription succeeded in ${durationMs}ms (id: ${reqId}):`, {
      transcriptLength: trimmed.length,
      hasConfidence: typeof data.results?.channels?.[0]?.alternatives?.[0]?.confidence === 'number',
    });

    return trimmed;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[STRIDE Deepgram STT] Transcription timed out after 15s (id: ${reqId}).`);
      throw new Error('Deepgram STT request timed out (15s).');
    }
    throw err;
  }
}

/**
 * Synthesizes speech from text using Deepgram TTS REST API (/v1/speak).
 */
export async function synthesizeSpeechWithDeepgram(
  text: string,
  correlationId?: string
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  const reqId = correlationId || `tts-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    throw new Error('Text is required for Deepgram TTS synthesis.');
  }

  const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not configured on the server.');
  }

  const ttsModel = getDeepgramTtsModel();
  const baseUrl = getDeepgramBaseUrl();
  const targetUrl = `${baseUrl}/v1/speak?model=${encodeURIComponent(ttsModel)}`;

  const startTime = Date.now();
  console.log(`[STRIDE Deepgram TTS] Dispatching speech synthesis (id: ${reqId}):`, {
    model: ttsModel,
    textLength: text.trim().length,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: text.trim() }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {}
      console.warn(`[STRIDE Deepgram TTS] Deepgram API returned status ${response.status} (id: ${reqId}, duration: ${durationMs}ms):`, errorBody);
      throw new Error(`Deepgram TTS failed with status ${response.status}: ${errorBody || response.statusText}`);
    }

    const mimeType = response.headers.get('content-type') || 'audio/mp3';
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    console.log(`[STRIDE Deepgram TTS] Speech synthesis succeeded in ${durationMs}ms (id: ${reqId}):`, {
      audioBytes: audioBuffer.length,
      mimeType,
    });

    return {
      audioBuffer,
      mimeType,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[STRIDE Deepgram TTS] Speech synthesis timed out after 12s (id: ${reqId}).`);
      throw new Error('Deepgram TTS request timed out (12s).');
    }
    throw err;
  }
}
