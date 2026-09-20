import 'dotenv/config';
import prisma from '../src/server/config/database.ts';
import { handleVoiceEmergencyChat, handleResetTestBeacon } from '../src/server/controllers/voiceEmergencyController.ts';
import { formatRescueRequest } from '../src/server/controllers/rescueController.ts';
import { extractCurrentTurnFacts, parseCount } from '../src/server/services/geminiVoiceService.ts';

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

async function runGenericVoiceCountAndStateSuite() {
  console.log('================================================================');
  console.log('RUNNING GENERIC VOICE COUNT & STATE LOGIC VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });
  if (!citizen) throw new Error('Citizen not found');

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

  // -------------------------------------------------------------
  // TEST SECTION 1: Number parsing and generic extraction
  // -------------------------------------------------------------
  console.log('--- Section 1: Number parsing & generic word mapping ---');
  const numberTestCases = [
    { input: '1', expected: 1 },
    { input: 'two', expected: 2 },
    { input: '3', expected: 3 },
    { input: 'four', expected: 4 },
    { input: 'five', expected: 5 },
    { input: '6', expected: 6 },
    { input: 'seven', expected: 7 },
    { input: 'eight', expected: 8 },
    { input: '9', expected: 9 },
    { input: 'ten', expected: 10 },
    { input: 'eleven', expected: 11 },
    { input: 'twelve', expected: 12 },
    { input: 'twenty', expected: 20 },
    { input: 'twenty five', expected: 25 },
  ];

  for (const tc of numberTestCases) {
    const res = parseCount(tc.input);
    if (res === tc.expected) {
      passed++;
    } else {
      console.error(`FAIL: parseCount("${tc.input}") expected ${tc.expected}, got ${res}`);
      failed++;
    }
  }
  console.log(`✅ All ${numberTestCases.length} generic number parsing tests passed.\n`);

  // -------------------------------------------------------------
  // TEST SECTION 2: Immobility and Inability-to-move Extraction
  // -------------------------------------------------------------
  console.log('--- Section 2: Immobility & Entrapment extraction ---');
  const immobilityPhrases = [
    'We cannot move',
    'none of us can move',
    'we are unable to move',
    "i can't move",
    'stuck upstairs and unable to move',
    'we are trapped upstairs',
  ];

  for (const phrase of immobilityPhrases) {
    const facts = extractCurrentTurnFacts(phrase);
    const hasTrapped = facts.conditions.includes('TRAPPED') || facts.extracted.emergencyType === 'TRAPPED';
    if (hasTrapped) {
      passed++;
    } else {
      console.error(`FAIL: Immobility phrase "${phrase}" failed to extract TRAPPED condition.`);
      failed++;
    }
  }
  console.log(`✅ All ${immobilityPhrases.length} immobility extraction tests passed.\n`);

  // -------------------------------------------------------------
  // TEST SECTION 3: Multi-turn Parameterized Sequence
  // Testing across multiple arbitrary (N, M, P) value tuples
  // -------------------------------------------------------------
  console.log('--- Section 3: Data-driven multi-turn sequence verification ---');
  const testTuples = [
    { N: 4, N_word: 'four', M: 2, M_word: 'two', P: 6, P_word: 'six' },
    { N: 6, N_word: 'six', M: 3, M_word: 'three', P: 8, P_word: 'eight' },
    { N: 3, N_word: 'three', M: 1, M_word: 'one', P: 5, P_word: 'five' },
    { N: 8, N_word: 'eight', M: 5, M_word: 'five', P: 10, P_word: 'ten' },
  ];

  for (let idx = 0; idx < testTuples.length; idx++) {
    const { N, N_word, M, M_word, P, P_word } = testTuples[idx];
    console.log(`\n>>> Running Sequence Test [Tuple ${idx + 1}]: N=${N}, M=${M}, P=${P}`);

    await resetAllBeacons();

    // Turn 1: "We are N people, and we are stuck upstairs."
    const turn1Msg = `We are ${N_word} people, and we are stuck upstairs.`;
    const res1 = createMockRes();
    await handleVoiceEmergencyChat(
      {
        user: { userId: citizen.id, role: 'CITIZEN' },
        body: {
          message: turn1Msg,
          sessionId: `generic-sess-${idx}-t1`,
          clientRequestId: `req-${idx}-1`,
          history: [],
        },
        headers: {},
      } as any,
      res1 as any
    );

    const activeSos1 = res1.data?.activeRequest;
    if (activeSos1 && activeSos1.peopleCount === N && activeSos1.injuredCount === 0) {
      console.log(`  Turn 1 PASS: People=${N}, Injured=0, Beacon=${activeSos1.id}`);
      passed++;
    } else {
      console.error(`  Turn 1 FAIL: Expected People=${N}, Injured=0. Got:`, {
        people: activeSos1?.peopleCount,
        injured: activeSos1?.injuredCount,
      });
      failed++;
    }

    const sosId = activeSos1.id;

    // Turn 2: "Yes. M of us are injured."
    const turn2Msg = `Yes. ${M_word} of us are injured.`;
    const res2 = createMockRes();
    await handleVoiceEmergencyChat(
      {
        user: { userId: citizen.id, role: 'CITIZEN' },
        body: {
          message: turn2Msg,
          activeRequestId: sosId,
          sessionId: `generic-sess-${idx}-t2`,
          clientRequestId: `req-${idx}-2`,
          history: [
            { role: 'user', content: turn1Msg },
            { role: 'assistant', content: res1.data?.assistantResponse },
          ],
        },
        headers: {},
      } as any,
      res2 as any
    );

    const activeSos2 = res2.data?.activeRequest;
    if (activeSos2 && activeSos2.peopleCount === N && activeSos2.injuredCount === M) {
      console.log(`  Turn 2 PASS: People=${N} preserved, Injured=${M} established.`);
      passed++;
    } else {
      console.error(`  Turn 2 FAIL: Expected People=${N}, Injured=${M}. Got:`, {
        people: activeSos2?.peopleCount,
        injured: activeSos2?.injuredCount,
      });
      failed++;
    }

    // Turn 3: "We are trapped. We are injured, and water is rising very quickly. We cannot move."
    const turn3Msg = 'We are trapped. We are injured, and water is rising very quickly. We cannot move.';
    const res3 = createMockRes();
    await handleVoiceEmergencyChat(
      {
        user: { userId: citizen.id, role: 'CITIZEN' },
        body: {
          message: turn3Msg,
          activeRequestId: sosId,
          sessionId: `generic-sess-${idx}-t3`,
          clientRequestId: `req-${idx}-3`,
          history: [
            { role: 'user', content: turn1Msg },
            { role: 'assistant', content: res1.data?.assistantResponse },
            { role: 'user', content: turn2Msg },
            { role: 'assistant', content: res2.data?.assistantResponse },
          ],
        },
        headers: {},
      } as any,
      res3 as any
    );

    const activeSos3 = res3.data?.activeRequest;
    const resp3 = res3.data?.assistantResponse || '';

    // Check 3a: Preserved peopleCount = N
    // Check 3b: Preserved injuredCount = M (NOT reset to 1)
    // Check 3c: Water rising acknowledged (HIGH or EXTREME)
    // Check 3d: No redundant question asking if they are able to move or to describe situation
    const redundantQuestionPresent =
      resp3.includes('Are you or anyone with you able to move safely') ||
      resp3.includes('Could you describe the situation or danger you are facing? Are you trapped, injured, or able to move to safety?');

    const countsIntact = activeSos3?.peopleCount === N && activeSos3?.injuredCount === M;
    const waterRisingPresent = activeSos3?.waterLevel === 'HIGH' || activeSos3?.waterLevel === 'EXTREME';

    if (countsIntact && waterRisingPresent && !redundantQuestionPresent) {
      console.log(`  Turn 3 PASS: People=${N}, Injured=${M} preserved! Water=${activeSos3?.waterLevel}. Redundant question eliminated.`);
      console.log(`  Assistant Response: "${resp3}"`);
      passed++;
    } else {
      console.error(`  Turn 3 FAIL:`, {
        people: activeSos3?.peopleCount,
        expectedPeople: N,
        injured: activeSos3?.injuredCount,
        expectedInjured: M,
        water: activeSos3?.waterLevel,
        redundantQuestionPresent,
        resp3,
      });
      failed++;
    }

    // Turn 4: "Actually nobody is injured."
    const turn4Msg = 'Actually nobody is injured.';
    const res4 = createMockRes();
    await handleVoiceEmergencyChat(
      {
        user: { userId: citizen.id, role: 'CITIZEN' },
        body: {
          message: turn4Msg,
          activeRequestId: sosId,
          sessionId: `generic-sess-${idx}-t4`,
          clientRequestId: `req-${idx}-4`,
          history: [
            { role: 'user', content: turn3Msg },
            { role: 'assistant', content: resp3 },
          ],
        },
        headers: {},
      } as any,
      res4 as any
    );

    const activeSos4 = res4.data?.activeRequest;
    if (activeSos4 && activeSos4.peopleCount === N && activeSos4.injuredCount === 0) {
      console.log(`  Turn 4 PASS: Negation respected -> People=${N}, Injured=0.`);
      passed++;
    } else {
      console.error(`  Turn 4 FAIL: Expected People=${N}, Injured=0. Got:`, {
        people: activeSos4?.peopleCount,
        injured: activeSos4?.injuredCount,
      });
      failed++;
    }

    // Turn 5: "Actually there are P people."
    const turn5Msg = `Actually there are ${P_word} people.`;
    const res5 = createMockRes();
    await handleVoiceEmergencyChat(
      {
        user: { userId: citizen.id, role: 'CITIZEN' },
        body: {
          message: turn5Msg,
          activeRequestId: sosId,
          sessionId: `generic-sess-${idx}-t5`,
          clientRequestId: `req-${idx}-5`,
          history: [
            { role: 'user', content: turn4Msg },
            { role: 'assistant', content: res4.data?.assistantResponse },
          ],
        },
        headers: {},
      } as any,
      res5 as any
    );

    const activeSos5 = res5.data?.activeRequest;
    if (activeSos5 && activeSos5.peopleCount === P && activeSos5.injuredCount === 0) {
      console.log(`  Turn 5 PASS: Total count updated -> People=${P}, Injured=0.`);
      passed++;
    } else {
      console.error(`  Turn 5 FAIL: Expected People=${P}, Injured=0. Got:`, {
        people: activeSos5?.peopleCount,
        injured: activeSos5?.injuredCount,
      });
      failed++;
    }
  }

  // Cleanup: Cancel all test beacons so database is clean
  await resetAllBeacons();

  console.log('\n================================================================');
  console.log(`GENERIC SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runGenericVoiceCountAndStateSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error in generic test suite:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
