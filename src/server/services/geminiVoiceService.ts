import { GoogleGenAI } from '@google/genai';
import { StrideContextData } from './strideContextService.ts';

export type VoiceEmergencyMode = 'ASSIST' | 'ASSESS' | 'EMERGENCY';

export type AudioFailureStage =
  | 'MIC_PERMISSION'
  | 'MEDIA_RECORDER'
  | 'EMPTY_RECORDING'
  | 'UPLOAD'
  | 'MULTIPART_PARSE'
  | 'AUDIO_BUFFER'
  | 'GEMINI_AUTH'
  | 'GEMINI_REQUEST'
  | 'GEMINI_RESPONSE'
  | 'TRANSCRIPT_PARSE'
  | 'EMPTY_TRANSCRIPT'
  | 'TRIAGE';

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
  unableToMove?: boolean;
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
  failureStage?: AudioFailureStage;
  diagnosticReason?: string;
}

export interface GroundedResponseInput {
  currentUserUtterance: string;
  confirmedIncidentFacts?: ExtractedEmergencyInfo;
  extractedCurrentTurnFacts?: ExtractedEmergencyInfo;
  uncertainInformation?: string[];
  missingInformation?: string[];
  conversationHistory?: ChatMessage[];
  context?: StrideContextData;
  intent?: string;
  mode?: VoiceEmergencyMode;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const WORD_TO_NUM: Record<string, number> = {
  zero: 0,
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
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

export function parseCount(str: string): number | undefined {
  if (!str) return undefined;
  const cleaned = str.toLowerCase().trim().replace(/[-_]/g, ' ');
  const n = parseInt(cleaned, 10);
  if (!isNaN(n)) return n;
  if (WORD_TO_NUM[cleaned] !== undefined) return WORD_TO_NUM[cleaned];
  const parts = cleaned.split(/\s+/);
  if (parts.length === 2 && WORD_TO_NUM[parts[0]] !== undefined && WORD_TO_NUM[parts[1]] !== undefined) {
    return WORD_TO_NUM[parts[0]] + WORD_TO_NUM[parts[1]];
  }
  return undefined;
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

  const NUM_WORDS = '(\\d+|' + Object.keys(WORD_TO_NUM).join('|') + ')';
  const VULNERABILITY_WORDS =
    '(?:injured|hurt|bleeding|wounded|injuries|injury|sick|unwell|dead|casualt|children|child|kids|kid|infants|infant|babies|baby|toddlers|elderly|grandparents|seniors|disabled|wheelchair|unconscious)';

  // 0. Immobility & Entrapment extraction
  const unableToMoveRegex =
    /\b(?:(?:we|i|none\s+of\s+us|they|all\s+of\s+us)\s+(?:can(?:'t|not)|cannot|can\s+not|are\s+unable\s+to|am\s+unable\s+to|is\s+unable\s+to)\s+move|none\s+of\s+us\s+can\s+move|unable\s+to\s+move|can't\s+move|cannot\s+move|cannot\s+get\s+out|can't\s+get\s+out|stuck\s+upstairs|trapped\s+upstairs|we\s+are\s+stuck|we're\s+stuck)\b/i;
  const isUnableToMove = unableToMoveRegex.test(message);
  if (isUnableToMove) {
    extracted.unableToMove = true;
    extracted.emergencyType = 'TRAPPED';
    if (!conditions.includes('TRAPPED')) {
      conditions.push('TRAPPED');
    }
  }

  // 1. People count
  // Pattern A: "X of the Y people" (e.g. "two of the four people are injured") -> Y is total count!
  const subsetOfTotalPeopleMatch = message.match(
    new RegExp(
      `\\b${NUM_WORDS}\\s+(?:out\\s+of|of)\\s+(?:the\\s+)?${NUM_WORDS}\\s+(?:people|individuals|members|persons)\\b`,
      'i'
    )
  );

  // Pattern B: Explicit total count phrases
  // e.g. "we are four people", "there are four of us", "now we are 5", "actually there are five people"
  // Lookahead ensures the count is not immediately followed by an injury or vulnerability word (e.g. "there are two of us injured")
  const totalCountMatches = Array.from(
    message.matchAll(
      new RegExp(
        `\\b(?:we\\s+are|there\\s+are|we're|actually,?\\s*there\\s+are|now\\s+we\\s+are|together\\s+we\\s+are|total\\s+of)\\s+${NUM_WORDS}\\b(?!\\s*(?:of\\s+us\\s+|people\\s+|individuals\\s+|members\\s+)?(?:are|is|got|were|who\\s+are|have\\s+been)?\\s*${VULNERABILITY_WORDS})(?:\\s+of\\s+us|\\s+people|\\s+individuals|\\s+members|\\s+persons)?\\b`,
        'gi'
      )
    )
  );

  // Pattern C: Standalone "N people/individuals/members/persons" not followed by vulnerability
  // and not preceded by "of the / out of"
  const standalonePeopleMatches = Array.from(
    message.matchAll(
      new RegExp(
        `(?:^|[^a-z0-9])${NUM_WORDS}\\s+(?:people|individuals|members|persons)\\b(?!\\s*(?:are|is|got|were|who\\s+are|have\\s+been)?\\s*${VULNERABILITY_WORDS})`,
        'gi'
      )
    )
  ).filter((m) => {
    const prefix = message.slice(0, m.index);
    return !/\b(?:of|out\s+of)\s+(?:the\s+)?$/i.test(prefix);
  });

  let pVal: number | undefined = undefined;
  let pRaw: string | undefined = undefined;

  if (subsetOfTotalPeopleMatch) {
    pRaw = subsetOfTotalPeopleMatch[2];
    pVal = parseCount(pRaw);
  } else if (totalCountMatches.length > 0) {
    const last = totalCountMatches[totalCountMatches.length - 1];
    pRaw = last[1];
    pVal = parseCount(pRaw);
  } else if (standalonePeopleMatches.length > 0) {
    const last = standalonePeopleMatches[standalonePeopleMatches.length - 1];
    pRaw = last[1];
    pVal = parseCount(pRaw);
  }

  if (pVal !== undefined && pVal > 0) {
    if (isSpeculative) {
      uncertain.push(`Possible people count unconfirmed (${pRaw})`);
    } else {
      extracted.peopleCount = pVal;
    }
  }

  // 2. Children / Infants
  const childMatch = message.match(
    new RegExp(`\\b${NUM_WORDS}\\s*(?:children|kids|infants|babies|toddlers|child)\\b`, 'i')
  );

  const mentionsChild =
    lower.includes('child') ||
    lower.includes('kid') ||
    lower.includes('baby') ||
    lower.includes('infant') ||
    lower.includes('toddler');

  const isNegativeChildren =
    /\b(?:no|zero|0|none\s+of\s+the|not\s+any)\s+(?:children|child|kids|kid|infants|babies)\b/i.test(message) ||
    /\b(?:no\s*children|no\s*kids)\b/i.test(message);

  if (isNegativeChildren) {
    extracted.childrenCount = 0;
  } else if (mentionsChild) {
    if (isSpeculative) {
      uncertain.push('Possible children present (unconfirmed)');
    } else {
      const c = childMatch ? parseCount(childMatch[1]) : 1;
      if (c !== undefined && c >= 0) {
        extracted.childrenCount = c;
      }
      if (!conditions.includes('CHILDREN_INFANTS_PRESENT')) {
        conditions.push('CHILDREN_INFANTS_PRESENT');
      }
    }
  }

  // 3. Elderly / Grandparents
  const elderlyMatch = message.match(
    new RegExp(`\\b${NUM_WORDS}\\s*(?:elderly|grandparents|seniors|grandmothers|grandfathers)\\b`, 'i')
  );
  const mentionsElderly =
    lower.includes('elderly') ||
    lower.includes('grandmother') ||
    lower.includes('grandfather') ||
    lower.includes('grandma') ||
    lower.includes('grandpa') ||
    lower.includes('senior citizen');

  const isNegativeElderly =
    /\b(?:no|zero|0|none\s+of\s+the|not\s+any)\s+(?:elderly|seniors|grandparents)\b/i.test(message);

  if (isNegativeElderly) {
    extracted.elderlyCount = 0;
  } else if (mentionsElderly) {
    if (isSpeculative) {
      uncertain.push('Possible elderly present (unconfirmed)');
    } else {
      const e = elderlyMatch ? parseCount(elderlyMatch[1]) : 1;
      if (e !== undefined && e >= 0) {
        extracted.elderlyCount = e;
      }
    }
  }

  // 4. Injured / Medical
  const isNegativeInjury =
    /\b(?:no\s*one|nobody|none|not\s+(?:any|the|\d+|one|two|three|four|five|six|seven|eight|nine|ten|all|anyone|anybody)|zero|0)\b.*?\b(?:injured|hurt|bleeding|wounded|injuries|injury)\b/i.test(message) ||
    /\b(?:no|without|zero|0)\s+(?:injuries|injury|bleeding|wounds?)\b/i.test(message) ||
    /\b(?:i'?m|we'?re|they'?re|she'?s|he'?s|it'?s)?\s*(?:not|aren't|isn't|are\s+not|is\s+not|was\s+not|were\s+not)\s+(?:injured|hurt|bleeding|wounded)\b/i.test(message) ||
    /\buninjured\b/i.test(message) ||
    /\b(?:nobody|no\s*one|none\s+of\s+us)\s+(?:got|is|was|were)\s+(?:hurt|injured|wounded)\b/i.test(message);

  const mentionsCriticalMedical =
    lower.includes('unconscious') ||
    lower.includes('heart') ||
    lower.includes('severe') ||
    lower.includes('critical') ||
    lower.includes('seriously unwell') ||
    lower.includes('unwell') ||
    lower.includes('seizure') ||
    lower.includes('stroke') ||
    lower.includes('diabetic');

  const isNegativeCriticalMedical =
    /\b(?:no\s*one|nobody|none)\s+(?:is|are|was|were)\s+(?:seriously\s+unwell|unwell|unconscious|critical)\b/i.test(message) ||
    /\b(?:not|isn't|aren't|is\s+not|are\s+not)\s+(?:seriously\s+unwell|unwell|unconscious|critical)\b/i.test(message);

  if (mentionsCriticalMedical && !isNegativeCriticalMedical) {
    extracted.criticalMedicalNeed = true;
    conditions.push('SERIOUSLY_UNWELL');
  }

  // Check explicit count of injured people:
  // 1. "X of the Y people are injured" -> X is injured count
  const subsetOfTotalInjuredMatch = message.match(
    new RegExp(
      `\\b${NUM_WORDS}\\s+(?:out\\s+of|of)\\s+(?:the\\s+)?(?:${NUM_WORDS})?\\s*(?:people|individuals|members|persons|us)?\\s*(?:are|is|got|were|who\\s+are|have\\s+been)?\\s*(?:injured|hurt|bleeding|wounded|unwell)`,
      'i'
    )
  );
  // 2. "X of us (are) injured"
  const ofUsInjuredMatch = message.match(
    new RegExp(
      `\\b${NUM_WORDS}\\s+of\\s+us\\s*(?:are|is|got|were|who\\s+are)?\\s*(?:injured|hurt|bleeding|wounded)`,
      'i'
    )
  );
  // 3. "X people (are) injured" or "my X children are injured"
  const peopleInjuredMatch = message.match(
    new RegExp(
      `\\b${NUM_WORDS}\\s*(?:people|individuals|members|persons|children|kids|family\\s+members)?\\s+(?:are|is|got|were|who\\s+are|have\\s+been)\\s+(?:injured|hurt|bleeding|wounded)`,
      'i'
    )
  );
  // 4. "there are / we have / with X (of us) injured"
  const haveInjuredMatch = message.match(
    new RegExp(
      `(?:there\\s+are|we\\s+have|i\\s+have|have|with)\\s+${NUM_WORDS}\\s*(?:of\\s+us\\s+)?(?:who\\s+are\\s+)?(?:injured|hurt|bleeding|wounded)`,
      'i'
    )
  );
  // 5. Direct "X injured/hurt/wounded"
  const directInjuredMatch = message.match(
    new RegExp(`\\b${NUM_WORDS}\\s*(?:injured|hurt|bleeding|wounded)\\b`, 'i')
  );

  const injuredMatch =
    subsetOfTotalInjuredMatch ||
    ofUsInjuredMatch ||
    peopleInjuredMatch ||
    haveInjuredMatch ||
    directInjuredMatch;

  const mentionsInjury =
    lower.includes('injured') ||
    lower.includes('hurt') ||
    lower.includes('bleeding') ||
    lower.includes('broken leg') ||
    lower.includes('unconscious') ||
    lower.includes('heart attack') ||
    lower.includes('medical emergency');

  if (isNegativeInjury) {
    extracted.injuredCount = 0;
  } else if (mentionsInjury) {
    if (isSpeculative) {
      uncertain.push('Possible injuries present (unconfirmed)');
    } else {
      const inj = injuredMatch ? parseCount(injuredMatch[1]) : undefined;
      if (inj !== undefined && inj >= 0) {
        extracted.injuredCount = inj;
      }
      if (!conditions.includes('HEAVILY_INJURED')) {
        conditions.push('HEAVILY_INJURED');
      }
    }
  }

  // 5. Disabled / Immobile
  const isNegativeDisabled =
    /\b(?:no|zero|0|not)\s+(?:disabled|handicapped|wheelchair)\b/i.test(message) ||
    /\b(?:none\s+of\s+us\s+is\s+disabled|nobody\s+is\s+disabled)\b/i.test(message);

  if (isNegativeDisabled) {
    extracted.disabledCount = 0;
  } else if (
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
    lower.includes('marooned') ||
    isUnableToMove
  ) {
    extracted.emergencyType = 'TRAPPED';
    if (!conditions.includes('TRAPPED')) {
      conditions.push('TRAPPED');
    }
  } else if (lower.includes('fire') || lower.includes('smoke') || lower.includes('burning')) {
    extracted.emergencyType = 'FIRE';
    conditions.push('FIRE');
  } else if (
    !isNegativeInjury &&
    (mentionsInjury || (mentionsCriticalMedical && !isNegativeCriticalMedical)) &&
    !lower.includes('flood') &&
    !lower.includes('water')
  ) {
    extracted.emergencyType = 'MEDICAL';
  } else if (
    (lower.includes('flood') || lower.includes('water')) &&
    !lower.startsWith('what should') &&
    !lower.startsWith('what to do') &&
    !lower.startsWith('how to') &&
    !lower.startsWith('how do') &&
    !lower.startsWith('what can')
  ) {
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
 * Defensive response sanitization layer.
 * Strips raw internal database UUIDs, SOS hashes, and technical identifiers from all
 * conversational text presented to citizens in emergencies.
 */
export function sanitizeAssistantResponse(text: string): string {
  if (!text || typeof text !== 'string') return text;

  return text
    .replace(/\s*\([#＃]?[a-zA-Z0-9_-]{4,40}\)/g, '')
    .replace(/\s*\[[#＃]?[a-zA-Z0-9_-]{4,40}\]/g, '')
    .replace(/\s*[#＃][a-zA-Z0-9_-]{4,40}\b/g, '')
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

/**
 * Deterministic anti-hallucination response validator.
 * Ensures the assistant NEVER mentions or invents specific hazards (floodwaters, rising water, fire, etc.)
 * unless explicitly mentioned in the current turn or confirmed in active database SOS facts.
 */
export function validateGroundedResponse(
  candidateResponse: string,
  currentUserUtterance: string,
  confirmedFacts?: ExtractedEmergencyInfo,
  mode: VoiceEmergencyMode = 'ASSESS'
): string {
  if (!candidateResponse || typeof candidateResponse !== 'string') {
    return "I am here to help. Could you describe what is happening right now?";
  }

  const utteranceLower = (currentUserUtterance || '').toLowerCase();
  const candidateLower = candidateResponse.toLowerCase();

  const userMentionsFlood =
    utteranceLower.includes('flood') ||
    utteranceLower.includes('water') ||
    utteranceLower.includes('submerged') ||
    utteranceLower.includes('drown');

  const confirmedFlood =
    !!confirmedFacts &&
    (confirmedFacts.waterLevel !== undefined ||
      confirmedFacts.emergencyType === 'FLOOD' ||
      (Array.isArray(confirmedFacts.conditions) &&
        confirmedFacts.conditions.some((c) => c.includes('WATER'))));

  const floodMentionAllowed = userMentionsFlood || confirmedFlood;

  // Check if response mentions flood/water hazards
  const responseMentionsFlood =
    /\b(flood|floods|flooding|floodwater|floodwaters|moving water|rising water|water level|water levels)\b/i.test(
      candidateLower
    );

  if (responseMentionsFlood && !floodMentionAllowed) {
    console.warn(
      `[STRIDE Grounding Validator] Ungrounded flood/water detected in response: "${candidateResponse}". Substituting safe grounded response.`
    );
    if (mode === 'EMERGENCY') {
      return "I have logged your emergency distress signal with disaster response teams. Please stay in a safe location. Are there any injuries or immediate medical needs?";
    }
    if (mode === 'ASSIST') {
      return "I am here to help. Could you tell me what situation or emergency you are facing right now so I can provide the right assistance?";
    }
    return "Could you describe the situation or danger you are facing? Are you in immediate danger right now?";
  }

  const userMentionsFire =
    utteranceLower.includes('fire') ||
    utteranceLower.includes('smoke') ||
    utteranceLower.includes('burn');

  const confirmedFire =
    !!confirmedFacts &&
    (confirmedFacts.emergencyType === 'FIRE' ||
      (Array.isArray(confirmedFacts.conditions) &&
        confirmedFacts.conditions.some((c) => c.includes('FIRE'))));

  const fireMentionAllowed = userMentionsFire || confirmedFire;

  const responseMentionsFire = /\b(fire|smoke|burning|flames)\b/i.test(candidateLower);

  if (responseMentionsFire && !fireMentionAllowed) {
    console.warn(
      `[STRIDE Grounding Validator] Ungrounded fire hazard detected in response: "${candidateResponse}". Substituting safe grounded response.`
    );
    if (mode === 'EMERGENCY') {
      return "I have logged your emergency distress signal with disaster response teams. Please stay in a safe location. Are there any injuries or immediate medical needs?";
    }
    return "Could you describe the situation or danger you are facing? Are you in immediate danger right now?";
  }

  return sanitizeAssistantResponse(candidateResponse);
}

/**
 * Canonical Grounded Response Generator.
 * Creates responses strictly anchored to confirmed facts and user utterances.
 * Never assumes a hazard type or disaster scenario without confirmed evidence.
 */
export function generateGroundedResponse(input: GroundedResponseInput): string {
  const lower = (input.currentUserUtterance || '').toLowerCase().trim();
  const history = input.conversationHistory || [];
  const previousAssistantMsgs = history.filter((h) => h.role === 'assistant');
  const lastAssistantMsg =
    previousAssistantMsgs.length > 0
      ? previousAssistantMsgs[previousAssistantMsgs.length - 1].content.toLowerCase()
      : '';

  const confirmed = input.confirmedIncidentFacts;
  const currentExtracted = input.extractedCurrentTurnFacts || {};
  const hasActiveSos = !!input.context?.activeSos;

  const userMentionsFlood =
    lower.includes('flood') || lower.includes('water') || lower.includes('submerged');
  const confirmedFlood =
    !!confirmed &&
    (confirmed.waterLevel !== undefined ||
      confirmed.emergencyType === 'FLOOD' ||
      (Array.isArray(confirmed.conditions) &&
        confirmed.conditions.some((c) => c.includes('WATER'))));

  // 1. Explicit questions about safety/guidance
  if (lower.includes('what should i do') || lower.includes('what to do') || lower.includes('should we do')) {
    if (userMentionsFlood || confirmedFlood) {
      return "If there is flooding or rising water, move immediately to higher ground or upper floors. Disconnect main electrical breakers if safe to do so. Avoid walking or driving through moving water, and prepare essential emergency supplies. Are you in immediate danger?";
    }
    if (lower.includes('fire')) {
      return "If there is a fire, evacuate immediately to open air away from the building. Stay low under smoke, do not use elevators, and alert others. Are you or anyone with you injured?";
    }
    if (hasActiveSos) {
      return "For your safety, remain in the safest, most secure location available and await rescue dispatch. If your situation changes or anyone becomes injured, let me know immediately.";
    }
    return "Please stay in the safest spot available right now. Tell me what emergency or danger you are facing so I can provide the right guidance or dispatch rescue.";
  }

  // 2. Generic help / capability requests ("can you help me", "who are you", etc.)
  if (
    lower.startsWith('can you help') ||
    lower.startsWith('how can you help') ||
    lower.startsWith('what can you do') ||
    lower === 'help' ||
    lower === 'can you help' ||
    lower.includes('who are you')
  ) {
    if (hasActiveSos) {
      return "Your rescue request is active with emergency dispatch. How can I assist you further?";
    }
    if (lower.includes('what can you do')) {
      return "I can help dispatch emergency rescue teams, direct you to open shelters and hospitals, or guide you through emergency procedures. Are you in immediate need of assistance right now?";
    }
    return "I am here to help. You can report an emergency, request rescue assistance, find an evacuation shelter, or ask disaster safety questions. What situation or emergency are you facing right now?";
  }

  // 3. Shelters & facilities inquiries
  if (lower.includes('shelter') && input.context?.nearestShelters && input.context.nearestShelters.length > 0) {
    const s = input.context.nearestShelters[0];
    return `The nearest shelter is ${s.name} at ${s.address} (${s.distanceKm} km away, status: ${s.status}).`;
  }
  if (lower.includes('hospital') && input.context?.nearestFacilities && input.context.nearestFacilities.length > 0) {
    const f = input.context.nearestFacilities[0];
    return `The nearest medical facility is ${f.name} at ${f.address} (${f.distanceKm} km away).`;
  }
  if (lower.includes('electricity') || lower.includes('power')) {
    return "Turn off the main electrical breaker immediately if it is safe to reach. Do not touch electrical switches or appliances if standing in water or wet areas.";
  }

  // 4. Affirmations ("ok", "okay", "yes")
  const isAffirmation = /^(ok|okay|k|yes|yeah|yep|sure|fine|alright|right|y|correct)\b/i.test(lower);
  if (isAffirmation) {
    if (lastAssistantMsg.includes('require emergency rescue assistance') || lastAssistantMsg.includes('require rescue')) {
      return "Understood, your request for rescue assistance is noted. Just tell me one thing: are you trapped right now? You can answer yes or no.";
    }
    if (lastAssistantMsg.includes('are you trapped right now') || lastAssistantMsg.includes('are you trapped')) {
      return "Understood. Are you able to move to a safer place right now? You can answer yes or no.";
    }
    if (lastAssistantMsg.includes('able to move to a safer place')) {
      return "Understood. If safe to do so, please move to a safer location or an emergency shelter. Do you need directions to the nearest shelter?";
    }
    if (lastAssistantMsg.includes('describe the situation') || lastAssistantMsg.includes('danger you are facing')) {
      return "That's okay. Just tell me one thing: are you trapped right now? You can answer yes or no.";
    }
    if (lastAssistantMsg.includes('immediate need of assistance right now') || lastAssistantMsg.includes('facing an emergency')) {
      return "Are you currently in immediate danger or facing an emergency? You can answer yes or no.";
    }
    return hasActiveSos
      ? "That's okay. Just tell me one thing: are you trapped right now? You can answer yes or no."
      : "Understood. Are you in immediate danger right now? You can answer yes or no.";
  }

  // 5. Negatives ("no", "nope")
  const isNegative = /^(no|nope|nah|not really|negative)\b/i.test(lower);
  if (isNegative) {
    if (lastAssistantMsg.includes('injured') || lastAssistantMsg.includes('injuries')) {
      return hasActiveSos
        ? "I have updated your active emergency signal to note that no one is injured. Are you able to move to a safer place right now? Yes or no."
        : "Understood, no injuries. Are you able to move to a safer place right now? Yes or no.";
    }
    if (lastAssistantMsg.includes('are you trapped right now') || lastAssistantMsg.includes('are you trapped')) {
      return "Understood, you are not trapped. Are you or anyone with you injured or in need of medical help? Yes or no.";
    }
    if (lastAssistantMsg.includes('able to move to a safer place')) {
      return "Understood. If you cannot move safely, please stay where you are in the safest, most secure spot available. Are you in immediate danger right now? Yes or no.";
    }
    if (lastAssistantMsg.includes('require emergency rescue assistance')) {
      return "Understood. I am here to provide disaster guidance, shelter locations, or emergency assistance whenever you need them. Stay safe.";
    }
  }

  // 6. Cannot describe / uncertain
  const isCannotDescribe =
    lower.includes('cant describe') ||
    lower.includes("can't describe") ||
    lower.includes('cannot describe') ||
    lower.includes('no idea') ||
    lower.includes('cant talk') ||
    lower.includes("can't talk") ||
    lower === 'dont know' ||
    lower === "don't know" ||
    lower === "i don't know" ||
    lower === "i dont know";

  if (isCannotDescribe) {
    if (lastAssistantMsg.includes('able to move to a safer place')) {
      return "That's okay. You don't need to describe it. Are you or anyone with you injured right now? Yes or no.";
    }
    if (lastAssistantMsg.includes('immediate danger') || lastAssistantMsg.includes('facing an emergency')) {
      return "That's okay. Are you in a safe place right now? You can answer yes or no.";
    }
    return "That's okay. You don't need to describe it. Are you able to move to a safer place? Yes or no.";
  }

  // 7. Active SOS updates with confirmed facts
  const isUnableToMoveFact =
    currentExtracted.unableToMove ||
    /\b(?:cannot|can't|unable\s+to|not\s+able\s+to)\s+move\b/i.test(lower) ||
    lower.includes('stuck upstairs') ||
    lower.includes('cannot move');
  const isTrappedFact =
    currentExtracted.emergencyType === 'TRAPPED' ||
    (Array.isArray(currentExtracted.conditions) && currentExtracted.conditions.includes('TRAPPED')) ||
    lower.includes('trapped');
  const isRisingWaterFact =
    currentExtracted.waterLevel === 'HIGH' ||
    currentExtracted.waterLevel === 'EXTREME' ||
    (Array.isArray(currentExtracted.conditions) && currentExtracted.conditions.includes('WATER_RISING')) ||
    lower.includes('water is rising') ||
    lower.includes('water rising');

  if (hasActiveSos && Object.keys(currentExtracted).length > 0) {
    if ((isUnableToMoveFact || isTrappedFact) && isRisingWaterFact) {
      return sanitizeAssistantResponse(
        "I have updated your active emergency signal: you are trapped, water is rising, and you are unable to move. Emergency dispatch has been notified. Stay as safe as possible and follow any instructions from responders."
      );
    }
    if (isUnableToMoveFact || isTrappedFact) {
      return sanitizeAssistantResponse(
        "I have updated your active emergency signal: you are trapped and unable to move. Emergency dispatch has been notified. Stay as safe as possible and follow any instructions from responders."
      );
    }
    if (currentExtracted.injuredCount !== undefined) {
      if (currentExtracted.injuredCount === 0) {
        if (currentExtracted.peopleCount !== undefined) {
          return sanitizeAssistantResponse(
            `I have updated your active emergency signal to ${currentExtracted.peopleCount} people and noted that no one is injured. Dispatch teams have been informed. Are you or anyone with you able to move safely? Yes or no.`
          );
        }
        return sanitizeAssistantResponse(
          "I have updated your active emergency signal to note that no one is injured. Dispatch teams have been informed. Are you or anyone with you able to move safely? Yes or no."
        );
      }
      const injuryDetail =
        currentExtracted.injuredCount > 1
          ? `${currentExtracted.injuredCount} people are injured`
          : 'the medical injury';
      if (currentExtracted.peopleCount !== undefined) {
        return sanitizeAssistantResponse(
          `I have updated your active emergency signal to ${currentExtracted.peopleCount} people and noted that ${injuryDetail}. Emergency dispatch has been notified. Are you or anyone with you able to move safely? Yes or no.`
        );
      }
      return sanitizeAssistantResponse(
        `I have noted that ${injuryDetail} on your active emergency signal. Emergency dispatch has been notified. Are you or anyone with you able to move safely? Yes or no.`
      );
    }
    if (currentExtracted.peopleCount !== undefined) {
      return sanitizeAssistantResponse(
        `I have updated your active emergency distress signal to ${currentExtracted.peopleCount} people. Are any of the people injured? You can answer yes or no.`
      );
    }
    if (currentExtracted.childrenCount !== undefined) {
      return sanitizeAssistantResponse(
        `I have updated your active emergency signal to include ${currentExtracted.childrenCount} children. Dispatch teams have been informed. Are you all in a safe location? Yes or no.`
      );
    }
    return sanitizeAssistantResponse(
      "I have updated your active emergency distress signal with these details and notified dispatch teams. Please stay calm and remain in a safe location."
    );
  }

  // 8. Emergency creation with confirmed facts
  if (currentExtracted.peopleCount !== undefined) {
    return `I have logged your emergency distress request for ${currentExtracted.peopleCount} people. Dispatch teams are triaging your location. Are any of the ${currentExtracted.peopleCount} people injured? You can answer yes or no.`;
  }

  if (lower.includes('trapped') || currentExtracted.emergencyType === 'TRAPPED') {
    return "I have logged your emergency distress request as trapped. Dispatch teams are triaging your location. How many people are with you right now, and are there any injuries?";
  }

  if (userMentionsFlood) {
    return "I hear that water is affecting your location. Are you able to move to a higher floor or safe area right now, or are you trapped or in immediate danger?";
  }

  // 9. Ambiguous or general distress
  if (lower.includes('stuck') || lower.includes('need help')) {
    return "I understand you are stuck and need help. Can you tell me what you are stuck in, what immediate danger you are facing, and your current location?";
  }

  // Default clarification
  return "Could you describe the situation or danger you are facing? Are you trapped, injured, or able to move to safety?";
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
    const respText = isPureGreeting
      ? "Hello! I am the STRIDE Emergency Voice Assistant. You can speak naturally to report an emergency, ask for disaster safety guidance, or find the nearest evacuation shelter. How can I help you?"
      : "I can help dispatch emergency rescue teams, direct you to open shelters and hospitals, or guide you through emergency procedures. Are you in immediate need of assistance right now?";

    return {
      mode: 'ASSIST',
      intent: isPureGreeting ? 'greeting' : 'capability_inquiry',
      assistantResponse: validateGroundedResponse(respText, message, existingIncidentFacts, 'ASSIST'),
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
    const resp = generateGroundedResponse({
      currentUserUtterance: message,
      confirmedIncidentFacts: existingIncidentFacts,
      extractedCurrentTurnFacts: extracted,
      conversationHistory: history,
      context,
      mode: 'ASSESS',
      intent: 'cannot_describe_adaptation',
    });
    const target = lastAssistantLower.includes('able to move') ? 'medical_need' : 'safety_mobility';
    return {
      mode: 'ASSESS',
      intent: 'cannot_describe_adaptation',
      assistantResponse: validateGroundedResponse(resp, message, existingIncidentFacts, 'ASSESS'),
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
          "Understood. If safe to do so, please move to a safer location or an emergency shelter. Do you need directions to the nearest shelter?",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: [],
        questionTarget: 'shelter_guidance',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

    const defaultResp = generateGroundedResponse({
      currentUserUtterance: message,
      confirmedIncidentFacts: existingIncidentFacts,
      extractedCurrentTurnFacts: extracted,
      conversationHistory: history,
      context,
      mode: 'ASSESS',
      intent: 'general_affirmation_followup',
    });
    return {
      mode: 'ASSESS',
      intent: 'general_affirmation_followup',
      assistantResponse: validateGroundedResponse(defaultResp, message, existingIncidentFacts, 'ASSESS'),
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
      lastAssistantLower.includes('injured') ||
      lastAssistantLower.includes('injuries')
    ) {
      if (context.activeSos) {
        return {
          mode: 'EMERGENCY',
          intent: 'emergency_sos_dispatch',
          assistantResponse: validateGroundedResponse(
            "I have updated your active emergency signal to note that no one is injured. Dispatch teams have been informed. Are you or anyone with you able to move safely? Yes or no.",
            message,
            existingIncidentFacts,
            'EMERGENCY'
          ),
          extractedInformation: { injuredCount: 0 },
          existingIncidentFacts,
          uncertainInformation: [],
          missingInformation: ['safety_mobility'],
          questionTarget: 'safety_mobility',
          shouldCreateOrUpdateSos: true,
          isFallbackExtractor: true,
        };
      }
      return {
        mode: 'ASSESS',
        intent: 'not_injured_mobility_check',
        assistantResponse:
          "Understood, no injuries. Are you or anyone with you able to move safely? Yes or no.",
        extractedInformation: { injuredCount: 0 },
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: ['safety_mobility'],
        questionTarget: 'safety_mobility',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

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
          "Understood. If you cannot move safely, please stay where you are in the safest, most secure spot available. Are you in immediate danger right now? Yes or no.",
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
          "Understood. I am here to provide disaster guidance, shelter locations, or emergency assistance whenever you need them. Stay safe.",
        extractedInformation: {},
        existingIncidentFacts,
        uncertainInformation: [],
        missingInformation: [],
        questionTarget: 'none',
        shouldCreateOrUpdateSos: false,
        isFallbackExtractor: true,
      };
    }

    if (lastAssistantLower.includes('immediate danger') || lastAssistantLower.includes('facing an emergency')) {
      return {
        mode: 'ASSIST',
        intent: 'not_in_immediate_danger',
        assistantResponse:
          "Understood. If you need safety instructions, shelter information, or emergency rescue at any time, just let me know. Stay safe.",
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

  const hasCriticalEmergencyFacts =
    extracted.peopleCount !== undefined ||
    extracted.injuredCount !== undefined ||
    extracted.childrenCount !== undefined ||
    extracted.elderlyCount !== undefined ||
    extracted.disabledCount !== undefined ||
    extracted.criticalMedicalNeed !== undefined;

  // Informational query: If citizen is asking for guidance and did NOT provide new emergency facts
  if (isQuestion && !hasTrappedExplicit && !hasInjured && !hasExplicitRescueCall && !hasRisingWater && !hasFire && !hasCriticalEmergencyFacts) {
    const rawResp = generateGroundedResponse({
      currentUserUtterance: message,
      confirmedIncidentFacts: existingIncidentFacts,
      extractedCurrentTurnFacts: extracted,
      conversationHistory: history,
      context,
      mode: 'ASSIST',
      intent: 'general_inquiry',
    });

    const validated = validateGroundedResponse(rawResp, message, existingIncidentFacts, 'ASSIST');

    return {
      mode: 'ASSIST',
      intent: 'general_inquiry',
      assistantResponse: validated,
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

    const isUnableToMoveFact =
      extracted.unableToMove ||
      /\b(?:cannot|can't|unable\s+to|not\s+able\s+to)\s+move\b/i.test(lower) ||
      lower.includes('stuck upstairs') ||
      lower.includes('cannot move');
    const isTrappedFact =
      extracted.emergencyType === 'TRAPPED' ||
      (Array.isArray(extracted.conditions) && extracted.conditions.includes('TRAPPED')) ||
      hasTrappedExplicit;
    const isRisingWaterFact =
      extracted.waterLevel === 'HIGH' ||
      extracted.waterLevel === 'EXTREME' ||
      (Array.isArray(extracted.conditions) && extracted.conditions.includes('WATER_RISING')) ||
      hasRisingWater;

    if ((isUnableToMoveFact || isTrappedFact) && isRisingWaterFact) {
      assistantMsg =
        "I have updated your active emergency signal: you are trapped, water is rising, and you are unable to move. Emergency dispatch has been notified. Stay as safe as possible and follow any instructions from responders.";
      target = 'none';
    } else if (isUnableToMoveFact || isTrappedFact) {
      assistantMsg =
        "I have updated your active emergency signal: you are trapped and unable to move. Emergency dispatch has been notified. Stay as safe as possible and follow any instructions from responders.";
      target = 'none';
    } else if (extracted.injuredCount !== undefined) {
      if (extracted.injuredCount === 0) {
        if (extracted.peopleCount !== undefined) {
          assistantMsg = `I have updated your active emergency signal to ${extracted.peopleCount} people and noted that no one is injured. Dispatch teams have been informed. Are you or anyone with you able to move safely? Yes or no.`;
        } else {
          assistantMsg = "I have updated your active emergency signal to note that no one is injured. Dispatch teams have been informed. Are you or anyone with you able to move safely? Yes or no.";
        }
      } else {
        const countStr =
          extracted.injuredCount > 1
            ? `${extracted.injuredCount} people are injured`
            : 'the medical injury';
        if (extracted.peopleCount !== undefined) {
          assistantMsg = `I have updated your active emergency signal to ${extracted.peopleCount} people and noted that ${countStr}. Emergency dispatch has been notified. Are you or anyone with you able to move safely? Yes or no.`;
        } else {
          assistantMsg = `I have noted that ${countStr} on your active emergency signal. Emergency dispatch has been notified. Are you or anyone with you able to move safely? Yes or no.`;
        }
      }
      target = 'safety_mobility';
    } else if (extracted.peopleCount !== undefined) {
      assistantMsg = `I have updated your active emergency distress signal to ${extracted.peopleCount} people. Are any of the people injured? You can answer yes or no.`;
      target = 'medical_need';
    } else if (extracted.childrenCount !== undefined) {
      assistantMsg = `I have updated your active emergency signal to include ${extracted.childrenCount} children. Dispatch teams have been informed. Are you all in a safe location? Yes or no.`;
      target = 'safety_mobility';
    } else {
      assistantMsg = "I have updated your active emergency distress signal with these details and notified dispatch teams. Please stay calm and remain in a safe location.";
      target = 'safety_mobility';
    }

    return {
      mode: 'EMERGENCY',
      intent: 'emergency_sos_dispatch',
      assistantResponse: validateGroundedResponse(assistantMsg, message, existingIncidentFacts, 'EMERGENCY'),
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
      assistantMsg = generateGroundedResponse({
        currentUserUtterance: message,
        confirmedIncidentFacts: existingIncidentFacts,
        extractedCurrentTurnFacts: extracted,
        conversationHistory: history,
        context,
        mode: 'EMERGENCY',
        intent: 'emergency_sos_dispatch',
      });
    } else if (extracted.peopleCount !== undefined) {
      assistantMsg = `I have logged your emergency distress request for ${extracted.peopleCount} people. Dispatch teams are triaging your location. Are any of the ${extracted.peopleCount} people injured? You can answer yes or no.`;
      target = 'medical_need';
    } else if (hasTrappedExplicit || extracted.emergencyType === 'TRAPPED') {
      assistantMsg =
        "I have logged your emergency distress request as trapped. Dispatch teams are triaging your location. How many people are with you right now, and are there any injuries?";
      target = 'vulnerabilities';
    } else {
      assistantMsg =
        "I have sent your emergency distress request to the disaster response command center. Our teams are triaging your location. Please stay in a safe location. Are there any other people or specific medical needs?";
      target = 'vulnerabilities';
    }

    return {
      mode: 'EMERGENCY',
      intent: 'emergency_sos_dispatch',
      assistantResponse: validateGroundedResponse(assistantMsg, message, existingIncidentFacts, 'EMERGENCY'),
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
    assistantResponse: validateGroundedResponse(assessResponse, message, existingIncidentFacts, 'ASSESS'),
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
4. STRICT HAZARD GROUNDING & ANTI-HALLUCINATION:
   - NEVER assume, hallucinate, or state that water is entering, rising, or flooding UNLESS:
     a) The citizen explicitly mentions water, flood, or submerged conditions in CURRENT CITIZEN MESSAGE, OR
     b) Floodwater is confirmed in EXISTING INCIDENT FACTS (e.g. waterLevel is HIGH/MEDIUM/EXTREME or emergencyType is FLOOD), OR
     c) The citizen explicitly asks a question about flood safety (e.g. "what should I do during a flood?").
   - NEVER assume fire, smoke, earthquake, or any other disaster type unless mentioned or confirmed.
   - DO NOT use the Active Disaster title to assume the citizen is experiencing that hazard! The Active Disaster is general city-wide context, NOT the citizen's individual situation.
   - If the citizen says "can you help me" or "what should I do?", they did NOT mention water or a flood! NEVER tell them to avoid moving floodwaters or stay on higher ground unless water was actually mentioned or confirmed!
   - If the citizen says "we are trapped upstairs", acknowledge that they are trapped, but DO NOT claim that there is floodwater or a flood!
   - If the citizen says "we are 4 people", acknowledge 4 people, but DO NOT invent a flood or disaster!
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
9. FACT CORRECTIONS AND EXPLICIT NEGATIONS:
   - If the citizen explicitly negates or corrects a previously stated fact (e.g. "Not the five people are injured", "None of the five people are injured", "Nobody is injured", "No one is injured", "Actually, nobody is injured", "No injuries", "We are not injured"):
     * Explicitly set the corresponding field to 0 (e.g. "injuredCount": 0).
     * DO NOT omit the field or keep previous positive counts when negated. Explicitly setting 0 signals that the previously asserted injury has been cleared.
     * If the citizen negates injury but states someone is seriously unwell (e.g. "Nobody is injured, but my grandmother is seriously unwell"):
       - set "injuredCount": 0
       - set "criticalMedicalNeed": true
       - include "SERIOUSLY_UNWELL" in conditions.
10. NUMBER-AGNOSTIC SUBSET EXTRACTION & PRESERVATION:
   - "peopleCount" represents the TOTAL number of humans at the location.
   - Vulnerable subsets (e.g. "two of us injured", "three people are injured", "two kids", "one elder") must NEVER overwrite "peopleCount".
   - Only set or change "peopleCount" if the citizen explicitly states or updates the total count (e.g. "We are 4 people", "Actually there are 5 people with me", "There are five of us in total").
   - If the citizen says "two of us injured", set "injuredCount": 2, and DO NOT set "peopleCount".
   - If the citizen says "we are injured" or mentions injuries without stating a specific number, DO NOT invent a count or set "injuredCount": 1! Include "HEAVILY_INJURED" in conditions, and omit "injuredCount" so previously established counts in active SOS are preserved.
11. IMMOBILITY AND NO REDUNDANT MOBILITY QUESTIONS:
   - If the citizen states "we cannot move", "none of us can move", "we are unable to move", "i can't move", or are trapped upstairs / trapped in floodwater:
     * Mark "unableToMove": true, "emergencyType": "TRAPPED", and include "TRAPPED" in conditions.
     * NEVER ask "Are you able to move safely?" or "Are you trapped, injured, or able to move to safety?" if the user already stated they cannot move or are trapped!
     * Acknowledge cleanly that their distress signal is updated, dispatch has been notified, and they should stay in place.
12. NO RAW IDENTIFIERS OR DATABASE IDS:
   - NEVER include raw database IDs, UUIDs, hashes, or technical identifiers (e.g. #373b83dd..., #clx..., request IDs) in your spoken or text responses.
   - Refer to emergencies naturally as 'your emergency signal', 'your distress request', or 'your active rescue request'.

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
- Active SOS In Database: ${context.activeSos ? `Active SOS exists (Status: ${context.activeSos.rescueStatus}, Priority: ${context.activeSos.priorityScore})` : 'No active SOS'}
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

    const rawResponse =
      parsed?.assistantResponse ||
      (mode === 'EMERGENCY'
        ? "I have logged your emergency distress signal with our response units. Stay in a safe location."
        : "I am here with STRIDE Emergency Command. How can I assist you?");

    const detFacts = extractCurrentTurnFacts(message);
    const combinedExtracted: ExtractedEmergencyInfo = { ...(parsed?.extractedInformation || {}) };

    if (detFacts.extracted.injuredCount !== undefined) {
      combinedExtracted.injuredCount = detFacts.extracted.injuredCount;
    }
    if (detFacts.extracted.peopleCount !== undefined) {
      combinedExtracted.peopleCount = detFacts.extracted.peopleCount;
    }
    if (detFacts.extracted.childrenCount !== undefined) {
      combinedExtracted.childrenCount = detFacts.extracted.childrenCount;
    }
    if (detFacts.extracted.elderlyCount !== undefined) {
      combinedExtracted.elderlyCount = detFacts.extracted.elderlyCount;
    }
    if (detFacts.extracted.disabledCount !== undefined) {
      combinedExtracted.disabledCount = detFacts.extracted.disabledCount;
    }
    if (detFacts.extracted.criticalMedicalNeed !== undefined) {
      combinedExtracted.criticalMedicalNeed = detFacts.extracted.criticalMedicalNeed;
    }
    if (detFacts.extracted.unableToMove) {
      combinedExtracted.unableToMove = true;
      combinedExtracted.emergencyType = 'TRAPPED';
      if (!combinedExtracted.conditions?.includes('TRAPPED')) {
        combinedExtracted.conditions = [...(combinedExtracted.conditions || []), 'TRAPPED'];
      }
    }
    if (detFacts.extracted.emergencyType) {
      combinedExtracted.emergencyType = detFacts.extracted.emergencyType;
    }
    if (detFacts.extracted.waterLevel) {
      combinedExtracted.waterLevel = detFacts.extracted.waterLevel;
    }
    if (detFacts.conditions.length > 0) {
      const condSet = new Set([...(combinedExtracted.conditions || []), ...detFacts.conditions]);
      combinedExtracted.conditions = Array.from(condSet);
    }

    if (combinedExtracted.injuredCount === 0 && Array.isArray(combinedExtracted.conditions)) {
      combinedExtracted.conditions = combinedExtracted.conditions.filter((c) => c !== 'HEAVILY_INJURED');
    }

    const hasActiveSosUpdate = !!(context.activeSos && (
      combinedExtracted.injuredCount !== undefined ||
      combinedExtracted.peopleCount !== undefined ||
      combinedExtracted.childrenCount !== undefined ||
      combinedExtracted.elderlyCount !== undefined ||
      combinedExtracted.disabledCount !== undefined ||
      combinedExtracted.unableToMove !== undefined ||
      combinedExtracted.emergencyType !== undefined ||
      combinedExtracted.waterLevel !== undefined
    ));

    const finalMode: VoiceEmergencyMode = hasActiveSosUpdate ? 'EMERGENCY' : mode;

    const validatedResponse = validateGroundedResponse(
      rawResponse,
      message,
      existingIncidentFacts,
      finalMode
    );

    return {
      mode: finalMode,
      intent: parsed?.intent || 'emergency_voice_processing',
      assistantResponse: validatedResponse,
      extractedInformation: combinedExtracted,
      existingIncidentFacts,
      uncertainInformation: Array.isArray(parsed?.uncertainInformation) ? parsed.uncertainInformation : [],
      missingInformation: Array.isArray(parsed?.missingInformation) ? parsed.missingInformation : [],
      questionTarget: parsed?.questionTarget || undefined,
      shouldCreateOrUpdateSos: (!!parsed?.shouldCreateOrUpdateSos && mode === 'EMERGENCY') || hasActiveSosUpdate,
      isFallbackExtractor: false,
    };
  } catch (err: any) {
    console.error('Gemini Voice Service API error (falling back to limited signal extractor):', err.message);
    return limitedEmergencySignalExtractor(message, history, context, existingIncidentFacts);
  }
}

/**
 * Clean raw speech-to-text transcript:
 * - Strip surrounding quotes
 * - Filter out noise/silence tokens ([silence], (silence), [unintelligible], none, etc.)
 */
export function cleanTranscript(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  // Strip surrounding quotes
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();

  // Noise / silence regex
  const noisePattern = /^(?:\[|\()?(?:silence|unintelligible|inaudible|background noise|noise|empty|none|n\/a|speaking in foreign language|music|applause|ambient sounds?|static)(?:\]|\))?\.?$/i;
  if (noisePattern.test(cleaned) || cleaned === '...' || cleaned === '..') {
    return '';
  }

  return cleaned;
}

/**
 * STAGE 1: Audio -> Gemini -> verbatim transcript ONLY
 * Transcribes the audio buffer verbatim. Does not perform triage, inference, or SOS mutation.
 */
export async function transcribeEmergencyAudio(
  audioBuffer: Buffer,
  mimeType: string,
  correlationId?: string
): Promise<{ transcript: string; error?: string; failureStage?: AudioFailureStage }> {
  const apiKey = getGeminiApiKey();
  const cleanMimeType = normalizeAudioMimeType(mimeType);
  const reqId = correlationId || `transcribe-${Date.now()}`;

  if (!audioBuffer || audioBuffer.length === 0) {
    return { transcript: '', error: 'Audio buffer is empty', failureStage: 'EMPTY_RECORDING' };
  }

  if (audioBuffer.length < 200) {
    return { transcript: '', error: `Audio buffer too small (${audioBuffer.length} bytes)`, failureStage: 'AUDIO_BUFFER' };
  }

  if (!apiKey) {
    console.warn(`[STRIDE Voice Transcription] No Gemini API key resolved (id: ${reqId}).`);
    return { transcript: '', error: 'Transcription service unconfigured: missing Gemini API key', failureStage: 'GEMINI_AUTH' };
  }

  const base64Audio = audioBuffer.toString('base64');
  console.log('[STRIDE Audio Diagnostic: geminiRequestStarted]', {
    correlationId: reqId,
    serverBufferSize: audioBuffer.length,
    normalizedMimeType: cleanMimeType,
    base64Length: base64Audio.length,
  });

  const prompt =
    'You are a verbatim speech-to-text transcriber for emergency voice recordings. Output ONLY the exact spoken words transcribed in English (or translated verbatim to English if spoken in Kannada or Hindi). Do NOT add any preamble, quotes, tags, metadata, or commentary. If the audio contains only background noise, silence, or is unintelligible, return an empty string.';

  const ai = new GoogleGenAI({ apiKey });
  let rawTranscript = '';
  let modelUsed = 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model: modelUsed,
      contents: [
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: base64Audio,
          },
        },
        prompt,
      ],
    });

    rawTranscript = (response.text || '').trim();
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn(`[STRIDE Voice Transcription] Model ${modelUsed} error (id: ${reqId}): ${errMsg}`);

    // Rule 4: Only fall back when the error specifically indicates model unavailability / unsupported model
    const isModelUnavailable = /404|not[-_ ]?found|unsupported model|model not available|is not found/i.test(errMsg);
    if (isModelUnavailable) {
      console.log(`[STRIDE Voice Transcription] Attempting fallback model gemini-2.0-flash (id: ${reqId})...`);
      try {
        modelUsed = 'gemini-2.0-flash';
        const fallbackRes = await ai.models.generateContent({
          model: modelUsed,
          contents: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: base64Audio,
              },
            },
            prompt,
          ],
        });
        rawTranscript = (fallbackRes.text || '').trim();
      } catch (fbErr: any) {
        const fbErrMsg = fbErr?.message || String(fbErr);
        console.warn(`[STRIDE Voice Transcription] Fallback model ${modelUsed} also failed (id: ${reqId}): ${fbErrMsg}`);
        const isAuth = /API_KEY_INVALID|401|403|unauthorized/i.test(fbErrMsg);
        return {
          transcript: '',
          error: fbErrMsg,
          failureStage: isAuth ? 'GEMINI_AUTH' : 'GEMINI_REQUEST',
        };
      }
    } else {
      // For auth, malformed audio, quota, or other request errors, preserve actual failureStage
      const isAuth = /API_KEY_INVALID|401|403|unauthorized|invalid api key/i.test(errMsg);
      const isAudioBuffer = /malformed audio|unsupported audio|bad request|400/i.test(errMsg);
      const stage: AudioFailureStage = isAuth ? 'GEMINI_AUTH' : isAudioBuffer ? 'AUDIO_BUFFER' : 'GEMINI_REQUEST';
      return { transcript: '', error: errMsg, failureStage: stage };
    }
  }

  console.log('[STRIDE Audio Diagnostic: geminiResponseReceived]', {
    correlationId: reqId,
    modelUsed,
    rawTranscriptLength: rawTranscript.length,
    rawTranscriptPreview: rawTranscript.substring(0, 100),
  });

  const cleaned = cleanTranscript(rawTranscript);
  console.log('[STRIDE Audio Diagnostic: parsedTranscript]', {
    correlationId: reqId,
    transcriptLength: cleaned.length,
    parsedTranscript: cleaned,
  });

  if (!cleaned) {
    return {
      transcript: '',
      error: 'Audio contains only background noise, silence, or unintelligible speech',
      failureStage: 'EMPTY_TRANSCRIPT',
    };
  }

  return { transcript: cleaned };
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

  console.log('[STRIDE Voice Audio Stage 1: Transcription Started]', {
    correlationId: reqId,
    serverBufferSize: audioBuffer ? audioBuffer.length : 0,
    mimeType,
  });

  // STAGE 1: Audio -> Gemini -> verbatim transcript ONLY
  const { transcript, error, failureStage } = await transcribeEmergencyAudio(audioBuffer, mimeType, reqId);

  // If transcription fails or returned empty transcript: (Rule 5 & 11)
  if (!transcript || transcript.trim() === '') {
    console.warn(`[STRIDE Voice Audio] Transcription produced no words (id: ${reqId}, failureStage: ${failureStage || 'EMPTY_TRANSCRIPT'}): ${error || 'Empty transcript'}`);
    return {
      transcript: '',
      failureStage: failureStage || 'EMPTY_TRANSCRIPT',
      diagnosticReason: error || 'Transcription yielded no intelligible words',
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

  console.log('[STRIDE Audio Diagnostic: triageInput]', {
    correlationId: reqId,
    currentUserUtterance: transcript,
  });

  // STAGE 2: Pass THAT transcript as the currentUserUtterance into the exact same text triage pipeline
  try {
    const textTriageResult = await processEmergencyVoiceInput(
      transcript,
      history,
      context,
      existingIncidentFacts,
      reqId
    );

    console.log('[STRIDE Audio Diagnostic: triageOutput]', {
      correlationId: reqId,
      mode: textTriageResult.mode,
      intent: textTriageResult.intent,
      assistantResponse: textTriageResult.assistantResponse,
      extractedInformation: textTriageResult.extractedInformation,
    });

    return {
      ...textTriageResult,
      transcript,
    };
  } catch (triageErr: any) {
    console.error(`[STRIDE Voice Audio Stage 2 Triage Error] (id: ${reqId}):`, triageErr?.message || triageErr);
    return {
      transcript,
      failureStage: 'TRIAGE',
      diagnosticReason: triageErr?.message || 'Triage processing failed',
      mode: 'ASSESS',
      intent: 'triage_failed',
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
}


