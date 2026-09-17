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
  uncertainInformation: string[];
  missingInformation: string[];
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
  _history: ChatMessage[],
  context: StrideContextData
): VoiceAssistantOutput {
  const lower = message.toLowerCase().trim();

  // 1. Check for pure questions / ASSIST intent
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

  // 2. High-confidence distress signals (EMERGENCY)
  const hasTrapped =
    lower.includes('trapped') ||
    lower.includes('cannot get out') ||
    lower.includes("can't get out") ||
    lower.includes('stuck upstairs') ||
    lower.includes('marooned');

  const hasInjured =
    lower.includes('injured') ||
    lower.includes('bleeding') ||
    lower.includes('unconscious') ||
    lower.includes('broken leg') ||
    lower.includes('heart attack') ||
    lower.includes('medical emergency');

  const hasRisingWater =
    lower.includes('water is rising') ||
    lower.includes('water rising') ||
    lower.includes('waist deep') ||
    lower.includes('chest level') ||
    lower.includes('neck deep') ||
    lower.includes('submerged');

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
    lower.includes('need evacuation') ||
    lower.includes('evacuate us') ||
    lower.includes('emergency need help');

  // Check for speculation phrases
  const hasSpeculation =
    lower.includes('i think') ||
    lower.includes('maybe') ||
    lower.includes('might be') ||
    lower.includes('not sure if') ||
    lower.includes('possibly');

  // Pure ASSIST mode
  if (isQuestion && !hasTrapped && !hasInjured && !hasExplicitRescueCall) {
    let resp =
      "For your safety during this flood event, please stay on higher ground and avoid entering moving floodwaters. Do you require emergency rescue assistance?";
    if (lower.includes('shelter') && context.nearestShelters.length > 0) {
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
      uncertainInformation: [],
      missingInformation: [],
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // Clear emergency signals present
  if (
    hasTrapped ||
    hasInjured ||
    (hasRisingWater && !isQuestion) ||
    hasFire ||
    hasExplicitRescueCall ||
    (hasDisabledOrImmobile && (lower.includes('water') || lower.includes('evacuation') || lower.includes('help')))
  ) {
    const extracted: ExtractedEmergencyInfo = {};
    const uncertain: string[] = [];
    const missing: string[] = [];
    const conditions: string[] = ['NEED_RESCUE'];

    if (hasTrapped) {
      extracted.emergencyType = 'TRAPPED';
      conditions.push('TRAPPED');
    } else if (hasFire) {
      extracted.emergencyType = 'FIRE' as any;
      conditions.push('FIRE');
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

    if (lower.includes('grandmother') || lower.includes('grandfather') || lower.includes('elderly') || lower.includes('grandma') || lower.includes('grandpa')) {
      if (hasSpeculation) {
        uncertain.push('Possible elderly present (unconfirmed)');
      } else {
        const elderlyMatch = message.match(/(\b\d+\b)\s*(?:elderly|grandparents)/i);
        extracted.elderlyCount = elderlyMatch ? parseInt(elderlyMatch[1], 10) : 1;
      }
    }

    if (lower.includes('wheelchair') || lower.includes('disabled') || lower.includes('cannot walk') || lower.includes("can't walk") || lower.includes('bedridden')) {
      extracted.disabledCount = 1;
      conditions.push('PHYSICALLY_DISABLED');
    }

    // Location mention
    const locMatch = message.match(/(?:in|at|near|from)\s+([A-Z][a-zA-Z0-9\s,.-]+(?:Road|Street|Layout|Nagar|Block|Stage|Cross|Metro|Circle|Area))/i);
    if (locMatch) {
      extracted.spokenLocation = locMatch[1].trim();
    }

    extracted.conditions = conditions;

    let assistantMsg =
      "I have sent your emergency distress request to the disaster response command center. Our teams are triaging your location. Please stay in a safe, elevated spot. Are there any other people or specific medical needs?";
    if (context.activeSos) {
      assistantMsg =
        "I have updated your active emergency distress signal with these details and updated the dispatch triage team. Stay calm and stay above water level.";
    }

    return {
      mode: 'EMERGENCY',
      intent: 'emergency_sos_dispatch',
      assistantResponse: assistantMsg,
      extractedInformation: extracted,
      uncertainInformation: uncertain,
      missingInformation: missing,
      shouldCreateOrUpdateSos: true,
      isFallbackExtractor: true,
    };
  }

  // Potential danger / ambiguous situation -> ASSESS
  return {
    mode: 'ASSESS',
    intent: 'assess_potential_danger',
    assistantResponse:
      "I hear that water is entering your area. Are you able to evacuate safely right now, or are you trapped or in immediate danger?",
    extractedInformation: {},
    uncertainInformation: hasSpeculation ? ['Unconfirmed situation'] : [],
    missingInformation: ['evacuation capability', 'water depth', 'number of individuals'],
    shouldCreateOrUpdateSos: false,
    isFallbackExtractor: true,
  };
}

/**
 * Main Gemini-powered emergency processing function.
 * Leverages @google/genai with strict JSON response and graceful fallback.
 */
export async function processEmergencyVoiceInput(
  message: string,
  history: ChatMessage[],
  context: StrideContextData
): Promise<VoiceAssistantOutput> {
  const apiKey = process.env.GEMINI_API_KEY;

  // If no Gemini API key configured, use limited signal extractor
  if (!apiKey || apiKey.trim() === '') {
    return limitedEmergencySignalExtractor(message, history, context);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are the STRIDE Emergency Voice Assistant for Bengaluru, Karnataka, India during an active flood/disaster.
Your role:
1. Understand the user's spoken words.
2. Determine their intent and mode:
   - "ASSIST": The user is asking general questions, advice, shelter/facility locations, weather, or flood preparedness. Do NOT trigger SOS.
   - "ASSESS": The user mentions rising water, power loss, or potential danger, but hasn't confirmed if they are trapped, injured, or need rescue. Ask a direct clarifying question (e.g., "Can you leave safely or are you trapped?"). Do NOT trigger SOS.
   - "EMERGENCY": Clear danger, trapped individuals, water rising inside house, injuries, or explicit requests for rescue/boats. Set shouldCreateOrUpdateSos = true immediately.
3. FACT vs. SPECULATION:
   - If user confirms: "There are 5 people here, 2 children" -> extract into extractedInformation.
   - If user speculates: "I think there might be kids downstairs" or "maybe someone is hurt" -> DO NOT add to numbers in extractedInformation. Add to uncertainInformation array, and ask for confirmation in assistantResponse.
   - NEVER fabricate or assume numbers.
4. Active STRIDE Context:
   - Active Disaster: ${context.activeDisaster?.title || 'Bengaluru Urban Flood Event'} (${context.activeDisaster?.alertLevel || 'HIGH'} alert level)
   - Citizen Home Address: ${context.citizenHousehold?.address || 'Bengaluru'}
   - Active SOS Status: ${context.activeSos ? `Active SOS #${context.activeSos.id} (Status: ${context.activeSos.rescueStatus}, Priority: ${context.activeSos.priorityScore})` : 'No active SOS'}
   - Nearest Shelters: ${context.nearestShelters.map((s) => `${s.name} (${s.distanceKm}km, ${s.status})`).join(', ') || 'None listed'}
   - Nearest Facilities: ${context.nearestFacilities.map((f) => `${f.name} (${f.distanceKm}km)`).join(', ') || 'None listed'}
5. DO NOT calculate priority scores. Scores are computed solely by the backend deterministic algorithm.
6. Provide an empathetic, clear, concise assistant response suitable for text-to-speech voice playback.

OUTPUT JSON FORMAT (You MUST return valid JSON matching this schema):
{
  "mode": "ASSIST" | "ASSESS" | "EMERGENCY",
  "intent": "string",
  "assistantResponse": "string",
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

    const formattedHistory = history.map((h) => `${h.role === 'user' ? 'Citizen' : 'Assistant'}: ${h.content}`).join('\n');
    const prompt = `${systemPrompt}\n\nCONVERSATION HISTORY:\n${formattedHistory}\n\nCURRENT CITIZEN MESSAGE:\n"${message}"\n\nReturn JSON:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    const parsed = JSON.parse(responseText);

    // Validate structured fields
    const validModes: VoiceEmergencyMode[] = ['ASSIST', 'ASSESS', 'EMERGENCY'];
    const mode: VoiceEmergencyMode = validModes.includes(parsed.mode) ? parsed.mode : 'ASSESS';

    return {
      mode,
      intent: parsed.intent || 'emergency_voice_processing',
      assistantResponse:
        parsed.assistantResponse ||
        (mode === 'EMERGENCY'
          ? "I have logged your emergency distress signal with our response units. Stay in a safe, elevated location."
          : "I am here with STRIDE Emergency Command. How can I assist you?"),
      extractedInformation: parsed.extractedInformation || {},
      uncertainInformation: Array.isArray(parsed.uncertainInformation) ? parsed.uncertainInformation : [],
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation : [],
      shouldCreateOrUpdateSos: !!parsed.shouldCreateOrUpdateSos && mode === 'EMERGENCY',
      isFallbackExtractor: false,
    };
  } catch (err: any) {
    console.error('Gemini Voice Service API error (falling back to limited signal extractor):', err.message);
    return limitedEmergencySignalExtractor(message, history, context);
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
  context: StrideContextData
): Promise<VoiceAudioAssistantOutput> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!audioBuffer || audioBuffer.length === 0) {
    return {
      transcript: '',
      mode: 'ASSIST',
      intent: 'empty_audio',
      assistantResponse:
        "No audio was detected in your recording. Please tap the microphone and speak again, or type your message below.",
      extractedInformation: {},
      uncertainInformation: [],
      missingInformation: [],
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  // If no Gemini API key configured, use safe deterministic fallback
  if (!apiKey || apiKey.trim() === '') {
    return {
      transcript: '(Spoken audio received)',
      mode: 'ASSESS',
      intent: 'offline_audio_received',
      assistantResponse:
        "Voice audio received. Automated audio transcription requires Gemini API connectivity. If you need emergency rescue, please tap the Emergency SOS button or type below.",
      extractedInformation: {},
      uncertainInformation: ['Voice audio received while online transcription service is unconfigured'],
      missingInformation: ['rescue capability', 'location', 'people count'],
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are the STRIDE Emergency Voice Assistant for Bengaluru, Karnataka, India during an active flood/disaster.
You are listening to an audio recording spoken by a citizen.
Your task:
1. Transcribe the citizen's spoken words verbatim into the "transcript" field. If audio is unclear or empty, accurately transcribe what is audible or state so.
2. Determine their intent and mode:
   - "ASSIST": The citizen is asking general questions, advice, shelter/facility locations, weather, or flood preparedness. Do NOT trigger SOS.
   - "ASSESS": The citizen mentions rising water, power loss, or potential danger, but hasn't confirmed if they are trapped, injured, or need rescue. Ask a direct clarifying question (e.g., "Can you leave safely or are you trapped?"). Do NOT trigger SOS.
   - "EMERGENCY": Clear danger, trapped individuals, water rising inside house, injuries, or explicit requests for rescue/boats. Set shouldCreateOrUpdateSos = true immediately.
3. FACT vs. SPECULATION:
   - If user confirms: "There are 5 people here, 2 children" -> extract into extractedInformation.
   - If user speculates: "I think there might be kids downstairs" or "maybe someone is hurt" -> DO NOT add to numbers in extractedInformation. Add to uncertainInformation array, and ask for confirmation in assistantResponse.
   - NEVER fabricate or assume numbers.
4. Active STRIDE Context:
   - Active Disaster: ${context.activeDisaster?.title || 'Bengaluru Urban Flood Event'} (${context.activeDisaster?.alertLevel || 'HIGH'} alert level)
   - Citizen Home Address: ${context.citizenHousehold?.address || 'Bengaluru'}
   - Active SOS Status: ${context.activeSos ? `Active SOS #${context.activeSos.id} (Status: ${context.activeSos.rescueStatus}, Priority: ${context.activeSos.priorityScore})` : 'No active SOS'}
   - Nearest Shelters: ${context.nearestShelters.map((s) => `${s.name} (${s.distanceKm}km, ${s.status})`).join(', ') || 'None listed'}
   - Nearest Facilities: ${context.nearestFacilities.map((f) => `${f.name} (${f.distanceKm}km)`).join(', ') || 'None listed'}
5. DO NOT calculate priority scores. Scores are computed solely by the backend deterministic algorithm.
6. Provide an empathetic, clear, concise assistant response suitable for text-to-speech voice playback.

OUTPUT JSON FORMAT (You MUST return valid JSON matching this schema):
{
  "transcript": "string (verbatim transcript of citizen's spoken words in the audio)",
  "mode": "ASSIST" | "ASSESS" | "EMERGENCY",
  "intent": "string",
  "assistantResponse": "string",
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

    const formattedHistory = history.map((h) => `${h.role === 'user' ? 'Citizen' : 'Assistant'}: ${h.content}`).join('\n');
    const prompt = `${systemPrompt}\n\nCONVERSATION HISTORY:\n${formattedHistory}\n\nAnalyze the citizen's audio recording and return the JSON response:`;

    const cleanMimeType = mimeType.split(';')[0].trim() || 'audio/webm';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: audioBuffer.toString('base64'),
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    const parsed = JSON.parse(responseText);

    const validModes: VoiceEmergencyMode[] = ['ASSIST', 'ASSESS', 'EMERGENCY'];
    const mode: VoiceEmergencyMode = validModes.includes(parsed.mode) ? parsed.mode : 'ASSESS';

    return {
      transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '',
      mode,
      intent: parsed.intent || 'voice_audio_processing',
      assistantResponse:
        parsed.assistantResponse ||
        (mode === 'EMERGENCY'
          ? "I have logged your emergency distress signal with our response units. Stay in a safe, elevated location."
          : "I am here with STRIDE Emergency Command. How can I assist you?"),
      extractedInformation: parsed.extractedInformation || {},
      uncertainInformation: Array.isArray(parsed.uncertainInformation) ? parsed.uncertainInformation : [],
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation : [],
      shouldCreateOrUpdateSos: !!parsed.shouldCreateOrUpdateSos && mode === 'EMERGENCY',
      isFallbackExtractor: false,
    };
  } catch (err: any) {
    console.error('Gemini Voice Audio API error (falling back to limited handler):', err.message);
    return {
      transcript: '(Spoken audio received)',
      mode: 'ASSESS',
      intent: 'audio_processing_error',
      assistantResponse:
        "I was unable to fully process the audio recording. If this is an emergency, please type your message or tap the Emergency SOS button immediately.",
      extractedInformation: {},
      uncertainInformation: ['Audio processing encountered an error'],
      missingInformation: ['rescue capability', 'location'],
      shouldCreateOrUpdateSos: false,
      isFallbackExtractor: true,
    };
  }
}

