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
): Promise<{ locationConflict: boolean; activeSosRecord: any }> {
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

  if (aiResult.mode === 'EMERGENCY' || aiResult.shouldCreateOrUpdateSos) {
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

    if (existingReq) {
      // ========== UPDATE EXISTING SOS IN-PLACE (NO DUPLICATE) ==========
      const prevFormatted = formatRescueRequest(existingReq);

      const mergedPeople = Math.max(prevFormatted.peopleCount, extracted.peopleCount || 1);
      const mergedChildren = Math.max(prevFormatted.childrenCount, extracted.childrenCount || 0);
      const mergedElderly = Math.max(prevFormatted.elderlyCount, extracted.elderlyCount || 0);
      const mergedDisabled = Math.max(prevFormatted.disabledCount, extracted.disabledCount || 0);
      const mergedInjured = Math.max(prevFormatted.injuredCount, extracted.injuredCount || 0);
      const mergedCritical = prevFormatted.criticalMedicalNeed || !!extracted.criticalMedicalNeed;
      const mergedWaterLevel = extracted.waterLevel || prevFormatted.waterLevel || 'MEDIUM';
      const mergedEmergencyType = extracted.emergencyType || prevFormatted.emergencyType || 'FLOOD';
      const spokenLoc = extracted.spokenLocation || prevFormatted.spokenLocation;
      const isConflict = locationConflict || prevFormatted.locationConflict;

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
        elderly: mergedElderly > 0 ? Math.min(15, Number(elderlyCountMerged(prevFormatted, extracted)) * 8) : 0,
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
    } else {
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
    }
  } else if (context.activeSos) {
    const existingReq = await prisma.emergencyRequest.findUnique({
      where: { id: context.activeSos.id },
      include: {
        conditions: true,
        rescueAssignments: { orderBy: { assignedAt: 'desc' } },
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
    });
    if (existingReq) {
      activeSosRecord = formatRescueRequest(existingReq);
    }
  }

  return { locationConflict, activeSosRecord };
}

function elderlyCountMerged(prevFormatted: any, extracted: any): number {
  return Math.max(prevFormatted.elderlyCount || 0, extracted.elderlyCount || 0);
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
    } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({ error: 'Voice message text is required.' });
      return;
    }

    // 1. Gather authentic STRIDE context
    const context = await getStrideContext(userId, currentLocation);

    // 2. Call Gemini voice service (with limited emergency signal extractor fallback)
    const aiResult: VoiceAssistantOutput = await processEmergencyVoiceInput(
      message.trim(),
      Array.isArray(history) ? history : [],
      context
    );

    // 3. Apply unified SOS triage and lifecycle management
    const { locationConflict, activeSosRecord } = await applySosLifecycleAndTriage(
      userId,
      context,
      aiResult,
      message,
      currentLocation,
      activeRequestId
    );

    res.json({
      mode: aiResult.mode,
      intent: aiResult.intent,
      assistantResponse: aiResult.assistantResponse,
      extractedInformation: aiResult.extractedInformation || {},
      uncertainInformation: aiResult.uncertainInformation || [],
      missingInformation: aiResult.missingInformation || [],
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

    const clientRequestId =
      (typeof req.body.clientRequestId === 'string' && req.body.clientRequestId.trim()) ||
      (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()) ||
      `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    console.log(
      `[STRIDE Voice Emergency Audio] Request received. clientRequestId: ${clientRequestId}, user: ${userId}, size: ${file.buffer.length} bytes, mimetype: ${file.mimetype}`
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

    // 2. Call Gemini multimodal audio service
    const aiResult: VoiceAudioAssistantOutput = await processEmergencyAudioInput(
      file.buffer,
      file.mimetype || 'audio/webm',
      Array.isArray(history) ? history : [],
      context,
      clientRequestId
    );

    // 3. Apply unified SOS triage and lifecycle management
    const messageForTriage = aiResult.transcript && aiResult.transcript.trim() !== ''
      ? aiResult.transcript.trim()
      : 'Spoken emergency voice audio input';

    const { locationConflict, activeSosRecord } = await applySosLifecycleAndTriage(
      userId,
      context,
      aiResult,
      messageForTriage,
      currentLocation,
      activeRequestId
    );

    res.json({
      clientRequestId,
      transcript: aiResult.transcript || '',
      mode: aiResult.mode,
      intent: aiResult.intent,
      assistantResponse: aiResult.assistantResponse,
      extractedInformation: aiResult.extractedInformation || {},
      uncertainInformation: aiResult.uncertainInformation || [],
      missingInformation: aiResult.missingInformation || [],
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
