import { VoiceProvider } from './VoiceProvider';
import { GeminiLiveProvider } from './GeminiLiveProvider';

/**
 * Resolves the currently configured voice provider type from environment or configuration.
 * Checked in order:
 * 1. Vite import.meta.env.VITE_VOICE_PROVIDER (browser bundle)
 * 2. Node process.env.VITE_VOICE_PROVIDER (SSR / test runtime)
 * 3. Default: 'gemini'
 */
export function getSelectedVoiceProviderType(): string {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_VOICE_PROVIDER) {
      return String((import.meta as any).env.VITE_VOICE_PROVIDER).toLowerCase().trim();
    }
  } catch {}

  try {
    if (typeof process !== 'undefined' && process.env?.VITE_VOICE_PROVIDER) {
      return String(process.env.VITE_VOICE_PROVIDER).toLowerCase().trim();
    }
  } catch {}

  return 'gemini';
}

/**
 * Factory creating the active VoiceProvider instance.
 *
 * Current supported provider:
 * - 'gemini' | 'gemini-live' -> GeminiLiveProvider
 *
 * Future prospective providers:
 * - 'openai' | 'openai-realtime'
 * - 'deepgram'
 *
 * Fails fast with a clear descriptive error if an unsupported or unimplemented provider is configured.
 */
export function getVoiceProvider(explicitType?: string): VoiceProvider {
  const providerType = (explicitType || getSelectedVoiceProviderType()).toLowerCase().trim();

  switch (providerType) {
    case 'gemini':
    case 'gemini-live':
      return new GeminiLiveProvider();

    case 'openai':
    case 'openai-realtime':
      throw new Error(
        `Voice provider "${providerType}" is not yet implemented in this release. Please set VITE_VOICE_PROVIDER=gemini.`
      );

    case 'deepgram':
      throw new Error(
        `Voice provider "${providerType}" is not yet implemented in this release. Please set VITE_VOICE_PROVIDER=gemini.`
      );

    default:
      throw new Error(
        `Unsupported voice provider: "${providerType}". Configured via VITE_VOICE_PROVIDER. Supported options: "gemini".`
      );
  }
}
