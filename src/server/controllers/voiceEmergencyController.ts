import { Response } from 'express';
import prisma from '../config/database.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { getStrideContext, StrideContextData } from '../services/strideContextService.ts';
import {
  processEmergencyVoiceInput,
  processEmergencyAudioInput,
  VoiceAssistantOutput,
  VoiceAudioAssistantOutput,
} from '../services/geminiVoiceService.ts';
import { formatRescueRequest } from './rescueController.ts';
import { calculateHaversineDistance } from '../utils/geo.ts';

const KNOWN_LOCALITY_COORDS: Record<string, [number, number]> = {
  indiranagar: [12.9784, 77.6408],
  koramangala: [12.9352, 77.6245],
  whitefield: [12.9698, 77.7499],
  yelahanka: [13.1007, 77.5963],
  jayanagar: [12.9308, 77.5838],
  'btm layout': [12.9166, 77.6101],
  btm: [12.9166, 77.6101],
  malleshwaram: [13.0031, 77.5643],
  hebbal: [13.0358, 77.5970],
  'hsr layout': [12.9121, 77.6446],
  hsr: [12.9121, 77.6446],
  marathahalli: [12.9591, 77.6974],
  'electronic city': [12.8452, 77.6602],
  binnamangala: [12.9815, 77.6450],
  saidapet: [13.0213, 80.2231],
  'mg road': [12.9756, 77.6066],
  cubbon: [12.9763, 77.5929],
  majestic: [12.9767, 77.5713],
  rajajinagar: [12.9982, 77.5530],
  vijayanagar: [12.9719, 77.5369],
};

function detectLocationConflict(
  gpsLat: number,
  gpsLng: number,
  spokenLocation?: string
): { conflict: boolean; estimatedDistanceKm?: number } {
  if (!spokenLocation) return { conflict: false };

  const lowerSpoken = spokenLocation.toLowerCase();
  for (const [name, coords] of Object.entries(KNOWN_LOCALITY_COORDS)) {
    if (lowerSpoken.includes(name)) {
      const dist = calculateHaversineDistance(gpsLat, gpsLng, coords[0], coords[1]);
      if (dist > 5.0) {
        return { conflict: true, estimatedDistanceKm: parseFloat(dist.toFixed(1)) };
      }
    }
  }
  return { conflict: false };
}

/**
 * Common SOS triage and lifecycle management helper.
 * Strictly preserves:
 * - Deterministic priority scoring formula
 * - SOS deduplication (updating active SOS in place)
 * - [SRC:VOICE] metadata tagging
 * - Location discrepancy detection
 */
export async function applySosLifecycleAndTriage(
  userId: string,
  context: StrideContextData,
  aiResult: VoiceAssistantOutput,
  messageText: string,
  currentLocation?: { latitude: number; longitude: number },
  activeRequestId?: string
): Promise<{
  locationConflict: boolean;
  activeSosRecord: any;
  sosBeforeSummary?: any;
  sosUpdateSummary?: any;
  sosAfterSummary?: any;
}> {
  let locationConflict = false;
  const gpsLat = currentLocation?.latitude || context.citizenHousehold?.latitude || 12.9716;
  const gpsLng = currentLocation?.longitude || context.citizenHousehold?.longitude || 77.5946;

  if (aiResult.extractedInformation?.spokenLocation) {
    const conflictCheck = detectLocationConflict(
      gpsLat,
      gpsLng,
      aiResult.extractedInformation.spokenLocation
    );
    if (conflictCheck.conflict) {
      locationConflict = true;
    }
  }

  let activeSosRecord: any = null;

  // Find active request: first by explicit activeRequestId, then by user's household active request
  let existingReq = null;
    if (activeRequestId) {
      existingReq = await prisma.emergencyRequest.findFirst({
        where: {
          id: activeRequestId,
          rescueStatus: { not: 'CANCELLED' },
        },
        include: {
          conditions: true,
          rescueAssignments: { orderBy: { assignedAt: 'desc' } },
          householdMember: {
            include: { household: { include: { user: true } } },
          },
        },
      });
    }

    if (!existingReq && context.citizenHousehold) {
      const memberIds = context.citizenHousehold.members.map((m) => m.id);
      existingReq = await prisma.emergencyRequest.findFirst({
        where: {
          householdMemberId: { in: memberIds },
          rescueStatus: { not: 'CANCELLED' },
        },
        include: {
          conditions: true,
          rescueAssignments: { orderBy: { assignedAt: 'desc' } },
          householdMember: {
            include: { household: { include: { user: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

  const extracted = aiResult.extractedInformation || {};
  const hasExtractedFacts = Object.keys(extracted).length > 0;
  let sosBeforeSummary: any = null;
  let sosUpdateSummary: any = null;
  let sosAfterSummary: any = null;

  if (existingReq) {
    const prevFormatted = formatRescueRequest(existingReq);
    sosBeforeSummary = {
      id: existingReq.id,
      peopleCount: prevFormatted.peopleCount,
      childrenCount: prevFormatted.childrenCount,
      elderlyCount: prevFormatted.elderlyCount,
      disabledCount: prevFormatted.disabledCount,
      injuredCount: prevFormatted.injuredCount,
      waterLevel: prevFormatted.waterLevel,
      emergencyType: prevFormatted.emergencyType,
      priorityScore: existingReq.priorityScore,
    };

    const shouldUpdateSos = aiResult.mode === 'EMERGENCY' || aiResult.shouldCreateOrUpdateSos || hasExtractedFacts;

    if (shouldUpdateSos) {
      // ========== UPDATE EXISTING SOS IN-PLACE (NO DUPLICATE) ==========
      // Rule 2: Strict deterministic merge.
      // currentTurn[field] !== undefined ? currentTurn[field] : existing[field]
      const mergedPeople = extracted.peopleCount !== undefined ? extracted.peopleCount : prevFormatted.peopleCount;
      const mergedChildren = extracted.childrenCount !== undefined ? extracted.childrenCount : prevFormatted.childrenCount;
      const mergedElderly = extracted.elderlyCount !== undefined ? extracted.elderlyCount : prevFormatted.elderlyCount;
      const mergedDisabled = extracted.disabledCount !== undefined ? extracted.disabledCount : prevFormatted.disabledCount;
      const mergedInjured = extracted.injuredCount !== undefined ? extracted.injuredCount : prevFormatted.injuredCount;
      const mergedCritical = extracted.criticalMedicalNeed !== undefined ? extracted.criticalMedicalNeed : prevFormatted.criticalMedicalNeed;
      const mergedWaterLevel = extracted.waterLevel !== undefined ? extracted.waterLevel : prevFormatted.waterLevel;
      const mergedEmergencyType = extracted.emergencyType !== undefined ? extracted.emergencyType : prevFormatted.emergencyType;
      const spokenLoc = extracted.spokenLocation !== undefined ? extracted.spokenLocation : prevFormatted.spokenLocation;
      const isConflict = locationConflict !== undefined ? locationConflict : prevFormatted.locationConflict;

      sosUpdateSummary = {
        peopleCount: mergedPeople,
        childrenCount: mergedChildren,
        elderlyCount: mergedElderly,
        disabledCount: mergedDisabled,
        injuredCount: mergedInjured,
        waterLevel: mergedWaterLevel,
        emergencyType: mergedEmergencyType,
      };

      const currentCondTypes = new Set(existingReq.conditions.map((c) => c.conditionType));
      currentCondTypes.add('NEED_RESCUE');
      if (mergedCritical) currentCondTypes.add('SERIOUSLY_UNWELL');
      if (mergedInjured > 0) currentCondTypes.add('HEAVILY_INJURED');
      if (mergedChildren > 0) currentCondTypes.add('CHILDREN_INFANTS_PRESENT');
      if (mergedDisabled > 0) currentCondTypes.add('PHYSICALLY_DISABLED');
      if (mergedWaterLevel === 'HIGH' || mergedWaterLevel === 'EXTREME') currentCondTypes.add('WATER_RISING');
      if (mergedEmergencyType === 'TRAPPED') currentCondTypes.add('TRAPPED');
      if (mergedEmergencyType === 'FIRE') currentCondTypes.add('FIRE');
      if (Array.isArray(extracted.conditions)) {
        extracted.conditions.forEach((c) => currentCondTypes.add(c));
      }

      // Exact existing STRIDE priority formula (DO NOT MODIFY)
      const breakdown = {
        criticalMedical: mergedCritical ? 25 : 0,
        injured: mergedInjured > 0 ? Math.min(25, Number(mergedInjured) * 15) : 0,
        children: mergedChildren > 0 ? Math.min(15, Number(mergedChildren) * 8) : 0,
        elderly: mergedElderly > 0 ? Math.min(15, Number(mergedElderly) * 8) : 0,
        disabled: mergedDisabled > 0 ? Math.min(15, Number(mergedDisabled) * 10) : 0,
        waterLevel:
          mergedWaterLevel === 'EXTREME'
            ? 20
            : mergedWaterLevel === 'HIGH'
            ? 15
            : mergedWaterLevel === 'MEDIUM'
            ? 10
            : 5,
        trappedOrStructural:
          mergedEmergencyType === 'TRAPPED' || mergedEmergencyType === 'STRUCTURAL_DANGER'
            ? 20
            : mergedEmergencyType === 'FIRE'
            ? 30
            : 0,
      };

      const calculatedTotal = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const priorityScore = Math.min(100, Math.max(15, calculatedTotal));

      const metaTag = `[SRC:VOICE, P:${mergedPeople}, C:${mergedChildren}, E:${mergedElderly}, D:${mergedDisabled}, I:${mergedInjured}, W:${mergedWaterLevel}, T:${mergedEmergencyType}${spokenLoc ? `, SPOKEN_LOC:${spokenLoc}` : ''}${isConflict ? ', CONFLICT:YES' : ', CONFLICT:NO'}]`;
      const updatedDesc = `${metaTag} ${prevFormatted.description} | Voice update: ${messageText.trim()}`.trim();

      await prisma.emergencyCondition.deleteMany({
        where: { emergencyRequestId: existingReq.id },
      });
      await prisma.emergencyCondition.createMany({
        data: Array.from(currentCondTypes).map((c) => ({
          emergencyRequestId: existingReq.id,
          conditionType: String(c),
        })),
      });

      const updatedReq = await prisma.emergencyRequest.update({
        where: { id: existingReq.id },
        data: {
          description: updatedDesc,
          priorityScore,
          updatedAt: new Date(),
        },
        include: {
          conditions: true,
          rescueAssignments: { orderBy: { assignedAt: 'desc' } },
          householdMember: {
            include: { household: { include: { user: true } } },
          },
        },
      });

      activeSosRecord = formatRescueRequest(updatedReq, undefined, breakdown);
      sosAfterSummary = {
        id: updatedReq.id,
        peopleCount: activeSosRecord.peopleCount,
        childrenCount: activeSosRecord.childrenCount,
        elderlyCount: activeSosRecord.elderlyCount,
        disabledCount: activeSosRecord.disabledCount,
        injuredCount: activeSosRecord.injuredCount,
        waterLevel: activeSosRecord.waterLevel,
        emergencyType: activeSosRecord.emergencyType,
        priorityScore: activeSosRecord.priorityScore,
      };
    } else {
      activeSosRecord = prevFormatted;
      sosAfterSummary = sosBeforeSummary;
    }
  } else if (aiResult.mode === 'EMERGENCY' || aiResult.shouldCreateOrUpdateSos) {
      // ========== CREATE NEW SOS USING EXISTING STRIDE LOGIC ==========
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          households: {
            include: { members: true },
          },
        },
      });

      let household = user?.households?.[0];
      if (!household) {
        household = await prisma.household.create({
          data: {
            userId,
            name: `${user?.name || 'Citizen'} Household`,
            address: extracted.spokenLocation || 'Bengaluru',
            city: 'Bengaluru',
            state: 'Karnataka',
            latitude: Number(gpsLat) || 12.9716,
            longitude: Number(gpsLng) || 77.5946,
            members: {
              create: {
                name: user?.name || 'Primary Citizen',
                age: 35,
                category: 'ADULT',
                relationship: 'Self',
              },
            },
          },
          include: { members: true },
        });
      }

      let member = household.members?.[0];
      if (!member) {
        member = await prisma.householdMember.create({
          data: {
            householdId: household.id,
            name: user?.name || 'Primary Citizen',
            age: 35,
            category: 'ADULT',
            relationship: 'Self',
          },
        });
      }

      const activeDisaster =
        (await prisma.disasterEvent.findFirst({
          where: { status: { in: ['PREDICTED', 'ACTIVE', 'WARNING'] } },
          orderBy: { predictedStartTime: 'asc' },
        })) ||
        (await prisma.disasterEvent.findFirst({
          orderBy: { createdAt: 'desc' },
        }));

      if (!activeDisaster) {
        throw new Error('No active disaster event found for triage.');
      }

      const peopleCount = Math.max(1, extracted.peopleCount || 1);
      const childrenCount = Math.max(0, extracted.childrenCount || 0);
      const elderlyCount = Math.max(0, extracted.elderlyCount || 0);
      const disabledCount = Math.max(0, extracted.disabledCount || 0);
      const injuredCount = Math.max(0, extracted.injuredCount || 0);
      const criticalMedicalNeed = !!extracted.criticalMedicalNeed;
      const waterLevel = extracted.waterLevel || 'HIGH';
      const emergencyType = extracted.emergencyType || 'FLOOD';
      const spokenLoc = extracted.spokenLocation || undefined;

      const conditionList: string[] = ['NEED_RESCUE'];
      if (criticalMedicalNeed) conditionList.push('SERIOUSLY_UNWELL');
      if (injuredCount > 0) conditionList.push('HEAVILY_INJURED');
      if (childrenCount > 0) conditionList.push('CHILDREN_INFANTS_PRESENT');
      if (disabledCount > 0) conditionList.push('PHYSICALLY_DISABLED');
      if (waterLevel === 'HIGH' || waterLevel === 'EXTREME') conditionList.push('WATER_RISING');
      if (emergencyType === 'TRAPPED') conditionList.push('TRAPPED');
      if (emergencyType === 'FIRE') conditionList.push('FIRE');

      // Exact existing STRIDE priority formula (DO NOT MODIFY)
      const breakdown = {
        criticalMedical: criticalMedicalNeed ? 25 : 0,
        injured: injuredCount > 0 ? Math.min(25, Number(injuredCount) * 15) : 0,
        children: childrenCount > 0 ? Math.min(15, Number(childrenCount) * 8) : 0,
        elderly: elderlyCount > 0 ? Math.min(15, Number(elderlyCount) * 8) : 0,
        disabled: disabledCount > 0 ? Math.min(15, Number(disabledCount) * 10) : 0,
        waterLevel:
          waterLevel === 'EXTREME' ? 20 : waterLevel === 'HIGH' ? 15 : waterLevel === 'MEDIUM' ? 10 : 5,
        trappedOrStructural:
          emergencyType === 'TRAPPED' || emergencyType === 'STRUCTURAL_DANGER' ? 20 : emergencyType === 'FIRE' ? 30 : 0,
      };

      const calculatedTotal = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const priorityScore = Math.min(100, Math.max(15, calculatedTotal));

      const metaTag = `[SRC:VOICE, P:${peopleCount}, C:${childrenCount}, E:${elderlyCount}, D:${disabledCount}, I:${injuredCount}, W:${waterLevel}, T:${emergencyType}${spokenLoc ? `, SPOKEN_LOC:${spokenLoc}` : ''}${locationConflict ? ', CONFLICT:YES' : ', CONFLICT:NO'}]`;
      const fullDesc = `${metaTag} ${messageText.trim()}`;

      const requestRecord = await prisma.emergencyRequest.create({
        data: {
          disasterId: activeDisaster.id,
          householdMemberId: member.id,
          latitude: Number(gpsLat) || household.latitude,
          longitude: Number(gpsLng) || household.longitude,
          address: spokenLoc || household.address || 'Bengaluru',
          description: fullDesc,
          priorityScore,
          rescueStatus: 'PENDING',
          conditions: {
            create: conditionList.map((c) => ({ conditionType: c })),
          },
        },
        include: {
          conditions: true,
          rescueAssignments: true,
          householdMember: {
            include: { household: { include: { user: true } } },
          },
        },
      });

      await prisma.emergencyStatus.upsert({
        where: {
          disasterId_householdMemberId: {
            disasterId: activeDisaster.id,
            householdMemberId: member.id,
          },
        },
        update: {
          status: 'IN_DISTRESS',
          updatedAt: new Date(),
        },
        create: {
          disasterId: activeDisaster.id,
          householdMemberId: member.id,
          status: 'IN_DISTRESS',
        },
      });

      activeSosRecord = formatRescueRequest(requestRecord, user, breakdown);
      sosAfterSummary = {
        id: requestRecord.id,
        peopleCount: activeSosRecord.peopleCount,
        childrenCount: activeSosRecord.childrenCount,
        elderlyCount: activeSosRecord.elderlyCount,
        disabledCount: activeSosRecord.disabledCount,
        injuredCount: activeSosRecord.injuredCount,
        waterLevel: activeSosRecord.waterLevel,
        emergencyType: activeSosRecord.emergencyType,
        priorityScore: activeSosRecord.priorityScore,
      };
    }

  return {
    locationConflict,
    activeSosRecord,
    sosBeforeSummary,
    sosUpdateSummary,
    sosAfterSummary,
  };
}

export async function handleVoiceEmergencyChat(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const {
      message,
      history = [],
      currentLocation,
      activeRequestId,
      sessionId,
      clientRequestId,
    } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({ error: 'Voice message text is required.' });
      return;
    }

    const sId =
      (typeof sessionId === 'string' && sessionId.trim()) ||
      `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const reqId =
      (typeof clientRequestId === 'string' && clientRequestId.trim()) ||
      (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()) ||
      `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 1. Gather authentic STRIDE context
    const context = await getStrideContext(userId, currentLocation);

    // Fetch existing incident facts if active SOS exists
    let existingIncidentFacts: any = undefined;
    const effectiveSosId = activeRequestId || context.activeSos?.id;
    if (effectiveSosId) {
      const existingSos = await prisma.emergencyRequest.findFirst({
        where: { id: effectiveSosId, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true },
      });
      if (existingSos) {
        const prev = formatRescueRequest(existingSos);
        existingIncidentFacts = {
          peopleCount: prev.peopleCount,
          childrenCount: prev.childrenCount,
          elderlyCount: prev.elderlyCount,
          disabledCount: prev.disabledCount,
          injuredCount: prev.injuredCount,
          criticalMedicalNeed: prev.criticalMedicalNeed,
          waterLevel: prev.waterLevel,
          emergencyType: prev.emergencyType,
          spokenLocation: prev.spokenLocation,
          conditions: existingSos.conditions
            ? existingSos.conditions.map((c: any) => c.conditionType)
            : [],
        };
      }
    }

    // Safe diagnostic logging (Requirement 12)
    console.log('[STRIDE Voice Emergency Diagnostic - Chat Request]', {
      sessionId: sId,
      clientRequestId: reqId,
      activeRequestId: effectiveSosId || null,
      currentMessage: message.trim(),
      historyCount: Array.isArray(history) ? history.length : 0,
      last3History: Array.isArray(history) ? history.slice(-3) : [],
      existingSosFacts: existingIncidentFacts || null,
    });

    // 2. Call Gemini voice service (with conversational progression & fallback)
    const aiResult: VoiceAssistantOutput = await processEmergencyVoiceInput(
      message.trim(),
      Array.isArray(history) ? history : [],
      context,
      existingIncidentFacts,
      reqId
    );

    // 3. Apply unified SOS triage and lifecycle management
    const {
      locationConflict,
      activeSosRecord,
      sosBeforeSummary,
      sosUpdateSummary,
      sosAfterSummary,
    } = await applySosLifecycleAndTriage(
      userId,
      context,
      aiResult,
      message,
      currentLocation,
      activeRequestId
    );

    console.log('==================================================');
    console.log('[STRIDE Voice Emergency Diagnostic Turn - Text]');
    console.log('sessionId:', sId);
    console.log('clientRequestId:', reqId);
    console.log('activeRequestId:', effectiveSosId || null);
    console.log('CURRENT USER:', message.trim());
    console.log('HISTORY:', Array.isArray(history) ? history.slice(-3) : []);
    console.log('EXISTING INCIDENT (Context only, NOT current-turn facts):', existingIncidentFacts || 'None');
    console.log('CONFIRMED FACTS:', existingIncidentFacts || {});
    console.log('TRANSCRIPT:', message.trim());
    console.log('CURRENT-TURN EXTRACTION (Authoritative for this turn):', aiResult.extractedInformation || {});
    console.log('RESPONSE GENERATION INPUT:', {
      currentUserUtterance: message.trim(),
      confirmedIncidentFacts: existingIncidentFacts || null,
      extractedCurrentTurnFacts: aiResult.extractedInformation || {},
    });
    console.log('RESPONSE GENERATION OUTPUT:', {
      mode: aiResult.mode,
      intent: aiResult.intent,
      assistantResponse: aiResult.assistantResponse,
    });
    console.log('FINAL UI MESSAGE:', aiResult.assistantResponse);
    console.log('SOS BEFORE:', sosBeforeSummary ? JSON.stringify(sosBeforeSummary) : 'None');
    console.log('SOS UPDATE:', sosUpdateSummary ? JSON.stringify(sosUpdateSummary) : 'None');
    console.log('SOS AFTER:', sosAfterSummary ? JSON.stringify(sosAfterSummary) : 'None');
    console.log('==================================================');

    res.json({
      sessionId: sId,
      clientRequestId: reqId,
      mode: aiResult.mode,
      intent: aiResult.intent,
      assistantResponse: aiResult.assistantResponse,
      extractedInformation: aiResult.extractedInformation || {},
      existingIncidentFacts,
      uncertainInformation: aiResult.uncertainInformation || [],
      missingInformation: aiResult.missingInformation || [],
      questionTarget: aiResult.questionTarget || undefined,
      shouldCreateOrUpdateSos: aiResult.shouldCreateOrUpdateSos,
      locationConflict,
      activeRequest: activeSosRecord,
      isFallbackExtractor: aiResult.isFallbackExtractor || false,
    });
  } catch (err: any) {
    console.error('Voice emergency chat controller error:', err);
    res.status(500).json({ error: err.message || 'Internal error processing voice emergency input.' });
  }
}

export async function handleVoiceEmergencyAudio(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const file = req.file;

    if (!file || !file.buffer || file.buffer.length === 0) {
      res.status(400).json({ error: 'Microphone audio recording file is required.' });
      return;
    }

    const sId =
      (typeof req.body.sessionId === 'string' && req.body.sessionId.trim()) ||
      `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const clientRequestId =
      (typeof req.body.clientRequestId === 'string' && req.body.clientRequestId.trim()) ||
      (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()) ||
      `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    console.log(
      `[STRIDE Voice Emergency Audio] Request received. sessionId: ${sId}, clientRequestId: ${clientRequestId}, user: ${userId}, size: ${file.buffer.length} bytes, mimetype: ${file.mimetype}`
    );

    // Parse history, currentLocation, activeRequestId from multipart FormData
    let history: any[] = [];
    if (req.body.history) {
      try {
        history = typeof req.body.history === 'string' ? JSON.parse(req.body.history) : req.body.history;
      } catch {
        history = [];
      }
    }

    let currentLocation: { latitude: number; longitude: number } | undefined = undefined;
    if (req.body.currentLocation) {
      try {
        currentLocation =
          typeof req.body.currentLocation === 'string'
            ? JSON.parse(req.body.currentLocation)
            : req.body.currentLocation;
      } catch {
        currentLocation = undefined;
      }
    }

    const activeRequestId: string | undefined =
      typeof req.body.activeRequestId === 'string' && req.body.activeRequestId.trim() !== ''
        ? req.body.activeRequestId.trim()
        : undefined;

    // 1. Gather authentic STRIDE context
    const context = await getStrideContext(userId, currentLocation);

    // Fetch existing incident facts if active SOS exists
    let existingIncidentFacts: any = undefined;
    const effectiveSosId = activeRequestId || context.activeSos?.id;
    if (effectiveSosId) {
      const existingSos = await prisma.emergencyRequest.findFirst({
        where: { id: effectiveSosId, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true },
      });
      if (existingSos) {
        const prev = formatRescueRequest(existingSos);
        existingIncidentFacts = {
          peopleCount: prev.peopleCount,
          childrenCount: prev.childrenCount,
          elderlyCount: prev.elderlyCount,
          disabledCount: prev.disabledCount,
          injuredCount: prev.injuredCount,
          criticalMedicalNeed: prev.criticalMedicalNeed,
          waterLevel: prev.waterLevel,
          emergencyType: prev.emergencyType,
          spokenLocation: prev.spokenLocation,
          conditions: existingSos.conditions
            ? existingSos.conditions.map((c: any) => c.conditionType)
            : [],
        };
      }
    }

    // 2. Call two-stage audio service (Stage 1 transcribe -> Stage 2 text triage)
    const aiResult: VoiceAudioAssistantOutput = await processEmergencyAudioInput(
      file.buffer,
      file.mimetype || 'audio/webm',
      Array.isArray(history) ? history : [],
      context,
      existingIncidentFacts,
      clientRequestId
    );

    // 3. Apply unified SOS triage and lifecycle management
    const messageForTriage =
      aiResult.transcript && aiResult.transcript.trim() !== ''
        ? aiResult.transcript.trim()
        : 'Spoken emergency voice audio input';

    const {
      locationConflict,
      activeSosRecord,
      sosBeforeSummary,
      sosUpdateSummary,
      sosAfterSummary,
    } = await applySosLifecycleAndTriage(
      userId,
      context,
      aiResult,
      messageForTriage,
      currentLocation,
      activeRequestId
    );

    console.log('==================================================');
    console.log('[STRIDE Voice Emergency Diagnostic Turn - Audio]');
    console.log('sessionId:', sId);
    console.log('clientRequestId:', clientRequestId);
    console.log('activeRequestId:', effectiveSosId || null);
    console.log('CURRENT USER: [Voice Recording]');
    console.log('HISTORY:', Array.isArray(history) ? history.slice(-3) : []);
    console.log('EXISTING INCIDENT (Context only, NOT current-turn facts):', existingIncidentFacts || 'None');
    console.log('CONFIRMED FACTS:', existingIncidentFacts || {});
    console.log('TRANSCRIPT:', aiResult.transcript || 'None');
    console.log('CURRENT-TURN EXTRACTION (Authoritative for this turn):', aiResult.extractedInformation || {});
    console.log('RESPONSE GENERATION INPUT:', {
      currentUserUtterance: aiResult.transcript || '[Voice Recording]',
      confirmedIncidentFacts: existingIncidentFacts || null,
      extractedCurrentTurnFacts: aiResult.extractedInformation || {},
    });
    console.log('RESPONSE GENERATION OUTPUT:', {
      mode: aiResult.mode,
      intent: aiResult.intent,
      assistantResponse: aiResult.assistantResponse,
    });
    console.log('FINAL UI MESSAGE:', aiResult.assistantResponse);
    console.log('SOS BEFORE:', sosBeforeSummary ? JSON.stringify(sosBeforeSummary) : 'None');
    console.log('SOS UPDATE:', sosUpdateSummary ? JSON.stringify(sosUpdateSummary) : 'None');
    console.log('SOS AFTER:', sosAfterSummary ? JSON.stringify(sosAfterSummary) : 'None');
    console.log('==================================================');

    res.json({
      sessionId: sId,
      clientRequestId,
      transcript: aiResult.transcript || '',
      mode: aiResult.mode,
      intent: aiResult.intent,
      assistantResponse: aiResult.assistantResponse,
      extractedInformation: aiResult.extractedInformation || {},
      existingIncidentFacts,
      uncertainInformation: aiResult.uncertainInformation || [],
      missingInformation: aiResult.missingInformation || [],
      questionTarget: aiResult.questionTarget || undefined,
      shouldCreateOrUpdateSos: aiResult.shouldCreateOrUpdateSos,
      locationConflict,
      activeRequest: activeSosRecord,
      isFallbackExtractor: aiResult.isFallbackExtractor || false,
    });
  } catch (err: any) {
    console.error('Voice emergency audio controller error:', err);
    res.status(500).json({ error: err.message || 'Internal error processing emergency audio input.' });
  }
}

/**
 * Safe test beacon reset endpoint.
 * Rule 7: Only affects authenticated citizen's own active test beacon,
 * never deletes historical records, cancels active status safely.
 */
export async function handleResetTestBeacon(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { households: { include: { members: true } } },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const memberIds = user.households.flatMap((h) => h.members.map((m) => m.id));

    const result = await prisma.emergencyRequest.updateMany({
      where: {
        householdMemberId: { in: memberIds },
        rescueStatus: { not: 'CANCELLED' },
      },
      data: {
        rescueStatus: 'CANCELLED',
        updatedAt: new Date(),
      },
    });

    console.log(`[STRIDE Test Reset] User ${userId} safely cancelled ${result.count} active emergency request(s).`);
    res.json({
      success: true,
      message: `Safely cancelled ${result.count} active emergency beacon(s) for user.`,
      cancelledCount: result.count,
    });
  } catch (err: any) {
    console.error('Reset test beacon error:', err);
    res.status(500).json({ error: err.message || 'Failed to reset test beacon.' });
  }
}

