import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from './geminiVoiceService.ts';

export interface LiveSessionTokenResult {
  liveEnabled: boolean;
  token?: string;
  tokenName?: string;
  model: string;
  webSocketUrl: string;
  reason?: string;
}

/**
 * Creates an ephemeral, short-lived session token for Gemini Live API WebSocket connections.
 * Uses @google/genai `ai.authTokens.create` with direct REST fallback to
 * https://generativelanguage.googleapis.com/v1beta/auth_tokens.
 *
 * Security: The permanent GEMINI_API_KEY remains strictly on the server.
 * The client only receives a single-use token with a 5-minute session connection window
 * and 30-minute expiration.
 */
export async function createLiveSessionToken(correlationId?: string): Promise<LiveSessionTokenResult> {
  const reqId = correlationId || `token-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const apiKey = getGeminiApiKey();
  const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash';
  const webSocketBaseUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

  if (apiKey && (apiKey.startsWith('test-') || process.env.NODE_ENV === 'test') && process.env.GEMINI_LIVE_WS_URL) {
    return {
      liveEnabled: true,
      token: 'test-ephemeral-live-token',
      tokenName: 'test-token',
      model: liveModel,
      webSocketUrl: `${process.env.GEMINI_LIVE_WS_URL}?access_token=test-ephemeral-live-token`,
    };
  }

  if (!apiKey) {
    console.warn(`[STRIDE Live Voice] No GEMINI_API_KEY found in server environment (id: ${reqId}). Live API direct WebSockets unavailable.`);
    return {
      liveEnabled: false,
      model: liveModel,
      webSocketUrl: webSocketBaseUrl,
      reason: 'GEMINI_API_KEY is not configured on the server. Please check server environment configuration.',
    };
  }

  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // 1. Try official @google/genai SDK authTokens.create
  try {
    const ai = new GoogleGenAI({ apiKey });
    if (ai.authTokens && typeof ai.authTokens.create === 'function') {
      const tokenResp: any = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime,
          newSessionExpireTime,
        },
      });

      const tokenValue = tokenResp.token || tokenResp.name || '';
      const tokenName = tokenResp.name || '';

      console.log(`[STRIDE Live Voice] Ephemeral token created via SDK (id: ${reqId}, tokenName: ${tokenName || 'ok'})`);
      return {
        liveEnabled: true,
        token: tokenValue,
        tokenName,
        model: liveModel,
        webSocketUrl: `${webSocketBaseUrl}?access_token=${encodeURIComponent(tokenValue)}`,
      };
    }
  } catch (sdkErr: any) {
    console.warn(`[STRIDE Live Voice] SDK authTokens.create failed, trying direct REST fallback (id: ${reqId}):`, sdkErr?.message || sdkErr);
  }

  // 2. Direct REST Fallback to Generative Language API
  try {
    const restResp = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
      }),
    });

    if (!restResp.ok) {
      const errBody = await restResp.text();
      console.error(`[STRIDE Live Voice] REST auth_tokens failed with status ${restResp.status} (id: ${reqId}): ${errBody}`);
      return {
        liveEnabled: false,
        model: liveModel,
        webSocketUrl: webSocketBaseUrl,
        reason: `Gemini Token API error: ${restResp.status} ${errBody}`,
      };
    }

    const data: any = await restResp.json();
    const tokenValue = data.token || data.name || '';
    const tokenName = data.name || '';

    console.log(`[STRIDE Live Voice] Ephemeral token created via REST (id: ${reqId}, tokenName: ${tokenName})`);
    return {
      liveEnabled: true,
      token: tokenValue,
      tokenName,
      model: liveModel,
      webSocketUrl: `${webSocketBaseUrl}?access_token=${encodeURIComponent(tokenValue)}`,
    };
  } catch (restErr: any) {
    console.error(`[STRIDE Live Voice] Network error requesting ephemeral token (id: ${reqId}):`, restErr?.message || restErr);
    return {
      liveEnabled: false,
      model: liveModel,
      webSocketUrl: webSocketBaseUrl,
      reason: `Failed to connect to Gemini Token API: ${restErr?.message || 'Network error'}`,
    };
  }
}
