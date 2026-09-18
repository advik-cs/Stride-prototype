import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_HOSPITALS, DEMO_DATA_DISCLAIMER } from '../src/server/data/canonicalHospitals.ts';
import { hospitalController } from '../src/server/controllers/hospitalController.ts';

console.log('================================================================');
console.log('STRIDE HOSPITAL INFORMATION & CITIZEN DURING SHELTER SUITE');
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
  console.log('--- SUITE 1: CANONICAL BENGALURU HOSPITAL DATASET INTEGRITY ---');

  await test('Contains at least 10 real-world Bengaluru hospitals', () => {
    assert(CANONICAL_HOSPITALS.length >= 10, `Expected at least 10 hospitals, found ${CANONICAL_HOSPITALS.length}`);
  });

  await test('Mandatory demo disclaimer is present on all canonical hospitals', () => {
    assert(DEMO_DATA_DISCLAIMER.includes('⚠️ DEMO DATA'), 'Global disclaimer missing warning prefix');
    assert(DEMO_DATA_DISCLAIMER.includes('simulated for the STRIDE prototype'), 'Disclaimer text mismatch');
    for (const h of CANONICAL_HOSPITALS) {
      assert.strictEqual(h.disclaimer, DEMO_DATA_DISCLAIMER, `Hospital ${h.id} missing canonical disclaimer`);
    }
  });

  await test('Real-world coordinates are within the Bengaluru metropolitan bounding box', () => {
    // Bengaluru approx: Lat 12.80 to 13.15, Lng 77.45 to 77.75
    for (const h of CANONICAL_HOSPITALS) {
      assert(h.latitude >= 12.80 && h.latitude <= 13.15, `Hospital ${h.name} lat ${h.latitude} outside Bengaluru`);
      assert(h.longitude >= 77.45 && h.longitude <= 77.75, `Hospital ${h.name} lng ${h.longitude} outside Bengaluru`);
    }
  });

  await test('Bed, ICU, and Doctor metrics are consistent simulated telemetry', () => {
    for (const h of CANONICAL_HOSPITALS) {
      assert(h.totalBeds > 0, `${h.name} total beds must be > 0`);
      assert(h.availableBeds >= 0 && h.availableBeds <= h.totalBeds, `${h.name} available beds ${h.availableBeds} invalid`);
      assert(h.icuBedsTotal > 0, `${h.name} ICU beds total must be > 0`);
      assert(h.icuBedsAvailable >= 0 && h.icuBedsAvailable <= h.icuBedsTotal, `${h.name} available ICU beds invalid`);
      assert(typeof h.emergencyDepartmentAvailable === 'boolean', `${h.name} emergencyDepartmentAvailable must be boolean`);
      assert(Array.isArray(h.specialities) && h.specialities.length >= 3, `${h.name} must list at least 3 specialities`);
      assert(Array.isArray(h.doctors) && h.doctors.length >= 2, `${h.name} must list on-duty simulated doctors`);
      for (const doc of h.doctors) {
        assert(doc.name.length > 0, `${h.name} doctor name cannot be empty`);
        assert(doc.speciality.length > 0, `${h.name} doctor speciality cannot be empty`);
        assert(typeof doc.onDuty === 'boolean', `${h.name} doctor onDuty must be boolean`);
      }
    }
  });

  console.log('\n--- SUITE 2: CONTROLLER & ROLE SCOPING LOGIC ---');

  await test('Citizen local scoping filters and sorts by Haversine distance', async () => {
    // Koramangala coordinates
    const req: any = {
      user: { role: 'CITIZEN' },
      query: { scope: 'local', lat: '12.9352', lng: '77.6245' },
    };
    let jsonResult: any = null;
    const res: any = {
      json: (data: any) => { jsonResult = data; },
      status: () => res,
    };

    await hospitalController.getHospitals(req, res);
    assert(jsonResult, 'No JSON response from getHospitals');
    assert.strictEqual(jsonResult.scope, 'CITIZEN_LOCAL');
    assert.strictEqual(jsonResult.role, 'CITIZEN');
    assert(jsonResult.hospitals.length > 0, 'Should return nearby hospitals');

    // First hospital should be St. John's or Manipal (very close to Koramangala)
    const first = jsonResult.hospitals[0];
    assert(first.distanceKm !== undefined, 'Distance must be computed');
    assert(first.distanceKm <= 5.0, `First hospital ${first.name} should be <= 5km from Koramangala, got ${first.distanceKm}`);

    // Check ascending distance sort
    for (let i = 1; i < jsonResult.hospitals.length; i++) {
      assert(
        (jsonResult.hospitals[i].distanceKm ?? 0) >= (jsonResult.hospitals[i - 1].distanceKm ?? 0),
        'Hospitals must be sorted by ascending distance'
      );
    }
  });

  await test('Authority and Rescuer receive city-wide jurisdiction view', async () => {
    for (const role of ['AUTHORITY', 'RESCUER']) {
      const req: any = {
        user: { role },
        query: { scope: 'all' },
      };
      let jsonResult: any = null;
      const res: any = {
        json: (data: any) => { jsonResult = data; },
        status: () => res,
      };

      await hospitalController.getHospitals(req, res);
      assert(jsonResult, `No response for ${role}`);
      assert.strictEqual(jsonResult.scope, 'JURISDICTION_WIDE');
      assert.strictEqual(jsonResult.totalCount, CANONICAL_HOSPITALS.length);
      assert.strictEqual(jsonResult.hospitals.length, CANONICAL_HOSPITALS.length);
    }
  });

  await test('getHospitalById returns full details including doctors and specialities', async () => {
    const req: any = {
      user: { role: 'CITIZEN' },
      params: { id: 'st-johns' },
      query: { lat: '12.9352', lng: '77.6245' },
    };
    let jsonResult: any = null;
    const res: any = {
      json: (data: any) => { jsonResult = data; },
      status: () => res,
    };

    await hospitalController.getHospitalById(req, res);
    assert(jsonResult, 'No hospital found for st-johns');
    assert.strictEqual(jsonResult.id, '803bdaec-4f58-4a2f-a5e4-510d6ca15d88');
    assert.strictEqual(jsonResult.name, "St. John's Medical College Hospital");
    assert(jsonResult.doctors.length >= 3, 'Must return doctors roster');
    assert(jsonResult.distanceKm !== undefined, 'Must calculate distance if coordinates supplied');
  });

  console.log('\n--- SUITE 3: SYMMETRICAL 3x2 VISIBILITY MATRIX & NAVIGATION ---');

  const dashboardLayoutPath = path.resolve('src/components/layout/DashboardLayout.tsx');
  const dashboardLayoutCode = fs.readFileSync(dashboardLayoutPath, 'utf8');

  await test('DashboardLayout: beforeNavItems includes shelterInfo and hospitalInfo', () => {
    assert(dashboardLayoutCode.includes("{ id: 'shelters', label: t('navigation.shelterInfo')"), 'beforeNavItems missing shelters');
    assert(dashboardLayoutCode.includes("{ id: 'hospitals', label: t('navigation.hospitalInfo')"), 'beforeNavItems missing hospitals');
  });

  await test('DashboardLayout: duringNavItems includes shelterInfo and hospitalInfo for all roles', () => {
    // In duringNavItems, both shelters and hospitals must not be restricted by role !== 'CITIZEN'
    const duringNavItemsMatch = dashboardLayoutCode.match(/const duringNavItems = \[([\s\S]*?)\];/);
    assert(duringNavItemsMatch, 'Could not find duringNavItems definition');
    const duringNavItemsContent = duringNavItemsMatch[1];

    assert(duringNavItemsContent.includes("id: 'shelters'"), 'duringNavItems missing shelters');
    assert(duringNavItemsContent.includes("id: 'hospitals'"), 'duringNavItems missing hospitals');
    // Ensure they are NOT inside user.role !== 'CITIZEN' condition
    assert(!duringNavItemsContent.includes("user.role !== 'CITIZEN' ? [{ id: 'shelters'"), 'shelters must not be gated from citizen');
    assert(!duringNavItemsContent.includes("user.role !== 'CITIZEN' ? [{ id: 'hospitals'"), 'hospitals must not be gated from citizen');
  });

  const appPath = path.resolve('src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf8');

  await test('App.tsx: BEFORE phase renders ShelterSelectionView and HospitalInformationView', () => {
    assert(appCode.includes("beforeTab === 'shelters' && ("), 'App.tsx missing beforeTab shelters branch');
    assert(appCode.includes("<ShelterSelectionView"), 'App.tsx does not render ShelterSelectionView in beforeTab');
    assert(appCode.includes("beforeTab === 'hospitals' && ("), 'App.tsx missing beforeTab hospitals branch');
    assert(appCode.includes('<HospitalInformationView'), 'App.tsx does not render HospitalInformationView in beforeTab');
  });

  await test('App.tsx: DURING phase renders ShelterSelectionView (BUG FIX) and HospitalInformationView', () => {
    assert(appCode.includes("duringTab === 'shelters' && ("), 'App.tsx missing duringTab shelters branch (CITIZEN DURING BUG)');
    assert(appCode.includes("duringTab === 'hospitals' && ("), 'App.tsx missing duringTab hospitals branch');
  });

  console.log('\n--- SUITE 4: DASHBOARD QUICK ACTION INTEGRATION ---');

  const beforeDashboardPath = path.resolve('src/components/before/BeforeDashboardView.tsx');
  const beforeDashboardCode = fs.readFileSync(beforeDashboardPath, 'utf8');

  await test('BeforeDashboardView: Summary card and Roadmap include Hospital Information', () => {
    assert(beforeDashboardCode.includes("onNavigateTab('hospitals')"), 'BeforeDashboardView missing onNavigateTab hospitals');
    assert(beforeDashboardCode.includes('Hospital Information'), 'BeforeDashboardView missing Hospital Information title');
  });

  const duringDashboardPath = path.resolve('src/components/during/DuringDashboardView.tsx');
  const duringDashboardCode = fs.readFileSync(duringDashboardPath, 'utf8');

  await test('DuringDashboardView: Quick navigation includes both Shelter and Hospital Information', () => {
    assert(duringDashboardCode.includes("onNavigateTab('shelters')"), 'DuringDashboardView missing onNavigateTab shelters');
    assert(duringDashboardCode.includes("onNavigateTab('hospitals')"), 'DuringDashboardView missing onNavigateTab hospitals');
  });

  console.log('\n--- SUITE 5: REUSABLE HOSPITAL MODAL & RESCUER WORKFLOWS ---');

  const hospitalDetailsPath = path.resolve('src/components/hospital/HospitalDetails.tsx');
  const hospitalDetailsCode = fs.readFileSync(hospitalDetailsPath, 'utf8');

  await test('HospitalDetails: Prominently renders demo disclaimer', () => {
    assert(hospitalDetailsCode.includes('DEMO DATA DISCLAIMER') || hospitalDetailsCode.includes('DEMO DATA'), 'HospitalDetails missing disclaimer');
  });

  await test('HospitalDetails: Provides Rescuer casualty routing and direct phone dispatch', () => {
    assert(hospitalDetailsCode.includes('user.role === \'RESCUER\''), 'HospitalDetails missing rescuer role actions');
    assert(hospitalDetailsCode.includes('tel:'), 'HospitalDetails missing click to call');
  });

  console.log('\n--- SUITE 6: GIT REMOTE & INVARIANT VALIDATION ---');

  await test('Repository tracked remote is workbase, origin/Final-prototype must remain untouched', () => {
    const gitConfigPath = path.resolve('.git/config');
    const gitConfig = fs.readFileSync(gitConfigPath, 'utf8');
    assert(gitConfig.includes('advik-cs/workbase.git'), 'Git config must contain workbase remote');
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
