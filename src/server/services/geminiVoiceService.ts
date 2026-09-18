import { GoogleGenAI } from '@google/genai';
import { StrideContextData } from './strideContextService.ts';

export type VoiceEmergencyMode = 'ASSIST' | 'ASSESS' | 'EMERGENCY';

export interface ExtractedEmergencyInfo {
  peopleCount?: number;
  childrenCount?: number;
  elderlyCount?: number;
  disabledCount?: number;
  injuredCount?: number;
  criticalMedicalNeed?: boolean;
  waterLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  emergencyType?: 'FLOOD' | 'MEDICAL' | 'TRAPPED' | 'STRUCTURAL_DANGER' | 'FIRE' | 'OTHER';
  conditions?: string[];
  spokenLocation?: string;
}

export interface VoiceAssistantOutput {
  mode: VoiceEmergencyMode;
  intent: string;
  assistantResponse: string;
  extractedInformation: ExtractedEmergencyInfo;
  existingIncidentFacts?: ExtractedEmergencyInfo;
  uncertainInformation: string[];
  missingInformation: string[];
  questionTarget?: string;
  shouldCreateOrUpdateSos: boolean;
  isFallbackExtractor?: boolean;
}

export interface VoiceAudioAssistantOutput extends VoiceAssistantOutput {
  transcript: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Limited emergency-signal extractor fallback.
 * NOTE: As per specifications, this deterministic extractor is NOT a replacement
 * for Gemini's conversational intelligence. It only acts on high-confidence emergency signals
 * and NEVER fabricates missing information or speculative numbers.
 */
export function limitedEmergencySignalExtractor(
  message: string,
  history: ChatMessage[],
  context: StrideContextData,
  existingIncidentFacts?: ExtractedEmergencyInfo
): VoiceAssistantOutput {
  const lower = message.toLowerCase().trim();

  // Inspect previous assistant messages to preserve conversational progression
  const previousAssistantMsgs = (history || []).filter((h) => h.role === 'assistant');
  const lastAssistantMsg =
    previousAssistantMsgs.length > 0
      ? previousAssistantMsgs[previousAssistantMsgs.length - 1].content
      : '';
  const lastAssistantLower = lastAssistantMsg.toLowerCase();

  const isAffirmation =
    /^(ok|okay|k|yes|yeah|yep|sure|fine|alright|right|y|correct|understood|got it)\b/i.test(lower) ||
    lower === 'ok' ||
    lower === 'okay' ||
    lower === 'yes';

  const isNegative =
    /^(no|nope|nah|not really|negative)\b/i.test(lower) || lower === 'no';

  const isCannotDescribe =
    (lower.includes('cant describe') ||
      lower.includes("can't describe") ||
      lower.includes('cannot describe') ||
      lower.includes('cant explain') ||
      lower.includes("can't explain") ||
      lower.includes('cannot explain') ||
      lower.includes('no idea') ||
      lower.includes('cant talk') ||
      lower.includes("can't talk") ||
      lower === 'dont know' ||
      lower === "don't know" ||
      lower === "i don't know" ||
      lower === "i dont know") &&
    !lower.includes('child') &&
    !lower.includes('kid') &&
    !lower.includes('elderly') &&
    !lower.includes('trapped') &&
    !lower.includes('water') &&
    !lower.includes('injur');

  // 1. Check for pure greetings or capability inquiries (ASSIST mode)
  const isPureGreeting =
    /^(hi|hello|hey|good\s+(morning|afternoon|evening)|greetings)\b/i.test(lower) &&
    !lower.includes('stuck') &&
    !lower.includes('trapped') &&
    !lower.includes('hurt') &&
    !lower.includes('injur') &&
    !lower.includes('bleed') &&
    !lower.includes('water') &&
    !lower.includes('flood') &&
    !lower.includes('fire') &&
    !lower.includes('rescue') &&
    !lower.includes('help');

  const isCapabilityInquiry =
    lower.includes('what can you help') ||
    lower.includes('what can you do') ||
    lower.includes('how can you help') ||
    lower.includes('who are you');

  if ((isPureGreeting || isCapabilityInquiry) && !isAffirmation) {
    return {
      mode: 'ASSIST',
      intent: isPureGreeting ? 'greeting' : 'capability_inquiry',
      assistantResponse:
        "Hello! I am the STRIDE Emergency Voice Assistant. You can speak naturally to report an emergency, ask for disaster safety guidance, or find the nearest evacuation shelter. How can I help you?",
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: [],
      missingInformation: [],
      questionTarget: 'none',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // Conversational adaptation: User cannot or refuses to describe
  if (isCannotDescribe) {
    let resp =
      "That's okay. You don't need to describe it. Are you able to move to a safer place? Yes or no.";
    let target = 'safety_mobility';
    if (lastAssistantLower.includes('able to move to a safer place')) {
      resp =
        "That's okay. You don't need to describe it. Are you or anyone with you injured right now? Yes or no.";
      target = 'medical_need';
    }
    return {
      mode: 'ASSESS',
      intent: 'cannot_describe_adaptation',
      assistantResponse: resp,
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: [],
      missingInformation: [target],
      questionTarget: target,
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // Conversational adaptation: Short confirmation / affirmation ("ok", "yes", etc.)
  if (isAffirmation) {
    if (
      lastAssistantLower.includes('do you require emergency rescue assistance') ||
      lastAssistantLower.includes('require emergency rescue')
    ) {
      return {
        mode: 'ASSESS',
        intent: 'affirm_rescue_assistance',
        assistantResponse:
          "Understood, your request for rescue assistance is noted. Just tell me one thing: are you trapped right now? You can answer yes or no.",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: ['trapped_status'],
        questionTarget: 'trapped_status',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

    if (
      lastAssistantLower.includes('could you describe the situation') ||
      lastAssistantLower.includes('are you trapped, injured, or able to move')
    ) {
      return {
        mode: 'ASSESS',
        intent: 'simplify_distress_assessment',
        assistantResponse:
          "That's okay. Just tell me one thing: are you trapped right now? You can answer yes or no.",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: ['trapped_status'],
        questionTarget: 'trapped_status',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

    if (lastAssistantLower.includes('are you trapped right now')) {
      return {
        mode: 'ASSESS',
        intent: 'assess_mobility_status',
        assistantResponse:
          "Understood. Are you able to move to a safer place right now? Yes or no.",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: ['safety_mobility'],
        questionTarget: 'safety_mobility',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

    if (lastAssistantLower.includes('able to move to a safer place')) {
      return {
        mode: 'ASSIST',
        intent: 'shelter_guidance_offer',
        assistantResponse:
          "Understood. If safe to do so, please move toward higher ground or an emergency shelter. Do you need directions to the nearest shelter?",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: [],
        questionTarget: 'shelter_guidance',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

    // Default affirmation adaptation
    const defaultResp = context.activeSos
      ? "That's okay. Just tell me one thing: are you trapped right now? You can answer yes or no."
      : "Understood. Are you in immediate danger right now? You can answer yes or no.";
    return {
      mode: 'ASSESS',
      intent: 'general_affirmation_followup',
      assistantResponse: defaultResp,
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: [],
      missingInformation: ['danger_status'],
      questionTarget: context.activeSos ? 'trapped_status' : 'immediate_danger',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // Conversational adaptation: Negative answers ("no", "nope", etc.)
  if (isNegative) {
    if (
      lastAssistantLower.includes('are you trapped right now') ||
      lastAssistantLower.includes('are you trapped')
    ) {
      return {
        mode: 'ASSESS',
        intent: 'not_trapped_check_injuries',
        assistantResponse:
          "Understood, you are not trapped. Are you or anyone with you injured or in need of medical help? Yes or no.",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: ['medical_need'],
        questionTarget: 'medical_need',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

    if (lastAssistantLower.includes('able to move to a safer place')) {
      return {
        mode: 'ASSESS',
        intent: 'immobile_safety_check',
        assistantResponse:
          "Understood. If you cannot move safely, please stay where you are in the safest, most elevated spot available. Are you in immediate danger right now? Yes or no.",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: ['immediate_danger'],
        questionTarget: 'immediate_danger',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

    if (lastAssistantLower.includes('do you require emergency rescue assistance')) {
      return {
        mode: 'ASSIST',
        intent: 'decline_rescue_assistance',
        assistantResponse:
          "Understood. I am here to provide disaster guidance, shelter locations, or weather updates whenever you need them. Stay safe.",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: [],
        questionTarget: 'none',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }
  }

  // 2. Check for informational queries (ASSIST intent)
  const isQuestion =
    lower.startsWith('what') ||
    lower.startsWith('where') ||
    lower.startsWith('how') ||
    lower.startsWith('can you') ||
    lower.startsWith('is it safe') ||
    lower.startsWith('should we') ||
    lower.includes('?') ||
    lower.includes('nearest shelter') ||
    lower.includes('hospital') ||
    lower.includes('helpline') ||
    lower.includes('weather');

  // Trapped signals
  const hasTrappedExplicit =
    lower.includes('trapped') ||
    lower.includes('cannot get out') ||
    lower.includes("can't get out") ||
    lower.includes('stuck upstairs') ||
    lower.includes('marooned');

  const hasGeneralStuck =
    lower.includes('stuck') ||
    lower.includes("i'm stuck") ||
    lower.includes('im stuck');

  // Injury signals
  const hasInjured =
    lower.includes('injured') ||
    lower.includes('bleeding') ||
    lower.includes('unconscious') ||
    lower.includes('broken leg') ||
    lower.includes('heart attack') ||
    lower.includes('medical emergency') ||
    lower.includes('hurt');

  // Water signals
  const hasRisingWater =
    lower.includes('water is rising') ||
    lower.includes('water rising') ||
    lower.includes('waist deep') ||
    lower.includes('chest level') ||
    lower.includes('neck deep') ||
    lower.includes('submerged');

  const hasWaterMentioned =
    hasRisingWater ||
    lower.includes('water is entering') ||
    lower.includes('water entering') ||
    lower.includes('water');

  const hasFire = lower.includes('fire') || lower.includes('smoke') || lower.includes('burning');

  const hasDisabledOrImmobile =
    lower.includes('cannot walk') ||
    lower.includes("can't walk") ||
    lower.includes('wheelchair') ||
    lower.includes('bedridden') ||
    lower.includes('disabled');

  const hasExplicitRescueCall =
    lower.includes('please rescue') ||
    lower.includes('send rescue') ||
    lower.includes('send a boat') ||
    lower.includes('help us please') ||
    lower.includes('save us') ||
    lower.includes('save me') ||
    lower.includes('need evacuation') ||
    lower.includes('evacuate us') ||
    lower.includes('emergency need help');

  // Check for speculation phrases
  const hasSpeculation =
    lower.includes('i think') ||
    lower.includes('maybe') ||
    lower.includes('might be') ||
    lower.includes('not sure') ||
    lower.includes('possibly') ||
    lower.includes('probably');

  // Pure informational queries (ASSIST mode)
  if (isQuestion && !hasTrappedExplicit && !hasInjured && !hasExplicitRescueCall && !hasRisingWater && !hasFire) {
    let resp =
      "For your safety during this disaster event, please stay on higher ground and avoid entering moving floodwaters. Do you require emergency rescue assistance?";

    if (lower.includes('what should i do') && (lower.includes('flood') || lower.includes('flooding'))) {
      resp =
        "If there is flooding, move immediately to higher ground or upper floors. Disconnect main electrical breakers if safe to do so. Avoid walking or driving through moving water, and prepare essential emergency supplies. Are you in immediate danger?";
    } else if (lower.includes('shelter') && context.nearestShelters.length > 0) {
      const s = context.nearestShelters[0];
      resp = `The nearest shelter is ${s.name} at ${s.address} (${s.distanceKm} km away, status: ${s.status}).`;
    } else if (lower.includes('hospital') && context.nearestFacilities.length > 0) {
      const f = context.nearestFacilities[0];
      resp = `The nearest medical facility is ${f.name} at ${f.address} (${f.distanceKm} km away).`;
    } else if (lower.includes('electricity') || lower.includes('power')) {
      resp =
        "If water enters your home, turn off the main electrical breaker immediately if it is safe to reach. Do not touch electrical switches or appliances while standing in water.";
    }

    return {
      mode: 'ASSIST',
      intent: 'general_inquiry',
      assistantResponse: resp,
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: [],
      missingInformation: [],
      questionTarget: 'rescue_necessity',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // Clear emergency signals present (EMERGENCY mode)
  if (
    hasTrappedExplicit ||
    hasInjured ||
    (hasRisingWater && !isQuestion) ||
    hasFire ||
    hasExplicitRescueCall ||
    (hasDisabledOrImmobile && (lower.includes('water') || lower.includes('evacuation') || lower.includes('help'))) ||
    (context.activeSos && (hasInjured || hasTrappedExplicit || hasGeneralStuck))
  ) {
    const extracted: ExtractedEmergencyInfo = {};
    const uncertain: string[] = [];
    const missing: string[] = [];
    const conditions: string[] = ['NEED_RESCUE'];

    if (hasTrappedExplicit || hasGeneralStuck) {
      extracted.emergencyType = 'TRAPPED';
      conditions.push('TRAPPED');
    } else if (hasFire) {
      extracted.emergencyType = 'FIRE' as any;
      conditions.push('FIRE');
    } else if (hasInjured) {
      extracted.emergencyType = 'MEDICAL';
    } else {
      extracted.emergencyType = 'FLOOD';
    }

    if (hasRisingWater) {
      extracted.waterLevel = lower.includes('chest') || lower.includes('neck') ? 'EXTREME' : 'HIGH';
      conditions.push('WATER_RISING');
    }

    if (hasInjured) {
      if (lower.includes('unconscious') || lower.includes('heart') || lower.includes('severe')) {
        extracted.criticalMedicalNeed = true;
        conditions.push('SERIOUSLY_UNWELL');
      }
      extracted.injuredCount = 1;
      conditions.push('HEAVILY_INJURED');
    }

    // Number extraction for people (e.g., "5 people", "four of us")
    const peopleNumMatch = message.match(/(\b\d+\b)\s*(?:people|individuals|members|of us|persons)/i);
    const wordPeopleMap: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
    };
    let foundPeople = 1;
    if (peopleNumMatch) {
      foundPeople = parseInt(peopleNumMatch[1], 10);
    } else {
      for (const [w, n] of Object.entries(wordPeopleMap)) {
        if (new RegExp(`\\b${w}\\s*(?:people|individuals|of us)\\b`, 'i').test(message)) {
          foundPeople = n;
          break;
        }
      }
    }
    extracted.peopleCount = Math.max(1, foundPeople);

    // Speculation filter for children/elderly
    if (lower.includes('child') || lower.includes('baby') || lower.includes('infant') || lower.includes('kid')) {
      if (hasSpeculation) {
        uncertain.push('Possible children present (unconfirmed)');
      } else {
        const childMatch = message.match(/(\b\d+\b)\s*(?:children|infants|babies|kids)/i);
        extracted.childrenCount = childMatch ? parseInt(childMatch[1], 10) : 1;
        conditions.push('CHILDREN_INFANTS_PRESENT');
      }
    }

    if (
      lower.includes('grandmother') ||
      lower.includes('grandfather') ||
      lower.includes('elderly') ||
      lower.includes('grandma') ||
      lower.includes('grandpa')
    ) {
      if (hasSpeculation) {
        uncertain.push('Possible elderly present (unconfirmed)');
      } else {
        const elderlyMatch = message.match(/(\b\d+\b)\s*(?:elderly|grandparents)/i);
        extracted.elderlyCount = elderlyMatch ? parseInt(elderlyMatch[1], 10) : 1;
      }
    }

    if (
      lower.includes('wheelchair') ||
      lower.includes('disabled') ||
      lower.includes('cannot walk') ||
      lower.includes("can't walk") ||
      lower.includes('bedridden')
    ) {
      extracted.disabledCount = 1;
      conditions.push('PHYSICALLY_DISABLED');
    }

    // Location mention
    const locMatch = message.match(
      /(?:in|at|near|from)\s+([A-Z][a-zA-Z0-9\s,.-]+(?:Road|Street|Layout|Nagar|Block|Stage|Cross|Metro|Circle|Area))/i
    );
    if (locMatch) {
      extracted.spokenLocation = locMatch[1].trim();
    }

    extracted.conditions = conditions;

    let assistantMsg =
      "I have sent your emergency distress request to the disaster response command center. Our teams are triaging your location. Please stay in a safe, elevated spot. Are there any other people or specific medical needs?";
    if (context.activeSos) {
      assistantMsg = `I have updated your active emergency distress signal (#${context.activeSos.id}) with these details and notified dispatch teams. Please stay calm and remain in a safe location.`;
    }

    return {
      mode: 'EMERGENCY',
      intent: 'emergency_sos_dispatch',
      assistantResponse: assistantMsg,
      extractedInformation: extracted,
      existingIncidentFacts,
      uncertainInformation: uncertain,
      missingInformation: missing,
      questionTarget: 'vulnerabilities',
      shouldCreateOrUpdateSos: true,
      isFallbackExtractor: true,
    };
  }

  // Potential danger / ambiguous situation -> ASSESS mode
  let assessResponse: string;
  let missingInfo: string[];
  let target = 'situation_description';

  if (
    lastAssistantLower.includes('describe the situation') ||
    lastAssistantLower.includes('are you trapped, injured, or able to move')
  ) {
    assessResponse =
      "That's okay. Just tell me one thing: are you trapped right now? You can answer yes or no.";
    missingInfo = ['trapped_status'];
    target = 'trapped_status';
  } else if (
    lower.includes('water is entering') ||
    lower.includes('water entering') ||
    lower.includes('water inside')
  ) {
    assessResponse =
      "I hear that water is entering your house. Are you able to evacuate safely or move to a higher floor right now, or are you trapped or in immediate danger?";
    missingInfo = ['evacuation capability', 'water depth', 'number of individuals'];
    target = 'evacuation_and_danger';
  } else if (hasGeneralStuck || lower.includes('need help') || lower.includes('help')) {
    assessResponse =
      "I understand you are stuck and need help. Can you tell me what you are stuck in, what immediate danger you are facing, and your current location?";
    missingInfo = ['type of hazard', 'current location', 'number of individuals'];
    target = 'hazard_and_location';
  } else if (hasWaterMentioned) {
    assessResponse =
      "I hear that water is affecting your location. Are you able to evacuate safely right now, or are you trapped or in immediate danger?";
    missingInfo = ['evacuation capability', 'water depth', 'number of individuals'];
    target = 'evacuation_and_danger';
  } else {
    assessResponse =
      "Could you describe the situation or danger you are facing? Are you trapped, injured, or able to move to safety?";
    missingInfo = ['situation details', 'location', 'immediate hazard'];
    target = 'situation_description';
  }

  const uncertainInfo: string[] = [];
  if (hasSpeculation) {
    if (lower.includes('child') || lower.includes('kid') || lower.includes('baby') || lower.includes('infant')) {
      uncertainInfo.push('Possible children present (unconfirmed)');
    } else if (lower.includes('elderly') || lower.includes('grand')) {
      uncertainInfo.push('Possible elderly present (unconfirmed)');
    } else {
      uncertainInfo.push('Unconfirmed situation');
    }
  }

  return {
    mode: 'ASSESS',
    intent: 'assess_potential_danger',
    assistantResponse: assessResponse,
    extractedInformation: {},
    existingIncidentFacts,
    uncertainInformation: uncertainInfo,
    missingInformation: missingInfo,
    questionTarget: target,
    shouldCreateOrUpdateSos: false,
    isFallbackExtractor: true,
  };
}

/**
 * Safe resolver for Gemini API Key across diverse deployment environments.
 * Checks GEMINI_API_KEY, GOOGLE_API_KEY, GOOGLE_GENAI_API_KEY, VITE_GEMINI_API_KEY, VITE_GOOGLE_API_KEY.
 * Trims surrounding whitespace and quotes.
 */
export function getGeminiApiKey(): string | undefined {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENAI_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.VITE_GOOGLE_API_KEY,
  ];

  for (const raw of candidates) {
    if (raw && typeof raw === 'string') {
      let cleaned = raw.trim();
      if (
        (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))
      ) {
        cleaned = cleaned.slice(1, -1).trim();
      }
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  }

  return undefined;
}

/**
 * Normalizes browser-recorded MediaRecorder MIME types (e.g., 'audio/webm;codecs=opus')
 * into standard IANA MIME types explicitly supported by Gemini multimodal audio.
 */
export function normalizeAudioMimeType(rawMime?: string): string {
  if (!rawMime || typeof rawMime !== 'string') return 'audio/webm';
  const lower = rawMime.toLowerCase().trim();
  const base = lower.split(';')[0].trim();

  if (base.includes('webm')) return 'audio/webm';
  if (base.includes('ogg') || base.includes('opus')) return 'audio/ogg';
  if (base.includes('mp4') || base.includes('m4a') || base.includes('aac')) return 'audio/mp4';
  if (base.includes('wav')) return 'audio/wav';
  if (base.includes('mp3') || base.includes('mpeg')) return 'audio/mp3';
  if (base.includes('flac')) return 'audio/flac';

  return 'audio/webm';
}

/**
 * Robust JSON extractor that handles raw JSON, markdown-fenced code blocks (```json ... ```),
 * or JSON embedded within text. Never throws a SyntaxError.
 */
export function extractAndParseJson<T = any>(rawText?: string): T | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {}

  // 2. Markdown fenced block ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {}
  }

  // 3. Outermost curly braces { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    } catch {}
  }

  return null;
}

/**
 * Main Gemini-powered emergency processing function.
 * Leverages @google/genai with strict JSON response and graceful fallback.
 */
export async function processEmergencyVoiceInput(
  message: string,
  history: ChatMessage[],
  context: StrideContextData,
  existingIncidentFacts?: ExtractedEmergencyInfo,
  correlationId?: string
): Promise<VoiceAssistantOutput> {
  const apiKey = getGeminiApiKey();
  const reqId = correlationId || `req-srv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Safe server-side diagnostic logging (NEVER exposes API keys or secrets)
  console.log('[STRIDE Gemini Voice Input Structure]', {
    correlationId: reqId,
    historyLength: Array.isArray(history) ? history.length : 0,
    hasActiveSosInContext: !!context.activeSos,
    activeSosId: context.activeSos?.id || null,
    activeSosStatus: context.activeSos?.rescueStatus || null,
    existingIncidentFacts: existingIncidentFacts || null,
    messageLength: typeof message === 'string' ? message.length : 0,
    messagePreview: typeof message === 'string' ? message.slice(0, 80) : '',
    hasApiKey: !!apiKey,
  });

  // If no Gemini API key configured, use limited signal extractor
  if (!apiKey) {
    console.warn(
      `[STRIDE Gemini Voice] No Gemini API key detected in environment (id: ${reqId}). Checked: GEMINI_API_KEY, GOOGLE_API_KEY, GOOGLE_GENAI_API_KEY, VITE_GEMINI_API_KEY, VITE_GOOGLE_API_KEY. Using deterministic signal extractor.`
    );
    return limitedEmergencySignalExtractor(message, history, context, existingIncidentFacts);
  }

  const masked = apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '***';
  console.log(
    `[STRIDE Gemini Voice] API key detected (length: ${apiKey.length}, preview: ${masked}, id: ${reqId}). Processing message with gemini-2.5-flash...`
  );

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are the STRIDE Emergency Voice Assistant for Bengaluru, Karnataka, India during a disaster response operation.

CRITICAL CONVERSATION GROUNDING AND CONTEXT ISOLATION RULES:
1. Treat CURRENT CITIZEN MESSAGE strictly as what the citizen just said right now.
2. DO NOT confuse BACKGROUND DATABASE CONTEXT or EXISTING INCIDENT FACTS with what the citizen just said.
   - If there is an active SOS or existing incident facts in the database, it is historical record context from earlier.
   - "extractedInformation" MUST ONLY CONTAIN FACTS CONFIRMED IN CURRENT CITIZEN MESSAGE.
   - NEVER copy facts from EXISTING INCIDENT FACTS into "extractedInformation" unless the citizen explicitly restated or updated them right now in CURRENT CITIZEN MESSAGE!
   - If the citizen says "What should i do now", "ok", or "No cant describe", "extractedInformation" MUST BE EMPTY ({})!
3. CONVERSATIONAL PROGRESSION & ANTI-REPETITION RULES:
   - Always inspect the last message from the Assistant in CONVERSATION HISTORY.
   - NEVER repeat the exact same question or phrasing that the Assistant just asked in previous turns!
   - If the citizen responds with an affirmation or acknowledgment ("ok", "okay", "yes", "sure", "fine", "right"):
     * Contextualize their answer based on what the assistant asked!
     * If the assistant previously asked "Do you require emergency rescue assistance?", interpret "ok" as YES, they need rescue assistance!
     * If the assistant asked an open-ended question or the answer is vague, DO NOT repeat the same question.
     * Simplify to a single, direct yes/no question:
       "That's okay. Just tell me one thing: are you trapped right now? You can answer yes or no."
   - If the citizen says "No cant describe", "I don't know", "can't talk", or cannot describe:
     * NEVER repeat the request to describe their situation!
     * Empathetically adapt: "That's okay. You don't need to describe it. Are you able to move to a safer place? Yes or no."
     * Use ONLY confirmed facts already established. NEVER fabricate facts.
   - Ask ONE question at a time. Do not overwhelm the user with multiple simultaneous questions.
   - Specify "questionTarget" in JSON (e.g. "trapped_status", "safety_mobility", "medical_need", "people_count", "location", or "none").
4. NEVER assume, hallucinate, or state that water is entering, rising, or flooding UNLESS:
   - The citizen explicitly mentions water, flood, or submerged conditions in CURRENT CITIZEN MESSAGE or recent CONVERSATION HISTORY, OR
   - The citizen explicitly asks a question about flood safety.
   If the citizen says "hi im stuck i need help", they did NOT mention water! Ask what they are stuck in, what danger they are facing, and their current location. DO NOT claim that water is entering their area!
5. INTENT & MODE RULES:
   - "ASSIST": The citizen is greeting, asking what you can do, or asking general guidance/shelters/hospitals/weather/flood preparedness. Do NOT trigger SOS (shouldCreateOrUpdateSos = false).
   - "ASSESS": The citizen expresses ambiguous distress ("hi im stuck i need help", "ok") without confirmed trapped individuals or injuries. Ask a direct clarifying question. Do NOT trigger SOS (shouldCreateOrUpdateSos = false).
   - "EMERGENCY": Clear danger, trapped upstairs, water rising inside house, injuries, or explicit requests for rescue/boats. Set shouldCreateOrUpdateSos = true immediately.
6. FACT vs. SPECULATION:
   - If user confirms numbers -> extract into extractedInformation.
   - If user speculates ("I think", "maybe", "probably") -> place in uncertainInformation.
   - NEVER fabricate or assume numbers.
7. DO NOT calculate priority scores. Scores are computed exclusively by the backend deterministic algorithm.
8. Keep assistantResponse concise, empathetic, and grounded.

OUTPUT JSON FORMAT (You MUST return valid JSON matching this schema):
{
  "mode": "ASSIST" | "ASSESS" | "EMERGENCY",
  "intent": "string",
  "assistantResponse": "string",
  "questionTarget": "string",
  "extractedInformation": {
    "peopleCount": number,
    "childrenCount": number,
    "elderlyCount": number,
    "disabledCount": number,
    "injuredCount": number,
    "criticalMedicalNeed": boolean,
    "waterLevel": "LOW" | "MEDIUM" | "HIGH" | "EXTREME",
    "emergencyType": "FLOOD" | "MEDICAL" | "TRAPPED" | "STRUCTURAL_DANGER" | "OTHER",
    "conditions": string[],
    "spokenLocation": "string (if mentioned)"
  },
  "uncertainInformation": ["string"],
  "missingInformation": ["string"],
  "shouldCreateOrUpdateSos": boolean
}`;

    const formattedHistory =
      history && history.length > 0
        ? history.map((h) => `${h.role === 'user' ? 'Citizen' : 'Assistant'}: ${h.content}`).join('\n')
        : '(No previous messages in this session)';

    const prompt = `${systemPrompt}

=== DATABASE BACKGROUND CONTEXT (FOR REFERENCE ONLY - NOT CITIZEN STATEMENT) ===
- Active Disaster: ${context.activeDisaster?.title || 'Bengaluru Urban Disaster'} (${context.activeDisaster?.alertLevel || 'HIGH'} alert level)
- Citizen Home Address: ${context.citizenHousehold?.address || 'Bengaluru'}
- Active SOS In Database: ${context.activeSos ? `Active SOS #${context.activeSos.id} (Status: ${context.activeSos.rescueStatus}, Priority: ${context.activeSos.priorityScore})` : 'No active SOS'}
- Nearest Shelters: ${context.nearestShelters.map((s) => `${s.name} (${s.distanceKm}km, ${s.status})`).join(', ') || 'None listed'}
- Nearest Facilities: ${context.nearestFacilities.map((f) => `${f.name} (${f.distanceKm}km)`).join(', ') || 'None listed'}

=== EXISTING INCIDENT FACTS (FROM DATABASE - DO NOT DUPLICATE AS CURRENT STATEMENT) ===
${existingIncidentFacts && Object.keys(existingIncidentFacts).length > 0 ? JSON.stringify(existingIncidentFacts, null, 2) : 'None (no prior active SOS facts)'}

=== CONVERSATION HISTORY ===
${formattedHistory}

=== CURRENT CITIZEN MESSAGE ===
"${message}"

Return JSON:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    const parsed = extractAndParseJson(responseText);

    // Validate structured fields
    const validModes: VoiceEmergencyMode[] = ['ASSIST', 'ASSESS', 'EMERGENCY'];
    const mode: VoiceEmergencyMode = parsed && validModes.includes(parsed.mode) ? parsed.mode : 'ASSESS';

    return {
      mode,
      intent: parsed?.intent || 'emergency_voice_processing',
      assistantResponse:
        parsed?.assistantResponse ||
        (mode === 'EMERGENCY'
          ? "I have logged your emergency distress signal with our response units. Stay in a safe, elevated location."
          : "I am here with STRIDE Emergency Command. How can I assist you?"),
      extractedInformation: parsed?.extractedInformation || {},
      existingIncidentFacts,
      uncertainInformation: Array.isArray(parsed?.uncertainInformation) ? parsed.uncertainInformation : [],
      missingInformation: Array.isArray(parsed?.missingInformation) ? parsed.missingInformation : [],
      questionTarget: parsed?.questionTarget || undefined,
      shouldCreateOrUpdateSos: !!parsed?.shouldCreateOrUpdateSos && mode === 'EMERGENCY',
      isFallbackExtractor: false,
    };
  } catch (err: any) {
    console.error('Gemini Voice Service API error (falling back to limited signal extractor):', err.message);
    return limitedEmergencySignalExtractor(message, history, context, existingIncidentFacts);
  }
}

/**
 * Multimodal Gemini audio processing function.
 * Accepts an audio buffer (WebM/Opus, MP4, WAV), transcribes citizen speech verbatim,
 * determines intent/mode, extracts confirmed emergency facts vs uncertain speculation,
 * and passes to the STRIDE deterministic priority & SOS triage engine.
 */
export async function processEmergencyAudioInput(
  audioBuffer: Buffer,
  mimeType: string,
  history: ChatMessage[],
  context: StrideContextData,
  existingIncidentFacts?: ExtractedEmergencyInfo,
  correlationId?: string
): Promise<VoiceAudioAssistantOutput> {
  const apiKey = getGeminiApiKey();
  const cleanMimeType = normalizeAudioMimeType(mimeType);
  const reqId = correlationId || `req-srv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Safe server-side diagnostic logging (NEVER exposes API keys or secrets)
  console.log('[STRIDE Gemini Audio Input Structure]', {
    correlationId: reqId,
    historyLength: Array.isArray(history) ? history.length : 0,
    hasActiveSosInContext: !!context.activeSos,
    activeSosId: context.activeSos?.id || null,
    existingIncidentFacts: existingIncidentFacts || null,
    audioBufferSize: audioBuffer ? audioBuffer.length : 0,
    rawMimeType: mimeType,
    cleanMimeType,
    hasApiKey: !!apiKey,
  });

  if (!audioBuffer || audioBuffer.length === 0) {
    console.warn(`[STRIDE Gemini Audio] Empty audio buffer received (id: ${reqId})`);
    return {
      transcript: '',
      mode: 'ASSIST',
      intent: 'empty_audio',
      assistantResponse:
        "No audio was detected in your recording. Please tap the microphone and speak again, or type your message below.",
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: [],
      missingInformation: [],
      questionTarget: 'none',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // Defensive: check for ultra-short buffers (< 200 bytes) which are empty container headers
  if (audioBuffer.length < 200) {
    console.warn(`[STRIDE Gemini Audio] Recording too short (${audioBuffer.length} bytes, id: ${reqId}).`);
    return {
      transcript: '',
      mode: 'ASSIST',
      intent: 'recording_too_short',
      assistantResponse:
        "Your audio recording was too brief to detect speech. Please tap the microphone and speak your message, or type below.",
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: [],
      missingInformation: [],
      questionTarget: 'none',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // If no Gemini API key configured, use safe deterministic fallback
  if (!apiKey) {
    const presentKeys = Object.keys(process.env).filter((k) =>
      /gemini|google|key|ai/i.test(k)
    );
    console.warn(
      `[STRIDE Gemini Audio] No Gemini API key detected in environment (id: ${reqId}). Checked: GEMINI_API_KEY, GOOGLE_API_KEY, GOOGLE_GENAI_API_KEY, VITE_GEMINI_API_KEY, VITE_GOOGLE_API_KEY. Detected matching env keys: [${presentKeys.join(', ')}]. Using safe fallback.`
    );
    return {
      transcript: '(Spoken audio received)',
      mode: 'ASSESS',
      intent: 'offline_audio_received',
      assistantResponse:
        "Voice audio received. Automated audio transcription requires Gemini API connectivity. If you need emergency rescue, please tap the Emergency SOS button or type below.",
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: ['Voice audio received while online transcription service is unconfigured'],
      missingInformation: ['rescue capability', 'location', 'people count'],
      questionTarget: 'none',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  const masked = apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '***';
  console.log(
    `[STRIDE Gemini Audio] API key resolved (length: ${apiKey.length}, preview: ${masked}). Audio payload: ${audioBuffer.length} bytes, clean MIME: ${cleanMimeType}, id: ${reqId}. Calling gemini-2.5-flash...`
  );

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are the STRIDE Emergency Voice Assistant for Bengaluru, Karnataka, India during a disaster response operation.
You are listening to an audio recording spoken by a citizen.

CRITICAL CONVERSATION GROUNDING AND CONTEXT ISOLATION RULES:
1. Transcribe the citizen's spoken words verbatim into the "transcript" field.
2. Ground your evaluation strictly on the spoken audio.
3. DO NOT confuse BACKGROUND DATABASE CONTEXT or EXISTING INCIDENT FACTS with what the citizen just said.
   - If there is an active SOS or existing incident facts in the database, it is historical record context.
   - "extractedInformation" MUST ONLY CONTAIN FACTS CONFIRMED IN THE SPOKEN AUDIO.
   - NEVER copy facts from EXISTING INCIDENT FACTS into "extractedInformation" unless the citizen explicitly restates them in the audio!
4. CONVERSATIONAL PROGRESSION & ANTI-REPETITION RULES:
   - Always inspect the last message from the Assistant in CONVERSATION HISTORY.
   - NEVER repeat the exact same question or phrasing that the Assistant just asked in previous turns!
   - If the citizen responds with an affirmation ("ok", "yes", "sure", "fine"):
     * Contextualize their answer based on what the assistant asked!
     * Simplify to a single, direct yes/no question:
       "That's okay. Just tell me one thing: are you trapped right now? You can answer yes or no."
   - If the citizen says "No cant describe", "I don't know", or cannot describe:
     * NEVER repeat the request to describe!
     * Empathetically adapt: "That's okay. You don't need to describe it. Are you able to move to a safer place? Yes or no."
   - Specify "questionTarget" in JSON (e.g. "trapped_status", "safety_mobility", "medical_need", "people_count", "location", or "none").
5. NEVER assume, hallucinate, or state that water is entering, rising, or flooding UNLESS:
   - The citizen explicitly mentions water, flood, or submerged conditions in the audio or recent CONVERSATION HISTORY, OR
   - The citizen explicitly asks a question about flood safety.
6. INTENT & MODE RULES:
   - "ASSIST": Greetings, asking what you can do, or general safety guidance. Do NOT trigger SOS.
   - "ASSESS": Ambiguous distress without confirmed trapped individuals or injuries. Ask a direct clarifying question. Do NOT trigger SOS.
   - "EMERGENCY": Clear danger, trapped upstairs, water rising inside house, injuries, or requests for rescue. Set shouldCreateOrUpdateSos = true immediately.
7. FACT vs. SPECULATION:
   - Confirmed numbers -> extract into extractedInformation.
   - Speculation ("I think", "maybe") -> place in uncertainInformation.
   - NEVER fabricate numbers.
8. DO NOT calculate priority scores.
9. Keep assistantResponse concise, empathetic, and grounded.

OUTPUT JSON FORMAT (You MUST return valid JSON matching this schema):
{
  "transcript": "string (verbatim transcript of citizen's spoken words in the audio)",
  "mode": "ASSIST" | "ASSESS" | "EMERGENCY",
  "intent": "string",
  "assistantResponse": "string",
  "questionTarget": "string",
  "extractedInformation": {
    "peopleCount": number,
    "childrenCount": number,
    "elderlyCount": number,
    "disabledCount": number,
    "injuredCount": number,
    "criticalMedicalNeed": boolean,
    "waterLevel": "LOW" | "MEDIUM" | "HIGH" | "EXTREME",
    "emergencyType": "FLOOD" | "MEDICAL" | "TRAPPED" | "STRUCTURAL_DANGER" | "OTHER",
    "conditions": ["string"],
    "spokenLocation": "string (if mentioned)"
  },
  "uncertainInformation": ["string"],
  "missingInformation": ["string"],
  "shouldCreateOrUpdateSos": boolean
}`;

    const formattedHistory =
      history && history.length > 0
        ? history.map((h) => `${h.role === 'user' ? 'Citizen' : 'Assistant'}: ${h.content}`).join('\n')
        : '(No previous messages in this session)';

    const prompt = `${systemPrompt}

=== DATABASE BACKGROUND CONTEXT (FOR REFERENCE ONLY - NOT CITIZEN STATEMENT) ===
- Active Disaster: ${context.activeDisaster?.title || 'Bengaluru Urban Disaster'} (${context.activeDisaster?.alertLevel || 'HIGH'} alert level)
- Citizen Home Address: ${context.citizenHousehold?.address || 'Bengaluru'}
- Active SOS In Database: ${context.activeSos ? `Active SOS #${context.activeSos.id} (Status: ${context.activeSos.rescueStatus}, Priority: ${context.activeSos.priorityScore})` : 'No active SOS'}
- Nearest Shelters: ${context.nearestShelters.map((s) => `${s.name} (${s.distanceKm}km, ${s.status})`).join(', ') || 'None listed'}
- Nearest Facilities: ${context.nearestFacilities.map((f) => `${f.name} (${f.distanceKm}km)`).join(', ') || 'None listed'}

=== EXISTING INCIDENT FACTS (FROM DATABASE - DO NOT DUPLICATE AS CURRENT STATEMENT) ===
${existingIncidentFacts && Object.keys(existingIncidentFacts).length > 0 ? JSON.stringify(existingIncidentFacts, null, 2) : 'None (no prior active SOS facts)'}

=== CONVERSATION HISTORY ===
${formattedHistory}

Analyze the citizen's audio recording and return the JSON response:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: audioBuffer.toString('base64'),
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    const parsed = extractAndParseJson(responseText);

    const validModes: VoiceEmergencyMode[] = ['ASSIST', 'ASSESS', 'EMERGENCY'];
    const mode: VoiceEmergencyMode = parsed && validModes.includes(parsed.mode) ? parsed.mode : 'ASSESS';

    let transcript = '';
    if (parsed && typeof parsed.transcript === 'string') {
      transcript = parsed.transcript.trim();
    } else if (responseText && !parsed) {
      transcript = responseText.trim();
    }

    return {
      transcript,
      mode,
      intent: parsed?.intent || 'voice_audio_processing',
      assistantResponse:
        parsed?.assistantResponse ||
        (mode === 'EMERGENCY'
          ? "I have logged your emergency distress signal with our response units. Stay in a safe, elevated location."
          : "I am here with STRIDE Emergency Command. How can I assist you?"),
      extractedInformation: parsed?.extractedInformation || {},
      existingIncidentFacts,
      uncertainInformation: Array.isArray(parsed?.uncertainInformation) ? parsed.uncertainInformation : [],
      missingInformation: Array.isArray(parsed?.missingInformation) ? parsed.missingInformation : [],
      questionTarget: parsed?.questionTarget || undefined,
      shouldCreateOrUpdateSos: !!parsed?.shouldCreateOrUpdateSos && mode === 'EMERGENCY',
      isFallbackExtractor: false,
    };
  } catch (err: any) {
    console.error('[STRIDE Gemini Audio Error] Full failure details:', {
      correlationId: reqId,
      model: 'gemini-2.5-flash',
      apiKeyResolved: !!apiKey,
      receivedMimeType: mimeType,
      cleanMimeType,
      bufferSizeBytes: audioBuffer.length,
      errorMessage: err?.message,
      errorStatus: err?.status,
      statusCode: err?.statusCode,
      errorCode: err?.code,
      errorDetails: err?.details,
    });
    return {
      transcript: '(Spoken audio received)',
      mode: 'ASSESS',
      intent: 'audio_processing_error',
      assistantResponse:
        "I was unable to fully process the audio recording. If this is an emergency, please type your message or tap the Emergency SOS button immediately.",
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: ['Audio processing encountered an error'],
      missingInformation: ['rescue capability', 'location'],
      questionTarget: 'none',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }
}

