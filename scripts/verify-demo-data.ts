import 'dotenv/config';
import prisma from '../src/server/config/database.ts';
import { generateToken } from '../src/server/middleware/auth.ts';
import createApp from '../src/server/app.ts';
import http from 'http';
import { seedDemoData, DEMO_PREFIX } from './seed-demo-data.ts';
import { clearDemoData } from './clear-demo-data.ts';

async function runVerification() {
  console.log('===============================================================');
  console.log(' STRIDE — DEMO DATA VERIFICATION SUITE');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Initial cleanup to start from known state
  await clearDemoData();

  // 2. Test Step 1: Run demo:seed
  console.log('\n--- TEST 1: SEED DEMO DATA ---');
  await seedDemoData();

  const seededRequests = await prisma.emergencyRequest.findMany({
    where: { id: { startsWith: DEMO_PREFIX } },
    include: { conditions: true, rescueAssignments: true },
    orderBy: { priorityScore: 'desc' },
  });

  assert(seededRequests.length === 6, `Seeded exactly 6 demo emergency requests (found: ${seededRequests.length})`);

  // Verify priority spread: CRITICAL, HIGH, MEDIUM, LOW
  const scores = seededRequests.map((r) => r.priorityScore);
  const hasCritical = scores.some((s) => s >= 75);
  const hasHigh = scores.some((s) => s >= 50 && s < 75);
  const hasMedium = scores.some((s) => s >= 25 && s < 50);
  const hasLow = scores.some((s) => s < 25);

  assert(hasCritical, `Has CRITICAL request (score >= 75): scores = [${scores.join(', ')}]`);
  assert(hasHigh, `Has HIGH request (50 <= score < 75)`);
  assert(hasMedium, `Has MEDIUM request (25 <= score < 50)`);
  assert(hasLow, `Has LOW request (score < 25)`);

  // Verify assignments: at least 2-3 assigned missions
  const assigned = seededRequests.filter((r) => r.rescueAssignments.length > 0);
  assert(assigned.length >= 3, `At least 3 demo requests assigned to rescue teams (found: ${assigned.length})`);

  // 3. Test Step 2: Idempotency (run seed second time)
  console.log('\n--- TEST 2: IDEMPOTENT SEED EXECUTION ---');
  await seedDemoData();

  const countAfterSecondSeed = await prisma.emergencyRequest.count({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  assert(countAfterSecondSeed === 6, `Second seed did not duplicate records (total: ${countAfterSecondSeed})`);

  // 4. Test Step 3 & 4: API Endpoint Validation (Authority & Rescuer)
  console.log('\n--- TEST 3 & 4: API ENDPOINT INTEGRATION (Authority & Rescuer) ---');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const authorityUser = await prisma.user.findFirst({ where: { role: 'RESCUER' } });
  const citizenUser = await prisma.user.findFirst({ where: { role: 'CITIZEN' } });

  const authorityToken = generateToken({
    userId: authorityUser?.id || 'auth-user',
    role: 'AUTHORITY',
  });
  const rescuerToken = generateToken({
    userId: authorityUser?.id || 'rescuer-user',
    role: 'RESCUER',
  });
  const citizenToken = generateToken({
    userId: citizenUser?.id || 'citizen-user',
    role: 'CITIZEN',
  });

  // Authority Ranked Requests endpoint
  const authRes = await fetch(`${baseUrl}/api/authority/rescue-requests/ranked`, {
    headers: { Authorization: `Bearer ${authorityToken}` },
  });
  assert(authRes.status === 200, `Authority ranked queue returns HTTP 200 (status: ${authRes.status})`);
  const authData: any[] = await authRes.json();
  const demoInAuthority = authData.filter((r) => r.id.startsWith(DEMO_PREFIX));
  assert(demoInAuthority.length === 6, `Authority sees all 6 demo emergency requests`);
  assert(demoInAuthority[0].priorityScore >= demoInAuthority[1].priorityScore, `Authority queue is properly sorted descending by priorityScore`);

  // Rescuer Assigned Missions endpoint
  const rescuerRes = await fetch(`${baseUrl}/api/rescuer/assignments`, {
    headers: { Authorization: `Bearer ${rescuerToken}` },
  });
  assert(rescuerRes.status === 200, `Rescuer assigned missions returns HTTP 200 (status: ${rescuerRes.status})`);
  const rescuerData: any[] = await rescuerRes.json();
  const demoInRescuer = rescuerData.filter((r) => r.id.startsWith(DEMO_PREFIX));
  assert(demoInRescuer.length >= 3, `Rescuer sees assigned demo missions (found: ${demoInRescuer.length})`);
  assert(
    demoInRescuer.every((m) => m.team !== null && (m.status === 'ASSIGNED' || m.status === 'IN_PROGRESS')),
    `All Rescuer missions have assigned team information and valid operational status`
  );

  // 5. Test Step 5: Role Authorization & Citizen Isolation
  console.log('\n--- TEST 5: ROLE AUTHORIZATION & CITIZEN ISOLATION ---');
  // Citizen querying individual request belonging to another household
  const citizenViewRes = await fetch(`${baseUrl}/api/emergency-requests/${seededRequests[0].id}`, {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert(
    citizenViewRes.status === 403,
    `Citizen denied access to other household's emergency request details (HTTP ${citizenViewRes.status})`
  );

  // Citizen querying disaster emergency requests is scoped to own household only
  const activeDisasterId = seededRequests[0].disasterId;
  const citizenListRes = await fetch(`${baseUrl}/api/disasters/${activeDisasterId}/emergency-requests`, {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert(citizenListRes.status === 200, `Citizen requests query returns HTTP 200`);
  const citizenListData: any[] = await citizenListRes.json();
  const demoLeakedToCitizen = citizenListData.filter((r) => r.id.startsWith(DEMO_PREFIX));
  assert(
    demoLeakedToCitizen.length === 0,
    `Citizen cannot see other households' demo requests in emergency requests list (leaked: ${demoLeakedToCitizen.length})`
  );

  // Citizen cannot invoke responder-only assignment endpoint
  const citizenAssignRes = await fetch(`${baseUrl}/api/emergency-requests/${seededRequests[0].id}/assign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${citizenToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ teamName: 'NDRF 10th Battalion — Alpha Flood Squad' }),
  });
  assert(
    citizenAssignRes.status === 403,
    `Citizen cannot perform responder assignment on /emergency-requests/:id/assign (HTTP ${citizenAssignRes.status})`
  );

  // 6. Test Step 6: Cleanup safety
  console.log('\n--- TEST 6: CLEANUP SAFETY ---');
  await clearDemoData();

  const countAfterClear = await prisma.emergencyRequest.count({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  assert(countAfterClear === 0, `All demo requests removed by demo:clear (found: ${countAfterClear})`);

  const demoUsersCount = await prisma.user.count({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  assert(demoUsersCount === 0, `All demo users removed by demo:clear (found: ${demoUsersCount})`);

  // Close HTTP server
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // 7. Seed again for screenshots as requested by the user prompt!
  console.log('\n--- SEEDING DEMO DATA FOR IMMEDIATE DASHBOARD SCREENSHOTS ---');
  await seedDemoData();

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} / ${passed + failed} PASSED`);
  if (failed === 0) {
    console.log(' 🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  } else {
    console.error(` ❌ ${failed} CHECKS FAILED`);
    process.exit(1);
  }
  console.log('===============================================================');
}

runVerification()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Verification failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
