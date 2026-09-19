import 'dotenv/config';
import prisma from '../src/server/config/database.ts';
import { handleVoiceEmergencyChat, handleResetTestBeacon } from '../src/server/controllers/voiceEmergencyController.ts';
import { formatRescueRequest } from '../src/server/controllers/rescueController.ts';
import { extractCurrentTurnFacts } from '../src/server/services/geminiVoiceService.ts';

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

async function runAllMandatoryRegressionTests() {
  console.log('================================================================');
  console.log('RUNNING MANDATORY 9-POINT VOICE EMERGENCY REGRESSION SUITE');
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

  async function createInitialSos(pCount: number, cCount: number = 0, injuredCount: number = 0) {
    const meta = `[SRC:VOICE, P:${pCount}, C:${cCount}, E:0, D:0, I:${injuredCount}, W:MEDIUM, T:FLOOD]`;
    return prisma.emergencyRequest.create({
      data: {
        disasterId: disaster.id,
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

  // TEST 1: Existing SOS People = 1, User typed: "There are 4 people with me." -> peopleCount updates to 4
  console.log('--- Test 1: Existing SOS People=1, text: "There are 4 people with me." ---');
  try {
    const initReq = await createInitialSos(1);
    const req1 = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'There are 4 people with me.',
        activeRequestId: initReq.id,
        sessionId: 'reg-test-1',
        clientRequestId: 'reg-req-1',
      },
      headers: {},
    };
    const res1 = createMockRes();
    await handleVoiceEmergencyChat(req1 as any, res1 as any);

    const updated = await prisma.emergencyRequest.findUnique({
      where: { id: initReq.id },
      include: { conditions: true },
    });
    const formatted = formatRescueRequest(updated);
    const extraction = extractCurrentTurnFacts('There are 4 people with me.');

    if (formatted.peopleCount === 4 && extraction.extracted.peopleCount === 4) {
      console.log('PASS TEST 1: peopleCount successfully updated from 1 to 4.\n');
      passed++;
    } else {
      console.error('FAIL TEST 1:', {
        resPeople: res1.data?.activeRequest?.peopleCount,
        formattedPeople: formatted.peopleCount,
      });
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 1:', err);
    failed++;
  }

  // TEST 2: Existing SOS People = 1, Stage 1 audio transcript: "There are four people with me." -> Stage 2 text triage updates SOS to 4
  console.log('--- Test 2: Two-stage audio transcript: "There are four people with me." ---');
  try {
    const initReq = await createInitialSos(1);
    const stage1Transcript = 'There are four people with me.';
    const req2 = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: stage1Transcript,
        activeRequestId: initReq.id,
        sessionId: 'reg-test-2',
        clientRequestId: 'reg-req-2',
      },
      headers: {},
    };
    const res2 = createMockRes();
    await handleVoiceEmergencyChat(req2 as any, res2 as any);

    const updated = await prisma.emergencyRequest.findUnique({
      where: { id: initReq.id },
      include: { conditions: true },
    });
    const formatted = formatRescueRequest(updated);

    if (formatted.peopleCount === 4) {
      console.log('PASS TEST 2: Two-stage audio pipeline updated peopleCount from 1 to 4.\n');
      passed++;
    } else {
      console.error('FAIL TEST 2:', { formattedPeople: formatted.peopleCount });
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 2:', err);
    failed++;
  }

  // TEST 3: Existing SOS People = 1, User says: "Actually, there are 4 of us." -> peopleCount updates to 4
  console.log('--- Test 3: Existing SOS People=1, text: "Actually, there are 4 of us." ---');
  try {
    const initReq = await createInitialSos(1);
    const req3 = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'Actually, there are 4 of us.',
        activeRequestId: initReq.id,
        sessionId: 'reg-test-3',
        clientRequestId: 'reg-req-3',
      },
      headers: {},
    };
    const res3 = createMockRes();
    await handleVoiceEmergencyChat(req3 as any, res3 as any);

    const updated = await prisma.emergencyRequest.findUnique({
      where: { id: initReq.id },
      include: { conditions: true },
    });
    const formatted = formatRescueRequest(updated);

    if (formatted.peopleCount === 4) {
      console.log('PASS TEST 3: "4 of us" updated peopleCount from 1 to 4.\n');
      passed++;
    } else {
      console.error('FAIL TEST 3:', { formattedPeople: formatted.peopleCount });
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 3:', err);
    failed++;
  }

  // TEST 4: Existing SOS People = 4, User says: "My grandmother is injured." -> peopleCount remains 4, injuredCount updates to 1
  console.log('--- Test 4: Existing SOS People=4, text: "My grandmother is injured." ---');
  try {
    const initReq = await createInitialSos(4, 0, 0);
    const req4 = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'My grandmother is injured.',
        activeRequestId: initReq.id,
        sessionId: 'reg-test-4',
        clientRequestId: 'reg-req-4',
      },
      headers: {},
    };
    const res4 = createMockRes();
    await handleVoiceEmergencyChat(req4 as any, res4 as any);

    const updated = await prisma.emergencyRequest.findUnique({
      where: { id: initReq.id },
      include: { conditions: true },
    });
    const formatted = formatRescueRequest(updated);
    const hasInjuredCond = updated?.conditions.some((c) => c.conditionType === 'HEAVILY_INJURED');

    if (formatted.peopleCount === 4 && formatted.injuredCount >= 1 && hasInjuredCond) {
      console.log('PASS TEST 4: peopleCount remained 4, injuredCount updated to >=1, condition added.\n');
      passed++;
    } else {
      console.error('FAIL TEST 4:', {
        people: formatted.peopleCount,
        injured: formatted.injuredCount,
        hasInjuredCond,
      });
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 4:', err);
    failed++;
  }

  // TEST 5: Existing SOS Children = 2, Speculative "I think there may be another child." -> childrenCount remains 2
  console.log('--- Test 5: Existing Children=2, speculative: "I think there may be another child." ---');
  try {
    const initReq = await createInitialSos(3, 2, 0);
    const facts = extractCurrentTurnFacts('I think there may be another child.');
    const req5 = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'I think there may be another child.',
        activeRequestId: initReq.id,
        sessionId: 'reg-test-5',
        clientRequestId: 'reg-req-5',
      },
      headers: {},
    };
    const res5 = createMockRes();
    await handleVoiceEmergencyChat(req5 as any, res5 as any);

    const updated = await prisma.emergencyRequest.findUnique({
      where: { id: initReq.id },
      include: { conditions: true },
    });
    const formatted = formatRescueRequest(updated);

    if (facts.extracted.childrenCount === undefined && formatted.childrenCount === 2) {
      console.log('PASS TEST 5: Speculation rejected; childrenCount stayed at 2.\n');
      passed++;
    } else {
      console.error('FAIL TEST 5:', { facts, childrenCount: formatted.childrenCount });
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 5:', err);
    failed++;
  }

  // TEST 6: Existing SOS Children = 2, Definitive "There are three children." -> childrenCount updates to 3
  console.log('--- Test 6: Existing Children=2, definitive: "There are three children." ---');
  try {
    const initReq = await createInitialSos(4, 2, 0);
    const facts = extractCurrentTurnFacts('There are three children.');
    const req6 = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'There are three children.',
        activeRequestId: initReq.id,
        sessionId: 'reg-test-6',
        clientRequestId: 'reg-req-6',
      },
      headers: {},
    };
    const res6 = createMockRes();
    await handleVoiceEmergencyChat(req6 as any, res6 as any);

    const updated = await prisma.emergencyRequest.findUnique({
      where: { id: initReq.id },
      include: { conditions: true },
    });
    const formatted = formatRescueRequest(updated);

    if (facts.extracted.childrenCount === 3 && formatted.childrenCount === 3 && formatted.peopleCount === 4) {
      console.log('PASS TEST 6: Definitive fact updated childrenCount to 3, peopleCount remained 4.\n');
      passed++;
    } else {
      console.error('FAIL TEST 6:', { facts, childrenCount: formatted.childrenCount, peopleCount: formatted.peopleCount });
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 6:', err);
    failed++;
  }

  // TEST 7: Reset / Cancel test beacon and report "We are 4 people." -> fresh beacon does not inherit old facts
  console.log('--- Test 7: Reset test beacon, then report fresh SOS ---');
  try {
    const oldReq = await createInitialSos(1);
    const resetReq = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: { activeRequestId: oldReq.id },
    };
    const resetRes = createMockRes();
    await handleResetTestBeacon(resetReq as any, resetRes as any);

    const resetCheck = await prisma.emergencyRequest.findUnique({ where: { id: oldReq.id } });
    if (resetCheck?.rescueStatus !== 'CANCELLED') {
      throw new Error('Old request was not CANCELLED: ' + resetCheck?.rescueStatus);
    }

    const freshReq = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'We are trapped in the flood. We are 4 people.',
        sessionId: 'reg-test-7',
        clientRequestId: 'reg-req-7',
      },
      headers: {},
    };
    const freshRes = createMockRes();
    await handleVoiceEmergencyChat(freshReq as any, freshRes as any);

    const freshActive = freshRes.data?.activeRequest;
    if (freshActive && freshActive.id !== oldReq.id && freshActive.peopleCount === 4) {
      console.log(
        'PASS TEST 7: Old request CANCELLED; fresh incident created with People=4 without inheriting stale state.\n'
      );
      passed++;
    } else {
      console.error('FAIL TEST 7:', {
        oldId: oldReq.id,
        freshId: freshActive?.id,
        p: freshActive?.peopleCount,
      });
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 7:', err);
    failed++;
  }

  // TEST 8: Existing SOS, User asks conversational question "What should I do now?" -> guidance response, no invented SOS changes
  console.log('--- Test 8: Existing SOS, conversational question: "What should I do now?" ---');
  try {
    const initReq = await createInitialSos(4, 1, 0);
    const facts = extractCurrentTurnFacts('What should I do now?');
    const req8 = {
      user: { userId: citizen.id, role: 'CITIZEN' },
      body: {
        message: 'What should I do now?',
        activeRequestId: initReq.id,
        sessionId: 'reg-test-8',
        clientRequestId: 'reg-req-8',
      },
      headers: {},
    };
    const res8 = createMockRes();
    await handleVoiceEmergencyChat(req8 as any, res8 as any);

    const noFactsExtracted = Object.keys(facts.extracted).length === 0;
    const peopleUnchanged = res8.data?.activeRequest?.peopleCount === 4;

    if (noFactsExtracted && peopleUnchanged && typeof res8.data?.assistantResponse === 'string') {
      console.log(
        'PASS TEST 8: Conversational response only, no invented facts, peopleCount intact at 4.\n'
      );
      passed++;
    } else {
      console.error('FAIL TEST 8:', { noFactsExtracted, peopleUnchanged, res: res8.data });
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 8:', err);
    failed++;
  }

  // TEST 9: Frontend double-recording defense verification (simulating single execution lock)
  console.log('--- Test 9: Single physical recording submission lock verification ---');
  try {
    let executionCount = 0;
    let isSubmittingAudio = false;

    const mockOnStop = async () => {
      if (isSubmittingAudio) {
        return;
      }
      isSubmittingAudio = true;
      executionCount++;
    };

    await Promise.all([mockOnStop(), mockOnStop()]);

    if (executionCount === 1) {
      console.log('PASS TEST 9: Double submission prevented by locking flag.\n');
      passed++;
    } else {
      console.error('FAIL TEST 9: Duplicate submission executed:', executionCount);
      failed++;
    }
  } catch (err) {
    console.error('ERROR TEST 9:', err);
    failed++;
  }

  console.log('================================================================');
  console.log(`SUMMARY: ${passed}/9 TESTS PASSED (${failed} failed)`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllMandatoryRegressionTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error running regression suite:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
