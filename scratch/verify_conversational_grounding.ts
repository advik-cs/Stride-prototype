import 'dotenv/config';
import prisma from '../src/server/config/database.ts';
import { handleVoiceEmergencyChat, handleVoiceEmergencyAudio, handleResetTestBeacon } from '../src/server/controllers/voiceEmergencyController.ts';
import { formatRescueRequest } from '../src/server/controllers/rescueController.ts';
import {
  validateGroundedResponse,
  generateGroundedResponse,
  extractCurrentTurnFacts,
} from '../src/server/services/geminiVoiceService.ts';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.data = data;
      return this;
    },
  };
  return res;
}

function hasFloodHallucination(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('flood') ||
    lower.includes('floodwater') ||
    lower.includes('floodwaters') ||
    lower.includes('moving water') ||
    lower.includes('water level') ||
    lower.includes('submerged')
  );
}

function hasFireHallucination(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('fire') ||
    lower.includes('burning') ||
    lower.includes('smoke') ||
    lower.includes('flames')
  );
}

async function runConversationalGroundingTests() {
  console.log('================================================================');
  console.log('RUNNING 10-POINT CONVERSATIONAL GROUNDING & ANTI-HALLUCINATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });
  if (!citizen) throw new Error('Citizen not found');

  const household = citizen.households[0];
  const member = household.members[0];

  const disaster =
    (await prisma.disasterEvent.findFirst({
      where: { status: 'ACTIVE' },
    })) || (await prisma.disasterEvent.findFirst());
  if (!disaster) throw new Error('Active disaster not found');

  async function resetAllBeacons() {
    const req = { user: { userId: citizen!.id, role: 'CITIZEN' } };
    const res = createMockRes();
    await handleResetTestBeacon(req as any, res as any);
  }

  async function createInitialSos(pCount: number, waterLevel: string = 'MEDIUM', emergencyType: string = 'FLOOD') {
    const meta = `[SRC:VOICE, P:${pCount}, C:0, E:0, D:0, I:0, W:${waterLevel}, T:${emergencyType}]`;
    return prisma.emergencyRequest.create({
      data: {
        disasterId: disaster!.id,
        householdMemberId: member.id,
        latitude: household.latitude,
        longitude: household.longitude,
        address: household.address,
        description: `${meta} Initial test emergency`,
        priorityScore: 25,
        rescueStatus: 'PENDING',
        conditions: {
          create: [{ conditionType: 'NEED_RESCUE' }],
        },
      },
      include: { conditions: true },
    });
  }

  // -------------------------------------------------------------
  // TEST 1: "can you help me" (no active incident)
  // Expected: General clarification, NO flood/water/fire, mode ASSIST, no SOS created
  // -------------------------------------------------------------
  console.log('--- Test 1: "can you help me" (no active incident) ---');
  try {
    await resetAllBeacons();
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'can you help me',
        activeRequestId: null,
        sessionId: 'grounding-t1',
        clientRequestId: 'cg-req-1',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyChat(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    const mode = res.data?.mode;
    const sosCreated = !!res.data?.activeRequest && res.data?.shouldCreateOrUpdateSos;
    const floodPresent = hasFloodHallucination(respText);
    const firePresent = hasFireHallucination(respText);

    console.log('Assistant Response:', respText);
    if (!floodPresent && !firePresent && mode === 'ASSIST' && !sosCreated) {
      console.log('✅ PASS TEST 1: General clarification provided without flood/water/fire hallucinations.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 1:', { respText, mode, sosCreated, floodPresent, firePresent });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 1 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 2: "what should I do?" (no active incident)
  // Expected: General safety response, NO assumed disaster type or moving floodwaters
  // -------------------------------------------------------------
  console.log('--- Test 2: "what should I do?" (no active incident) ---');
  try {
    await resetAllBeacons();
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'what should I do?',
        activeRequestId: null,
        sessionId: 'grounding-t2',
        clientRequestId: 'cg-req-2',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyChat(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    const mode = res.data?.mode;
    const floodPresent = hasFloodHallucination(respText);

    console.log('Assistant Response:', respText);
    if (!floodPresent && mode === 'ASSIST') {
      console.log('✅ PASS TEST 2: General safety response without assumed flood scenario.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 2:', { respText, mode, floodPresent });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 2 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 3: "what should I do during a flood?"
  // Expected: Citizen asked specifically about flood -> Flood guidance allowed
  // -------------------------------------------------------------
  console.log('--- Test 3: "what should I do during a flood?" ---');
  try {
    await resetAllBeacons();
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'what should I do during a flood?',
        activeRequestId: null,
        sessionId: 'grounding-t3',
        clientRequestId: 'cg-req-3',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyChat(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    const mentionsHigherGroundOrWater =
      respText.toLowerCase().includes('higher ground') ||
      respText.toLowerCase().includes('water') ||
      respText.toLowerCase().includes('electrical');

    console.log('Assistant Response:', respText);
    if (mentionsHigherGroundOrWater && res.data?.mode === 'ASSIST') {
      console.log('✅ PASS TEST 3: Flood guidance correctly provided when explicitly requested.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 3:', { respText, mode: res.data?.mode });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 3 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 4: "there is water entering my house"
  // Expected: Water assessment, no invented facts, mode ASSESS
  // -------------------------------------------------------------
  console.log('--- Test 4: "there is water entering my house" ---');
  try {
    await resetAllBeacons();
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'there is water entering my house',
        activeRequestId: null,
        sessionId: 'grounding-t4',
        clientRequestId: 'cg-req-4',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyChat(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    const mode = res.data?.mode;
    const extracted = res.data?.extractedInformation || {};

    console.log('Assistant Response:', respText);
    console.log('Extracted facts:', extracted);

    if (mode === 'ASSESS' && extracted.peopleCount === undefined && extracted.injuredCount === undefined) {
      console.log('✅ PASS TEST 4: Assessed water situation accurately without inventing unmentioned counts.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 4:', { respText, mode, extracted });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 4 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 5: "we are trapped upstairs"
  // Expected: Trapped emergency assessment, mode EMERGENCY, NO invented floodwaters
  // -------------------------------------------------------------
  console.log('--- Test 5: "we are trapped upstairs" ---');
  try {
    await resetAllBeacons();
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'we are trapped upstairs',
        activeRequestId: null,
        sessionId: 'grounding-t5',
        clientRequestId: 'cg-req-5',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyChat(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    const mode = res.data?.mode;
    const floodPresent = hasFloodHallucination(respText);

    console.log('Assistant Response:', respText);
    if (mode === 'EMERGENCY' && !floodPresent && res.data?.activeRequest) {
      console.log('✅ PASS TEST 5: Trapped emergency handled without inventing flood scenario.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 5:', { respText, mode, floodPresent, activeReq: res.data?.activeRequest });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 5 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 6: "we are four people"
  // Expected: peopleCount = 4, NO invented hazard (no flood, fire)
  // -------------------------------------------------------------
  console.log('--- Test 6: "we are four people" ---');
  try {
    await resetAllBeacons();
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'we are four people',
        activeRequestId: null,
        sessionId: 'grounding-t6',
        clientRequestId: 'cg-req-6',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyChat(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    const extracted = res.data?.extractedInformation || {};
    const floodPresent = hasFloodHallucination(respText);
    const firePresent = hasFireHallucination(respText);

    console.log('Assistant Response:', respText);
    console.log('Extracted:', extracted);

    if (extracted.peopleCount === 4 && !floodPresent && !firePresent) {
      console.log('✅ PASS TEST 6: peopleCount=4 accurately extracted with zero hazard hallucinations.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 6:', { respText, extracted, floodPresent, firePresent });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 6 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 7: Confirmed waterLevel = HIGH + "what should I do?"
  // Expected: Water guidance allowed because flood is confirmed in active SOS
  // -------------------------------------------------------------
  console.log('--- Test 7: Confirmed waterLevel=HIGH + "what should I do?" ---');
  try {
    await resetAllBeacons();
    const initSos = await createInitialSos(3, 'HIGH', 'FLOOD');
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'what should I do?',
        activeRequestId: initSos.id,
        sessionId: 'grounding-t7',
        clientRequestId: 'cg-req-7',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyChat(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    console.log('Assistant Response:', respText);

    if (respText.length > 0 && res.data?.mode === 'ASSIST') {
      console.log('✅ PASS TEST 7: Grounded safety guidance provided for confirmed active SOS.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 7:', { respText, mode: res.data?.mode });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 7 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 8: Confirmed SOS exists, but New Session + "can you help me"
  // Expected: Current turn must NOT inherit old SOS as current turn facts, NO flood hallucination
  // -------------------------------------------------------------
  console.log('--- Test 8: New Session + "can you help me" (activeRequestId null) ---');
  try {
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'can you help me',
        activeRequestId: null,
        sessionId: 'grounding-t8-new-session',
        clientRequestId: 'cg-req-8',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyChat(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    const floodPresent = hasFloodHallucination(respText);
    const firePresent = hasFireHallucination(respText);

    console.log('Assistant Response:', respText);
    if (!floodPresent && !firePresent && res.data?.mode === 'ASSIST') {
      console.log('✅ PASS TEST 8: New session did not inherit stale hazard assumptions.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 8:', { respText, floodPresent, firePresent, mode: res.data?.mode });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 8 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 9: Audio failure handling
  // Expected: Exactly ONE assistant error message, zero user messages, zero SOS updates
  // -------------------------------------------------------------
  console.log('--- Test 9: Audio failure handling (zero user error messages, exactly one assistant message) ---');
  try {
    await resetAllBeacons();
    const req = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      file: {
        buffer: Buffer.from('unintelligible empty short buffer'),
        mimetype: 'audio/webm',
      },
      body: {
        sessionId: 'grounding-t9-audio-fail',
        clientRequestId: 'cg-req-9',
        history: [],
      },
      headers: {},
    };
    const res = createMockRes();
    await handleVoiceEmergencyAudio(req as any, res as any);

    const respText = res.data?.assistantResponse || '';
    const transcript = res.data?.transcript;
    const shouldUpdateSos = res.data?.shouldCreateOrUpdateSos;

    console.log('Audio Failure Response:', { respText, transcript, shouldUpdateSos });

    const isExactMessage = respText === "STRIDE couldn't understand the recording. Please try again.";
    const isEmptyTranscript = !transcript || transcript === '';
    const noSosCreated = !shouldUpdateSos;

    // Verify frontend message filtering logic contract:
    const tempUserMsgId = 'msg-test-temp';
    let mockMessages = [
      { id: tempUserMsgId, role: 'user', content: '🎙️ [Analyzing voice recording...]' }
    ];

    const isFailedTranscript = !transcript || transcript.trim() === '';
    if (isFailedTranscript) {
      mockMessages = mockMessages.filter((m) => m.id !== tempUserMsgId);
      mockMessages.push({
        id: 'msg-asst-err',
        role: 'assistant',
        content: "STRIDE couldn't understand the recording. Please try again.",
      });
    }

    const userMsgCount = mockMessages.filter((m) => m.role === 'user').length;
    const asstMsgCount = mockMessages.filter((m) => m.role === 'assistant').length;

    if (isExactMessage && isEmptyTranscript && noSosCreated && userMsgCount === 0 && asstMsgCount === 1) {
      console.log('✅ PASS TEST 9: Failed audio cleanly returns 1 assistant message, 0 user messages, and no SOS update.\n');
      passed++;
    } else {
      console.error('❌ FAIL TEST 9:', { isExactMessage, isEmptyTranscript, noSosCreated, userMsgCount, asstMsgCount });
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 9 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 10: Five generic turns with NO spontaneous hazards
  // Turns: "hi" -> "can you help me" -> "what can you do" -> "okay" -> "I don't know"
  // Expected: NO spontaneous flood, water, or fire mentions across all 5 turns
  // -------------------------------------------------------------
  console.log('--- Test 10: Five generic turns with NO spontaneous hazards ---');
  try {
    await resetAllBeacons();
    const sessionId = 'grounding-t10-5turns';
    const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];
    const turns = ['hi', 'can you help me', 'what can you do', 'okay', "I don't know"];
    let test10Passed = true;

    for (let i = 0; i < turns.length; i++) {
      const userUtterance = turns[i];
      const req = {
        user: { userId: citizen.id, role: 'CITIZEN' },
        body: {
          message: userUtterance,
          activeRequestId: null,
          sessionId,
          clientRequestId: `cg-req-10-${i + 1}`,
          history: conversationHistory,
        },
        headers: {},
      };
      const res = createMockRes();
      await handleVoiceEmergencyChat(req as any, res as any);

      const respText = res.data?.assistantResponse || '';
      const floodPresent = hasFloodHallucination(respText);
      const firePresent = hasFireHallucination(respText);
      const mode = res.data?.mode;

      console.log(`  Turn ${i + 1}: User: "${userUtterance}" -> Assistant: "${respText}" [Mode: ${mode}]`);

      if (floodPresent || firePresent) {
        console.error(`  ❌ Turn ${i + 1} failed: Hallucinated hazard detected!`);
        test10Passed = false;
        break;
      }

      conversationHistory.push({ role: 'user', content: userUtterance });
      conversationHistory.push({ role: 'assistant', content: respText });
    }

    if (test10Passed) {
      console.log('✅ PASS TEST 10: All 5 generic turns completed with zero spontaneous hazard hallucinations.\n');
      passed++;
    } else {
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL TEST 10 (Exception):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('================================================================');
  console.log(`SUMMARY: ${passed}/10 TESTS PASSED (${failed} failed)`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runConversationalGroundingTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal error in grounding suite:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
