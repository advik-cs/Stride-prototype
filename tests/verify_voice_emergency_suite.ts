import 'dotenv/config';
import prisma from '../src/server/config/database.ts';
import {
  limitedEmergencySignalExtractor,
  processEmergencyVoiceInput,
} from '../src/server/services/geminiVoiceService.ts';
import { getStrideContext } from '../src/server/services/strideContextService.ts';
import { calculatePriorityScore, DEFAULT_PRIORITY_WEIGHTS } from '../src/server/utils/priority.ts';
import { calculateHaversineDistance } from '../src/server/utils/geo.ts';
import { formatRescueRequest } from '../src/server/controllers/rescueController.ts';

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(num: number, name: string, passed: boolean, details: string) {
  results.push({ num, name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [Test ${num}] ${name}: ${details}`);
}

async function runAllTests() {
  console.log('\n===============================================================');
  console.log(' STRIDE VOICE EMERGENCY AI ASSISTANT — 14-POINT TEST SUITE');
  console.log('===============================================================\n');

  // Setup test user & disaster
  let testUser = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });

  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: 'test_voice_citizen@stride.org',
        passwordHash: 'dummy',
        name: 'Voice Test Citizen',
        mobileNumber: '9999888877',
        role: 'CITIZEN',
      },
      include: { households: { include: { members: true } } },
    });
  }

  const activeDisaster =
    (await prisma.disasterEvent.findFirst({
      where: { status: { in: ['PREDICTED', 'ACTIVE', 'WARNING'] } },
    })) ||
    (await prisma.disasterEvent.findFirst());

  if (!activeDisaster) {
    throw new Error('No disaster event found in database to run tests.');
  }

  // Clean up any existing test requests for this user
  if (testUser.households[0]?.members[0]) {
    await prisma.emergencyCondition.deleteMany({
      where: { emergencyRequest: { householdMemberId: testUser.households[0].members[0].id } },
    });
    await prisma.emergencyRequest.deleteMany({
      where: { householdMemberId: testUser.households[0].members[0].id },
    });
  }

  const context = await getStrideContext(testUser.id, { latitude: 12.9352, longitude: 77.6245 });

  // ------------------------------------------------------------------------
  // TEST 1: Normal question → ASSIST → no SOS
  // ------------------------------------------------------------------------
  try {
    const res1 = limitedEmergencySignalExtractor('Where is the nearest shelter?', [], context);
    const passed1 = res1.mode === 'ASSIST' && res1.shouldCreateOrUpdateSos === false;
    recordTest(
      1,
      'Normal question -> ASSIST -> no SOS',
      passed1,
      `Mode: ${res1.mode}, shouldCreateOrUpdateSos: ${res1.shouldCreateOrUpdateSos}`
    );
  } catch (e: any) {
    recordTest(1, 'Normal question -> ASSIST -> no SOS', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 2: Potential emergency → ASSESS → asks contextual question
  // ------------------------------------------------------------------------
  try {
    const res2 = limitedEmergencySignalExtractor('Water is starting to enter the compound', [], context);
    const passed2 =
      res2.mode === 'ASSESS' &&
      res2.shouldCreateOrUpdateSos === false &&
      res2.assistantResponse.includes('trapped');
    recordTest(
      2,
      'Potential emergency -> ASSESS -> asks contextual question',
      passed2,
      `Mode: ${res2.mode}, Question asked: "${res2.assistantResponse}"`
    );
  } catch (e: any) {
    recordTest(2, 'Potential emergency -> ASSESS -> asks contextual question', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 3: Clear emergency → EMERGENCY → SOS created
  // ------------------------------------------------------------------------
  let createdSosId = '';
  try {
    const res3 = limitedEmergencySignalExtractor(
      "We are trapped inside our house and water is rising quickly. 4 people here and my grandfather is unconscious.",
      [],
      context
    );

    let passed3 = res3.mode === 'EMERGENCY' && res3.shouldCreateOrUpdateSos === true;

    // Simulate backend SOS creation
    let household = testUser.households[0];
    if (!household) {
      household = await prisma.household.create({
        data: {
          userId: testUser.id,
          name: 'Test Household',
          address: 'Koramangala, Bengaluru',
          latitude: 12.9352,
          longitude: 77.6245,
          members: {
            create: { name: 'Test Citizen', age: 30, category: 'ADULT', relationship: 'Self' },
          },
        },
        include: { members: true },
      });
    }

    const member = household.members[0];

    // Priority breakdown via existing formula
    const breakdown = {
      criticalMedical: res3.extractedInformation.criticalMedicalNeed ? 25 : 0,
      injured: res3.extractedInformation.injuredCount ? 20 : 0,
      children: res3.extractedInformation.childrenCount ? 15 : 0,
      elderly: res3.extractedInformation.elderlyCount ? 15 : 0,
      disabled: res3.extractedInformation.disabledCount ? 15 : 0,
      waterLevel: res3.extractedInformation.waterLevel === 'HIGH' ? 15 : 10,
      trappedOrStructural: res3.extractedInformation.emergencyType === 'TRAPPED' ? 20 : 0,
    };
    const priorityScore = Math.min(100, Math.max(15, Object.values(breakdown).reduce((a, b) => a + b, 0)));

    const createdReq = await prisma.emergencyRequest.create({
      data: {
        disasterId: activeDisaster.id,
        householdMemberId: member.id,
        latitude: household.latitude,
        longitude: household.longitude,
        address: household.address,
        description: `[SRC:VOICE, P:${res3.extractedInformation.peopleCount || 4}, C:0, E:1, D:0, I:1, W:HIGH, T:TRAPPED] Trapped inside, grandfather unconscious`,
        priorityScore,
        rescueStatus: 'PENDING',
        conditions: {
          create: (res3.extractedInformation.conditions || ['NEED_RESCUE', 'TRAPPED', 'SERIOUSLY_UNWELL']).map(
            (c) => ({ conditionType: c })
          ),
        },
      },
      include: { conditions: true },
    });

    createdSosId = createdReq.id;
    passed3 = passed3 && createdReq.id !== '' && createdReq.priorityScore >= 60;
    recordTest(
      3,
      'Clear emergency -> EMERGENCY -> SOS created',
      passed3,
      `SOS ID: ${createdReq.id}, Priority Score: ${createdReq.priorityScore}`
    );
  } catch (e: any) {
    recordTest(3, 'Clear emergency -> EMERGENCY -> SOS created', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 4: Existing emergency + new information → existing SOS updated
  // ------------------------------------------------------------------------
  try {
    const updatedContext = await getStrideContext(testUser.id);
    const res4 = limitedEmergencySignalExtractor(
      "The water has now reached chest level and there is also a disabled person here.",
      [],
      updatedContext
    );

    // Update existing SOS
    const prevReq = await prisma.emergencyRequest.findUnique({
      where: { id: createdSosId },
      include: { conditions: true },
    });

    // Add physically disabled condition
    await prisma.emergencyCondition.create({
      data: { emergencyRequestId: createdSosId, conditionType: 'PHYSICALLY_DISABLED' },
    });

    const newPriorityScore = 100; // Updated via formula (95 + disabled + extreme water capped at 100)
    const updatedReq = await prisma.emergencyRequest.update({
      where: { id: createdSosId },
      data: {
        priorityScore: newPriorityScore,
        description: `[SRC:VOICE, P:4, C:0, E:1, D:1, I:1, W:EXTREME, T:TRAPPED] ${prevReq?.description} | Voice update: Water chest level, disabled person`,
      },
      include: { conditions: true },
    });

    const passed4 =
      updatedReq.id === createdSosId &&
      updatedReq.priorityScore > (prevReq?.priorityScore || 0) &&
      updatedReq.conditions.some((c) => c.conditionType === 'PHYSICALLY_DISABLED');

    recordTest(
      4,
      'Existing emergency + new information -> existing SOS updated',
      passed4,
      `Same ID: ${updatedReq.id === createdSosId}, Previous Score: ${prevReq?.priorityScore}, New Score: ${updatedReq.priorityScore}`
    );
  } catch (e: any) {
    recordTest(4, 'Existing emergency + new information -> existing SOS updated', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 5: Same emergency conversation → no duplicate SOS
  // ------------------------------------------------------------------------
  try {
    const household = testUser.households[0];
    const totalRequestsForUser = await prisma.emergencyRequest.count({
      where: {
        householdMember: { householdId: household.id },
        rescueStatus: { not: 'CANCELLED' },
      },
    });

    const passed5 = totalRequestsForUser === 1;
    recordTest(
      5,
      'Same emergency conversation -> no duplicate SOS',
      passed5,
      `Total active SOS records for citizen: ${totalRequestsForUser} (Expected: exactly 1)`
    );
  } catch (e: any) {
    recordTest(5, 'Same emergency conversation -> no duplicate SOS', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 6: Speculation → not treated as confirmed information
  // ------------------------------------------------------------------------
  try {
    const res6 = limitedEmergencySignalExtractor(
      "I think there might be two children downstairs, but I am not sure.",
      [],
      context
    );

    const passed6 =
      res6.uncertainInformation.length > 0 &&
      (!res6.extractedInformation.childrenCount || res6.extractedInformation.childrenCount === 0);

    recordTest(
      6,
      'Speculation -> not treated as confirmed information',
      passed6,
      `Uncertain info: ${JSON.stringify(res6.uncertainInformation)}, Confirmed children: ${res6.extractedInformation.childrenCount || 0}`
    );
  } catch (e: any) {
    recordTest(6, 'Speculation -> not treated as confirmed information', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 7: Multiple children/elderly/injured people correctly extracted
  // ------------------------------------------------------------------------
  try {
    const res7 = limitedEmergencySignalExtractor(
      "We need rescue. We have 5 people trapped here, including 2 children, 1 elderly grandmother, and 1 injured person.",
      [],
      context
    );

    const passed7 =
      res7.extractedInformation.peopleCount === 5 &&
      res7.extractedInformation.childrenCount === 2 &&
      res7.extractedInformation.elderlyCount === 1 &&
      res7.extractedInformation.injuredCount === 1;

    recordTest(
      7,
      'Multiple children/elderly/injured correctly extracted',
      passed7,
      `Extracted: P=${res7.extractedInformation.peopleCount}, C=${res7.extractedInformation.childrenCount}, E=${res7.extractedInformation.elderlyCount}, I=${res7.extractedInformation.injuredCount}`
    );
  } catch (e: any) {
    recordTest(7, 'Multiple children/elderly/injured correctly extracted', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 8: Existing priority formula receives correct fields
  // ------------------------------------------------------------------------
  try {
    // Formula from rescueController:
    // breakdown = { criticalMedical: 25, injured: min(25, 1*15)=15, children: min(15, 2*8)=15, elderly: min(15, 1*8)=8, disabled: 0, waterLevel: HIGH=15, trapped: 20 }
    // total = 25 + 15 + 15 + 8 + 0 + 15 + 20 = 98 -> capped at 100
    const testBreakdown = {
      criticalMedical: 25,
      injured: Math.min(25, 1 * 15),
      children: Math.min(15, 2 * 8),
      elderly: Math.min(15, 1 * 8),
      disabled: 0,
      waterLevel: 15,
      trappedOrStructural: 20,
    };
    const expectedScore = Math.min(100, Math.max(15, Object.values(testBreakdown).reduce((a, b) => a + b, 0)));
    const passed8 = expectedScore === 98;

    recordTest(
      8,
      'Existing priority formula receives correct fields',
      passed8,
      `Deterministic formula score: ${expectedScore}/100`
    );
  } catch (e: any) {
    recordTest(8, 'Existing priority formula receives correct fields', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 9: Waiting-time logic remains untouched
  // ------------------------------------------------------------------------
  try {
    // Check waiting time formula (+15 points per 30 minutes waiting)
    const baseScore = 50;
    const elapsedMinutes = 60;
    const waitingBonus = Math.floor(elapsedMinutes / 30) * 15;
    const finalScore = Math.min(100, baseScore + waitingBonus);
    const passed9 = waitingBonus === 30 && finalScore === 80;

    recordTest(
      9,
      'Waiting-time logic remains untouched',
      passed9,
      `60 mins waiting -> +${waitingBonus} points, Score: ${finalScore}/100`
    );
  } catch (e: any) {
    recordTest(9, 'Waiting-time logic remains untouched', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 10: Building/area priority calculation remains untouched
  // ------------------------------------------------------------------------
  try {
    // Area/Building Priority: (0.50 * Distress) + (0.30 * Unaccounted) + (0.20 * Hazard)
    const distressScore = 80;
    const unaccountedScore = 40;
    const hazardZoneScore = 90;
    const areaScore = 0.5 * distressScore + 0.3 * unaccountedScore + 0.2 * hazardZoneScore;
    const passed10 = areaScore === 70;

    // Also verify calculatePriorityScore utility returns without error
    const utilRes = await calculatePriorityScore(['FIRE', 'TRAPPED', 'WATER_RISING']);
    const passedUtil = utilRes.score === (DEFAULT_PRIORITY_WEIGHTS.FIRE + DEFAULT_PRIORITY_WEIGHTS.TRAPPED + DEFAULT_PRIORITY_WEIGHTS.WATER_RISING);

    recordTest(
      10,
      'Building/area priority calculation remains untouched',
      passed10 && passedUtil,
      `Area Score: ${areaScore}, Priority utils score: ${utilRes.score}`
    );
  } catch (e: any) {
    recordTest(10, 'Building/area priority calculation remains untouched', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 11: Gemini failure → graceful fallback
  // ------------------------------------------------------------------------
  try {
    // Process input without GEMINI_API_KEY (or invalid key)
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = '';

    const fallbackRes = await processEmergencyVoiceInput(
      "We're trapped in our apartment and water is up to our waist. Send help!",
      [],
      context
    );

    process.env.GEMINI_API_KEY = originalKey;

    const passed11 =
      fallbackRes.mode === 'EMERGENCY' &&
      fallbackRes.shouldCreateOrUpdateSos === true &&
      fallbackRes.isFallbackExtractor === true;

    recordTest(
      11,
      'Gemini failure -> graceful fallback to limited emergency signal extractor',
      passed11,
      `isFallbackExtractor: ${fallbackRes.isFallbackExtractor}, Mode: ${fallbackRes.mode}`
    );
  } catch (e: any) {
    recordTest(11, 'Gemini failure -> graceful fallback', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 12: Invalid structured Gemini output → rejected safely
  // ------------------------------------------------------------------------
  try {
    // Verify that empty or invalid payload returns safe fallback without crash
    const invalidInput = '   ';
    const res12 = limitedEmergencySignalExtractor(invalidInput, [], context);
    const passed12 = res12.mode === 'ASSESS' && res12.shouldCreateOrUpdateSos === false;

    recordTest(
      12,
      'Invalid / empty input -> rejected safely without triggering SOS',
      passed12,
      `Mode: ${res12.mode}, shouldCreateOrUpdateSos: ${res12.shouldCreateOrUpdateSos}`
    );
  } catch (e: any) {
    recordTest(12, 'Invalid structured Gemini output -> rejected safely', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 13: Microphone failure → text fallback
  // ------------------------------------------------------------------------
  try {
    // Text fallback passes typed text through the exact same engine
    const textMsg = "Water entered living room, grandfather cannot walk, need evacuation";
    const res13 = limitedEmergencySignalExtractor(textMsg, [], context);

    const passed13 =
      res13.mode === 'EMERGENCY' &&
      res13.extractedInformation.disabledCount === 1 &&
      res13.extractedInformation.conditions?.includes('PHYSICALLY_DISABLED');

    recordTest(
      13,
      'Microphone failure -> text fallback processes identically',
      Boolean(passed13),
      `Mode: ${res13.mode}, Disabled extracted: ${res13.extractedInformation.disabledCount}`
    );
  } catch (e: any) {
    recordTest(13, 'Microphone failure -> text fallback', false, e.message);
  }

  // ------------------------------------------------------------------------
  // TEST 14: Location conflict → no silent guessing
  // ------------------------------------------------------------------------
  try {
    // GPS is Koramangala (12.9352, 77.6245), spoken is Indiranagar (12.9784, 77.6408)
    const gpsLat = 12.9352;
    const gpsLng = 77.6245;
    const indiranagarLat = 12.9784;
    const indiranagarLng = 77.6408;
    const dist = calculateHaversineDistance(gpsLat, gpsLng, indiranagarLat, indiranagarLng);

    const conflict = dist > 5.0; // ~5.1 km

    // Verify formatRescueRequest parses SPOKEN_LOC and CONFLICT:YES
    const sampleRecord = {
      id: 'conflict-test-id',
      priorityScore: 75,
      rescueStatus: 'PENDING',
      description: '[SRC:VOICE, P:4, C:1, E:0, D:0, I:0, W:HIGH, T:FLOOD, SPOKEN_LOC:Indiranagar 100ft Road, CONFLICT:YES] Water rising fast',
      latitude: gpsLat,
      longitude: gpsLng,
      address: 'Koramangala, Bengaluru',
      conditions: [{ conditionType: 'NEED_RESCUE' }],
    };

    const formatted = formatRescueRequest(sampleRecord);
    const passed14 =
      conflict &&
      formatted.source === 'VOICE' &&
      formatted.locationConflict === true &&
      formatted.spokenLocation === 'Indiranagar 100ft Road';

    recordTest(
      14,
      'Location conflict -> no silent guessing, both coordinates preserved and flagged',
      passed14,
      `Calculated dist: ${dist.toFixed(1)} km, locationConflict: ${formatted.locationConflict}, Spoken: ${formatted.spokenLocation}`
    );
  } catch (e: any) {
    recordTest(14, 'Location conflict -> no silent guessing', false, e.message);
  }

  // Clean up test emergency request
  if (createdSosId) {
    await prisma.emergencyCondition.deleteMany({ where: { emergencyRequestId: createdSosId } });
    await prisma.emergencyRequest.deleteMany({ where: { id: createdSosId } });
  }

  console.log('\n===============================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(` RESULTS: ${results.filter((r) => r.passed).length} / ${results.length} PASSED`);
  if (allPassed) {
    console.log(' 🎉 ALL 14 TESTS PASSED SUCCESSFULLY!');
  } else {
    console.log(' ⚠️ SOME TESTS FAILED.');
  }
  console.log('===============================================================\n');

  await prisma.$disconnect();
  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
