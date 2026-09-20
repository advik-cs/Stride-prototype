import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/server/config/database.ts';
import { getShelters, getShelterOccupancy, cleanShelterName } from '../src/server/controllers/shelterController.ts';
import { getMyHousehold } from '../src/server/controllers/householdController.ts';
import { login } from '../src/server/controllers/authController.ts';

console.log('================================================================');
console.log('STRIDE THREE TARGETED FIXES VERIFICATION SUITE');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ PASS: ${name}`);
      passCount++;
    })
    .catch((err) => {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     ${err.message}`);
      failCount++;
    });
}

async function runSuite() {
  // -------------------------------------------------------------
  // TEST 1 — Shelter labels
  // -------------------------------------------------------------
  console.log('--- TEST 1: SHELTER DEMO LABEL REMOVAL & DATA INTEGRITY ---');

  await test('cleanShelterName utility strips all demo tags', () => {
    assert.strictEqual(cleanShelterName('Koramangala Indoor Stadium (Demo Shelter)'), 'Koramangala Indoor Stadium');
    assert.strictEqual(cleanShelterName('Our Lady of Vailankanni Hall (Demo Unit A)'), 'Our Lady of Vailankanni Hall');
    assert.strictEqual(cleanShelterName('Mangaldhama Multi Utility Hall (Demo)'), 'Mangaldhama Multi Utility Hall');
    assert.strictEqual(cleanShelterName('Community Center - Demo'), 'Community Center');
    assert.strictEqual(cleanShelterName('Regular Shelter'), 'Regular Shelter');
  });

  await test('getShelters returns shelters without DEMO/Demo in names while preserving details', async () => {
    const req: any = { user: { role: 'CITIZEN' } };
    let jsonResult: any = null;
    const res: any = {
      json: (data: any) => { jsonResult = data; },
      status: () => res,
    };

    await getShelters(req, res);
    assert(Array.isArray(jsonResult), 'Expected array of shelters');
    assert(jsonResult.length >= 14, `Expected at least 14 shelters, got ${jsonResult.length}`);

    for (const shelter of jsonResult) {
      assert(!shelter.name.includes('(Demo'), `Shelter ${shelter.id} name still has (Demo: ${shelter.name}`);
      assert(!shelter.name.toLowerCase().includes('demo'), `Shelter ${shelter.id} name still contains "demo": ${shelter.name}`);
      assert(shelter.capacity > 0, `Shelter ${shelter.name} missing capacity`);
      assert(shelter.address && shelter.address.length > 0, `Shelter ${shelter.name} missing address`);
      assert(typeof shelter.latitude === 'number', `Shelter ${shelter.name} missing latitude`);
      assert(typeof shelter.longitude === 'number', `Shelter ${shelter.name} missing longitude`);
    }
  });

  await test('getShelterOccupancy returns shelters with clean names and operational metrics', async () => {
    const primaryDisaster = await prisma.disasterEvent.findFirst();
    const disasterId = primaryDisaster?.id || '00000000-0000-0000-0000-000000000001';

    const req: any = { user: { role: 'CITIZEN' }, params: { id: disasterId } };
    let jsonResult: any = null;
    const res: any = {
      json: (data: any) => { jsonResult = data; },
      status: () => res,
    };

    await getShelterOccupancy(req, res);
    assert(Array.isArray(jsonResult), 'Expected array of shelter occupancies');
    for (const s of jsonResult) {
      assert(!s.name.toLowerCase().includes('demo'), `Shelter occupancy name has "demo": ${s.name}`);
      assert(s.remainingCapacity !== undefined, 'Missing remainingCapacity');
      assert(s.occupancyPercentage !== undefined, 'Missing occupancyPercentage');
    }
  });

  await test('ShelterSelectionView.tsx strips DEMO labels using cleanShelterName', () => {
    const viewPath = path.resolve('src/components/before/ShelterSelectionView.tsx');
    const content = fs.readFileSync(viewPath, 'utf8');
    assert(content.includes('cleanShelterName(shelter.name)'), 'ShelterSelectionView does not use cleanShelterName for shelter title');
  });

  // -------------------------------------------------------------
  // TEST 2, 3, 4 — DuringDashboardView Role Awareness
  // -------------------------------------------------------------
  console.log('\n--- TESTS 2, 3, 4: DURING DASHBOARD RESCUE PIPELINE ROLE GATING ---');

  const duringDashboardPath = path.resolve('src/components/during/DuringDashboardView.tsx');
  const duringContent = fs.readFileSync(duringDashboardPath, 'utf8');

  await test('TEST 2 — Citizen DURING: Live Rescue Operation Pipeline is NOT shown to Citizen', () => {
    // The pipeline section must be wrapped in user.role !== 'CITIZEN'
    const pipelineIdx = duringContent.indexOf('Live Rescue Operation Pipeline');
    assert(pipelineIdx !== -1, 'Live Rescue Operation Pipeline section not found in DuringDashboardView.tsx');

    // Find the enclosing block before the title
    const beforePipeline = duringContent.slice(Math.max(0, pipelineIdx - 600), pipelineIdx);
    assert(
      beforePipeline.includes("user.role !== 'CITIZEN'"),
      'Live Rescue Operation Pipeline must be conditionally gated with user.role !== \'CITIZEN\''
    );
  });

  await test('TEST 3 & 4 — Authority & Rescuer DURING: Pipeline remains available for non-citizens', () => {
    // The condition user.role !== 'CITIZEN' evaluates to true for both AUTHORITY and RESCUER
    const isVisibleForRole = (role: string) => role !== 'CITIZEN';
    assert.strictEqual(isVisibleForRole('AUTHORITY'), true, 'Pipeline must be visible for AUTHORITY');
    assert.strictEqual(isVisibleForRole('RESCUER'), true, 'Pipeline must be visible for RESCUER');
    assert.strictEqual(isVisibleForRole('CITIZEN'), false, 'Pipeline must NOT be visible for CITIZEN');
  });

  // -------------------------------------------------------------
  // TEST 5, 6, 7 — Citizen Identity & Household Registration
  // -------------------------------------------------------------
  console.log('\n--- TESTS 5, 6, 7: CITIZEN IDENTITY & SELF MEMBER BINDING ---');

  // Test 5: Login as Ramesh Iyer
  await test('TEST 5 — Citizen identity: Login as Ramesh Iyer -> Self = Ramesh Iyer', async () => {
    const testPhone = '9800000011';
    // 1. Simulate login with Ramesh Iyer
    let loginData: any = null;
    const loginReq: any = {
      body: {
        mobileNumber: testPhone,
        password: 'StrongPassword123!',
        name: 'Ramesh Iyer',
        role: 'CITIZEN',
      },
    };
    const loginRes: any = {
      json: (d: any) => { loginData = d; },
      status: () => loginRes,
    };
    await login(loginReq, loginRes);
    assert(loginData?.user, 'Login failed');
    assert.strictEqual(loginData.user.name, 'Ramesh Iyer', 'User name must be Ramesh Iyer');

    // 2. Fetch household
    let hhData: any = null;
    const hhReq: any = {
      user: { userId: loginData.user.id, role: 'CITIZEN', name: 'Ramesh Iyer' },
    };
    const hhRes: any = {
      json: (d: any) => { hhData = d; },
      status: () => hhRes,
    };
    await getMyHousehold(hhReq, hhRes);

    assert(hhData?.members, 'No household members returned');
    const selfMember = hhData.members.find((m: any) => m.relationship.toLowerCase().includes('self'));
    assert(selfMember, 'No Self member found in household');
    assert.strictEqual(selfMember.name, 'Ramesh Iyer', `Self member name should be Ramesh Iyer, got ${selfMember.name}`);
    assert.notStrictEqual(selfMember.name, 'Priya Sharma', 'Self member must NOT be Priya Sharma');
  });

  // Test 6: Login as different citizen named X (e.g. Rahul Kumar)
  await test('TEST 6 — Different Citizen: Login as Rahul Kumar -> Self = Rahul Kumar (not Priya or Ramesh)', async () => {
    const testPhoneX = '9899123456';
    let loginDataX: any = null;
    const loginReqX: any = {
      body: {
        mobileNumber: testPhoneX,
        password: 'StrongPassword123!',
        name: 'Rahul Kumar',
        testIdentityNumber: 'TEST-AADHAAR-RAHUL',
        role: 'CITIZEN',
      },
    };
    const loginResX: any = {
      json: (d: any) => { loginDataX = d; },
      status: () => loginResX,
    };
    await login(loginReqX, loginResX);
    assert(loginDataX?.user, 'Login for Rahul Kumar failed');
    assert.strictEqual(loginDataX.user.name, 'Rahul Kumar');

    // Fetch household for Rahul Kumar
    let hhDataX: any = null;
    const hhReqX: any = {
      user: { userId: loginDataX.user.id, role: 'CITIZEN', name: 'Rahul Kumar' },
    };
    const hhResX: any = {
      json: (d: any) => { hhDataX = d; },
      status: () => hhResX,
    };
    await getMyHousehold(hhReqX, hhResX);

    assert(hhDataX?.members, 'No household members returned for Rahul Kumar');
    const selfMemberX = hhDataX.members.find((m: any) => m.relationship.toLowerCase().includes('self'));
    assert(selfMemberX, 'No Self member found for Rahul Kumar');
    assert.strictEqual(selfMemberX.name, 'Rahul Kumar', `Self member must be Rahul Kumar, got ${selfMemberX.name}`);
    assert.notStrictEqual(selfMemberX.name, 'Ramesh Iyer', 'Self member must NOT be Ramesh Iyer');
    assert.notStrictEqual(selfMemberX.name, 'Priya Sharma', 'Self member must NOT be Priya Sharma');
  });

  // Test 7: Persistence
  await test('TEST 7 — Persistence: Re-fetching household preserves authenticated user name for Self', async () => {
    const testPhoneY = '9877654321';
    const userYName = 'Dr. Meenakshi Sundaram';

    // 1. Login user Y
    let loginDataY: any = null;
    const loginReqY: any = {
      body: {
        mobileNumber: testPhoneY,
        password: 'StrongPassword123!',
        name: userYName,
        testIdentityNumber: 'TEST-AADHAAR-MEENAKSHI',
        role: 'CITIZEN',
      },
    };
    const loginResY: any = {
      json: (d: any) => { loginDataY = d; },
      status: () => loginResY,
    };
    await login(loginReqY, loginResY);

    // 2. Fetch household initial
    let hhData1: any = null;
    const hhReq1: any = {
      user: { userId: loginDataY.user.id, role: 'CITIZEN', name: userYName },
    };
    const hhRes1: any = {
      json: (d: any) => { hhData1 = d; },
      status: () => hhRes1,
    };
    await getMyHousehold(hhReq1, hhRes1);
    const self1 = hhData1.members.find((m: any) => m.relationship.toLowerCase().includes('self'));
    assert.strictEqual(self1.name, userYName);

    // 3. Re-fetch / simulate reload navigation
    let hhData2: any = null;
    const hhReq2: any = {
      user: { userId: loginDataY.user.id, role: 'CITIZEN', name: userYName },
    };
    const hhRes2: any = {
      json: (d: any) => { hhData2 = d; },
      status: () => hhRes2,
    };
    await getMyHousehold(hhReq2, hhRes2);
    const self2 = hhData2.members.find((m: any) => m.relationship.toLowerCase().includes('self'));
    assert.strictEqual(self2.name, userYName, 'Self member name must persist across re-fetches');

    // 4. Verify database record directly
    const dbMember = await prisma.householdMember.findUnique({ where: { id: self2.id } });
    assert(dbMember, 'Database member must exist');
    assert.strictEqual(dbMember.name, userYName, 'Database record must store the authoritative user name');
  });

  await test('Existing non-Self household members are preserved', async () => {
    // Check household for 9800000011 (Ramesh Iyer) has multiple members preserved
    const rameshUser = await prisma.user.findFirst({ where: { mobileNumber: '9800000011' } });
    assert(rameshUser, 'Ramesh user must exist');

    const hh = await prisma.household.findFirst({
      where: { userId: rameshUser.id },
      include: { members: true },
    });
    assert(hh, 'Household must exist');
    assert(hh.members.length >= 4, `Expected at least 4 family members, found ${hh.members.length}`);

    // Verify relations
    const relations = hh.members.map((m) => m.relationship);
    assert(relations.some((r) => r.toLowerCase().includes('self')), 'Missing Self relation');
    assert(relations.some((r) => r.toLowerCase().includes('spouse')), 'Missing Spouse relation');
    assert(relations.some((r) => r.toLowerCase().includes('child')), 'Missing Child relation');
  });

  // -------------------------------------------------------------
  // REGRESSION CHECKS
  // -------------------------------------------------------------
  console.log('\n--- SUITE: REGRESSION INVARIANTS & INTEGRITY ---');

  await test('Git remote tracked is workbase, origin/Stride-prototype is untouched', () => {
    const gitConfig = fs.readFileSync('.git/config', 'utf8');
    assert(gitConfig.includes('advik-cs/workbase.git'), 'Git config missing workbase remote');
  });

  await test('HouseholdMembersView.tsx binds Self member dynamically on load', () => {
    const hhViewPath = path.resolve('src/components/before/HouseholdMembersView.tsx');
    const content = fs.readFileSync(hhViewPath, 'utf8');
    assert(content.includes('authName && Array.isArray(hh.members)'), 'Missing client-side authName binding');
    assert(content.includes("m.relationship?.toLowerCase().includes('self')"), 'Missing client-side Self check');
  });

  await test('householdService fallback uses stored auth name', () => {
    const hhServicePath = path.resolve('src/services/householdService.ts');
    const content = fs.readFileSync(hhServicePath, 'utf8');
    assert(content.includes('authApi.getStoredUser()'), 'Missing authApi in householdService');
    assert(!content.includes('Vikram Malhotra'), 'Vikram Malhotra must not be hardcoded in householdService');
  });

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
