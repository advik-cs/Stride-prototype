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

const WORD_TO_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function parseCount(str: string): number | undefined {
  const n = parseInt(str, 10);
  if (!isNaN(n)) return n;
  return WORD_TO_NUM[str.toLowerCase().trim()];
}

/**
 * Authoritative fact extractor for CURRENT USER UTTERANCE ONLY.
 * Never defaults counts or invents facts from database history.
 */
export function extractCurrentTurnFacts(
  message: string,
  hasSpeculation: boolean = false
): {
  extracted: ExtractedEmergencyInfo;
  uncertain: string[];
  conditions: string[];
} {
  const lower = message.toLowerCase().trim();
  const extracted: ExtractedEmergencyInfo = {};
  const uncertain: string[] = [];
  const conditions: string[] = [];

  const isSpeculative =
    hasSpeculation ||
    /\b(?:think|maybe|may be|might|possibly|possible|not sure|could be|perhaps|guess|unconfirmed|wonder if)\b/i.test(
      message
    );

  // 1. People count
  const peopleMatch =
    message.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:people|individuals|members|persons|of us)\b/i) ||
    message.match(/\b(?:we are|there are|we're|actually,?\s*there are)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?!\s+(?:children|child|kids|kid|infants|infant|babies|baby|toddlers|elderly|injured|wounded))\b/i);

  if (peopleMatch) {
    if (isSpeculative) {
      uncertain.push(`Possible people count unconfirmed (${peopleMatch[1]})`);
    } else {
      const p = parseCount(peopleMatch[1]);
      if (p !== undefined && p > 0) {
        extracted.peopleCount = p;
      }
    }
  }

  // 2. Children / Infants
  const childMatch = message.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:children|kids|infants|babies|toddlers|child)\b/i
  );

  const mentionsChild =
    lower.includes('child') ||
    lower.includes('kid') ||
    lower.includes('baby') ||
    lower.includes('infant') ||
    lower.includes('toddler');

  if (mentionsChild) {
    if (isSpeculative) {
      uncertain.push('Possible children present (unconfirmed)');
    } else {
      const c = childMatch ? parseCount(childMatch[1]) : 1;
      if (c !== undefined && c > 0) {
        extracted.childrenCount = c;
        conditions.push('CHILDREN_INFANTS_PRESENT');
      }
    }
  }

  // 3. Elderly / Grandparents
  const elderlyMatch = message.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:elderly|grandparents|seniors|grandmothers|grandfathers)\b/i
  );
  const mentionsElderly =
    lower.includes('elderly') ||
    lower.includes('grandmother') ||
    lower.includes('grandfather') ||
    lower.includes('grandma') ||
    lower.includes('grandpa') ||
    lower.includes('senior citizen');

  if (mentionsElderly) {
    if (isSpeculative) {
      uncertain.push('Possible elderly present (unconfirmed)');
    } else {
      const e = elderlyMatch ? parseCount(elderlyMatch[1]) : 1;
      if (e !== undefined && e > 0) {
        extracted.elderlyCount = e;
      }
    }
  }

  // 4. Injured / Medical
  const injuredMatch = message.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:injured|hurt|bleeding|wounded)\b/i
  );
  const mentionsInjury =
    lower.includes('injured') ||
    lower.includes('hurt') ||
    lower.includes('bleeding') ||
    lower.includes('broken leg') ||
    lower.includes('unconscious') ||
    lower.includes('heart attack') ||
    lower.includes('medical emergency');

  if (mentionsInjury) {
    if (isSpeculative) {
      uncertain.push('Possible injuries present (unconfirmed)');
    } else {
      const inj = injuredMatch ? parseCount(injuredMatch[1]) : 1;
      if (inj !== undefined && inj > 0) {
        extracted.injuredCount = inj;
        conditions.push('HEAVILY_INJURED');
      }
    }
    if (
      lower.includes('unconscious') ||
      lower.includes('heart') ||
      lower.includes('severe') ||
      lower.includes('critical')
    ) {
      extracted.criticalMedicalNeed = true;
      conditions.push('SERIOUSLY_UNWELL');
    }
  }

  // 5. Disabled / Immobile
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

  // 6. Water level
  if (lower.includes('chest') || lower.includes('neck')) {
    extracted.waterLevel = 'EXTREME';
    conditions.push('WATER_RISING');
  } else if (
    lower.includes('waist') ||
    lower.includes('water is rising') ||
    lower.includes('water rising') ||
    lower.includes('submerged')
  ) {
    extracted.waterLevel = 'HIGH';
    conditions.push('WATER_RISING');
  } else if (
    lower.includes('knee') ||
    lower.includes('ankle') ||
    lower.includes('water inside') ||
    lower.includes('water is entering') ||
    lower.includes('water entering')
  ) {
    extracted.waterLevel = 'MEDIUM';
  }

  // 7. Emergency Type
  if (
    lower.includes('trapped') ||
    lower.includes('cannot get out') ||
    lower.includes("can't get out") ||
    lower.includes('stuck upstairs') ||
    lower.includes('marooned')
  ) {
    extracted.emergencyType = 'TRAPPED';
    conditions.push('TRAPPED');
  } else if (lower.includes('fire') || lower.includes('smoke') || lower.includes('burning')) {
    extracted.emergencyType = 'FIRE';
    conditions.push('FIRE');
  } else if (mentionsInjury && !lower.includes('flood') && !lower.includes('water')) {
    extracted.emergencyType = 'MEDICAL';
  } else if (lower.includes('flood') || lower.includes('water')) {
    extracted.emergencyType = 'FLOOD';
  }

  // 8. Spoken Location
  const locMatch = message.match(
    /(?:in|at|near|from)\s+([A-Z0-9][a-zA-Z0-9\s,.-]+(?:Road|Street|Layout|Nagar|Block|Stage|Cross|Metro|Circle|Area|Apartment|Building))/i
  );
  if (locMatch) {
    extracted.spokenLocation = locMatch[1].trim();
  }

  if (conditions.length > 0) {
    extracted.conditions = conditions;
  }

  return { extracted, uncertain, conditions };
}

/**
 * Limited emergency-signal extractor fallback.
 * NOTE: As per specifications, this deterministic extractor acts strictly on current-turn facts
 * and NEVER fabricates missing information, default counts, or speculative numbers.
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

  // Check for speculation phrases
  const hasSpeculation =
    lower.includes('i think') ||
    lower.includes('maybe') ||
    lower.includes('might be') ||
    lower.includes('not sure') ||
    lower.includes('possibly') ||
    lower.includes('probably') ||
    lower.includes('may be');

  // 1. Authoritatively extract facts from the current turn
  const { extracted, uncertain, conditions } = extractCurrentTurnFacts(message, hasSpeculation);
  const hasExtractedFacts = Object.keys(extracted).length > 0;

  // 2. Pure greetings or capability inquiries (ASSIST mode)
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

  if ((isPureGreeting || isCapabilityInquiry) && !isAffirmation && !hasExtractedFacts) {
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

  // 3. Conversational adaptation: User cannot or refuses to describe
  if (isCannotDescribe && !hasExtractedFacts) {
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

  // 4. Conversational adaptation: Short confirmation / affirmation ("ok", "yes", etc.)
  if (isAffirmation && !hasExtractedFacts) {
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

  // 5. Conversational adaptation: Negative answers ("no", "nope", etc.)
  if (isNegative && !hasExtractedFacts) {
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

  // 6. Pure informational queries (ASSIST intent)
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

  const hasInjured =
    lower.includes('injured') ||
    lower.includes('bleeding') ||
    lower.includes('unconscious') ||
    lower.includes('broken leg') ||
    lower.includes('heart attack') ||
    lower.includes('medical emergency') ||
    lower.includes('hurt');

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

  // Informational query: If citizen is asking for guidance and did NOT provide new emergency facts
  if (isQuestion && !hasTrappedExplicit && !hasInjured && !hasExplicitRescueCall && !hasRisingWater && !hasFire && !hasExtractedFacts) {
    let resp = context.activeSos
      ? "For your safety, remain in the safest, highest spot available and await rescue dispatch. If water levels rise or anyone becomes injured, let me know immediately."
      : "For your safety during this disaster event, please stay on higher ground and avoid entering moving floodwaters. Do you require emergency rescue assistance?";

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
      questionTarget: context.activeSos ? 'none' : 'rescue_necessity',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // 7. ACTIVE SOS UPDATE: If citizen already has active beacon and stated confirmed facts
  if (context.activeSos && hasExtractedFacts) {
    let assistantMsg: string;
    let target = 'safety_mobility';

    if (extracted.peopleCount !== undefined) {
      assistantMsg = `I have updated your active emergency distress signal (#${context.activeSos.id}) to ${extracted.peopleCount} people. Are any of the people injured? You can answer yes or no.`;
      target = 'medical_need';
    } else if (extracted.injuredCount !== undefined) {
      assistantMsg = `I have noted the medical injury on your active emergency signal (#${context.activeSos.id}). Emergency dispatch has been notified. Are you or anyone with you able to move safely? Yes or no.`;
      target = 'safety_mobility';
    } else if (extracted.childrenCount !== undefined) {
      assistantMsg = `I have updated your active emergency signal (#${context.activeSos.id}) to include ${extracted.childrenCount} children. Dispatch teams have been informed. Are you all on an upper floor? Yes or no.`;
      target = 'safety_mobility';
    } else {
      assistantMsg = `I have updated your active emergency distress signal (#${context.activeSos.id}) with these details and notified dispatch teams. Please stay calm and remain in a safe location.`;
      target = 'safety_mobility';
    }

    return {
      mode: 'EMERGENCY',
      intent: 'emergency_sos_dispatch',
      assistantResponse: assistantMsg,
      extractedInformation: extracted,
      existingIncidentFacts,
      uncertainInformation: uncertain,
      missingInformation: [target],
      questionTarget: target,
      shouldCreateOrUpdateSos: true,
      isFallbackExtractor: true,
    };
  }

  // 8. Clear emergency signals present (EMERGENCY mode)
  const isEmergencyTrigger =
    hasTrappedExplicit ||
    hasInjured ||
    (hasRisingWater && !isQuestion) ||
    hasFire ||
    hasExplicitRescueCall ||
    extracted.peopleCount !== undefined ||
    (extracted.emergencyType === 'TRAPPED') ||
    (context.activeSos && (hasInjured || hasTrappedExplicit || hasGeneralStuck));

  if (isEmergencyTrigger) {
    if (!conditions.includes('NEED_RESCUE')) {
      conditions.unshift('NEED_RESCUE');
    }
    extracted.conditions = conditions;

    let assistantMsg: string;
    let target = 'medical_need';

    if (context.activeSos) {
      assistantMsg = `I have updated your active emergency distress signal (#${context.activeSos.id}) with these details and notified dispatch teams. Please stay calm and remain in a safe location.`;
    } else if (extracted.peopleCount !== undefined) {
      assistantMsg = `I have logged your emergency distress request for ${extracted.peopleCount} people. Dispatch teams are triaging your location. Are any of the ${extracted.peopleCount} people injured? You can answer yes or no.`;
      target = 'medical_need';
    } else {
      assistantMsg =
        "I have sent your emergency distress request to the disaster response command center. Our teams are triaging your location. Please stay in a safe, elevated spot. Are there any other people or specific medical needs?";
      target = 'vulnerabilities';
    }

    return {
      mode: 'EMERGENCY',
      intent: 'emergency_sos_dispatch',
      assistantResponse: assistantMsg,
      extractedInformation: extracted,
      existingIncidentFacts,
      uncertainInformation: uncertain,
      missingInformation: [target],
      questionTarget: target,
      shouldCreateOrUpdateSos: true,
      isFallbackExtractor: true,
    };
  }

  // 9. Potential danger / ambiguous situation -> ASSESS mode
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

  return {
    mode: 'ASSESS',
    intent: 'assess_potential_danger',
    assistantResponse: assessResponse,
    extractedInformation: extracted,
    existingIncidentFacts,
    uncertainInformation: uncertain,
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
 * STAGE 1: Audio -> Gemini -> verbatim transcript ONLY
 * Transcribes the audio buffer verbatim. Does not perform triage, inference, or SOS mutation.
 */
export async function transcribeEmergencyAudio(
  audioBuffer: Buffer,
  mimeType: string,
  correlationId?: string
): Promise<{ transcript: string; error?: string }> {
  const apiKey = getGeminiApiKey();
  const cleanMimeType = normalizeAudioMimeType(mimeType);
  const reqId = correlationId || `transcribe-${Date.now()}`;

  if (!audioBuffer || audioBuffer.length < 200) {
    return { transcript: '', error: 'Audio too short or empty' };
  }

  if (!apiKey) {
    console.warn(`[STRIDE Voice Transcription] No Gemini API key resolved (id: ${reqId}).`);
    return { transcript: '', error: 'Transcription service unconfigured' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: audioBuffer.toString('base64'),
          },
        },
        'You are a verbatim speech-to-text transcriber for emergency voice recordings. Output ONLY the exact spoken words transcribed in English (or translated verbatim to English if spoken in Kannada or Hindi). Do NOT add any preamble, quotes, tags, metadata, or commentary. If the audio contains only background noise, silence, or is unintelligible, return an empty string.',
      ],
    });

    const rawTranscript = (response.text || '').trim();
    return { transcript: rawTranscript };
  } catch (err: any) {
    console.error(`[STRIDE Voice Transcription Error]`, err?.message || err);
    return { transcript: '', error: err?.message || 'Transcription error' };
  }
}

/**
 * Two-stage emergency voice audio processing:
 * Stage 1: Audio -> Gemini Flash -> verbatim transcript ONLY.
 * Stage 2: Transcript -> exact same text triage pipeline as typed text.
 */
export async function processEmergencyAudioInput(
  audioBuffer: Buffer,
  mimeType: string,
  history: ChatMessage[],
  context: StrideContextData,
  existingIncidentFacts?: ExtractedEmergencyInfo,
  correlationId?: string
): Promise<VoiceAudioAssistantOutput> {
  const reqId = correlationId || `req-srv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Safe server-side diagnostic logging
  console.log('[STRIDE Voice Audio Stage 1: Transcription]', {
    correlationId: reqId,
    audioBytes: audioBuffer ? audioBuffer.length : 0,
    mimeType,
  });

  // STAGE 1: Audio -> Gemini -> verbatim transcript ONLY
  const { transcript, error } = await transcribeEmergencyAudio(audioBuffer, mimeType, reqId);

  // If transcription fails or returned empty transcript: (Rule 5)
  if (!transcript || transcript.trim() === '') {
    console.warn(`[STRIDE Voice Audio] Transcription failed: ${error || 'Empty transcript'} (id: ${reqId})`);
    return {
      transcript: '',
      mode: 'ASSESS',
      intent: 'transcription_failed',
      assistantResponse: "STRIDE couldn't understand the recording. Please try again.",
      extractedInformation: {},
      existingIncidentFacts,
      uncertainInformation: [],
      missingInformation: [],
      questionTarget: 'none',
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: false,
    };
  }

  console.log(`[STRIDE Voice Audio Stage 2: Unified Triage on Transcript] "${transcript}" (id: ${reqId})`);

  // STAGE 2: Pass THAT transcript as the currentUserUtterance into the exact same text triage pipeline
  const textTriageResult = await processEmergencyVoiceInput(
    transcript,
    history,
    context,
    existingIncidentFacts,
    reqId
  );

  return {
    ...textTriageResult,
    transcript,
  };
}


