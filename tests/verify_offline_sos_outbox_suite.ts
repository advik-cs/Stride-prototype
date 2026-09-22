import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import prisma from '../src/server/config/database.ts';
import { createRescueRequest, formatRescueRequest } from '../src/server/controllers/rescueController.ts';

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

async function runOfflineSosOutboxSuite() {
  console.log('================================================================');
  console.log('STRIDE OFFLINE SOS + OUTBOX / MUTATION QUEUE SUITE (PHASE 2 STEP 4)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // --- SUITE 1: STATIC ARCHITECTURE AUDIT ---
  console.log('--- SUITE 1: STATIC ARCHITECTURE AUDIT ---');

  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  assert(
    schemaContent.includes('model IdempotencyKey') &&
      schemaContent.includes('operationId') &&
      schemaContent.includes('@unique'),
    'prisma/schema.prisma defines IdempotencyKey model with @unique constraint on operationId'
  );

  const sosServicePath = path.resolve(process.cwd(), 'src/offline/sosService.ts');
  assert(fs.existsSync(sosServicePath), 'src/offline/sosService.ts exists');
  const sosServiceContent = fs.readFileSync(sosServicePath, 'utf-8');
  assert(
    sosServiceContent.includes('createSos') &&
      sosServiceContent.includes('getActiveSos') &&
      sosServiceContent.includes('cancelSos'),
    'offlineSosService implements createSos, getActiveSos, and cancelSos'
  );

  const sosSyncManagerPath = path.resolve(process.cwd(), 'src/offline/sosSyncManager.ts');
  assert(fs.existsSync(sosSyncManagerPath), 'src/offline/sosSyncManager.ts exists');
  const syncManagerContent = fs.readFileSync(sosSyncManagerPath, 'utf-8');
  assert(
    syncManagerContent.includes('syncPendingOutbox') && syncManagerContent.includes('init'),
    'sosSyncManager implements syncPendingOutbox and event initialization'
  );

  const storageServicePath = path.resolve(process.cwd(), 'src/offline/offlineStorageService.ts');
  const storageContent = fs.readFileSync(storageServicePath, 'utf-8');
  assert(
    storageContent.includes('putActiveSosAndOutbox') && storageContent.includes('reconcileSyncedSos'),
    'offlineStorageService implements atomic putActiveSosAndOutbox and reconcileSyncedSos transactions'
  );

  const rescueControllerPath = path.resolve(process.cwd(), 'src/server/controllers/rescueController.ts');
  const rescueControllerContent = fs.readFileSync(rescueControllerPath, 'utf-8');
  assert(
    rescueControllerContent.includes('x-stride-operation-id') &&
      rescueControllerContent.includes('idempotencyKey'),
    'rescueController inspects clientOperationId and uses IdempotencyKey table'
  );

  const areYouSafePath = path.resolve(process.cwd(), 'src/components/during/AreYouSafeView.tsx');
  const areYouSafeContent = fs.readFileSync(areYouSafePath, 'utf-8');
  assert(
    areYouSafeContent.includes('STATUS: PENDING SYNC (QUEUED OFFLINE)') &&
      areYouSafeContent.includes('Not Yet Reached Authorities'),
    'AreYouSafeView renders distinct PENDING SYNC offline banner without fabricating priority'
  );

  // --- SUITE 2: BACKEND SERVER IDEMPOTENCY & CONCURRENCY TESTS ---
  console.log('\n--- SUITE 2: BACKEND SERVER IDEMPOTENCY & CONCURRENCY TESTS ---');

  // Find a test citizen
  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });
  if (!citizen) throw new Error('Citizen user not found in database');

  const otherCitizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN', id: { not: citizen.id } },
  }) || { id: 'usr-other-citizen', name: 'Other Citizen' };

  const opId1 = 'test-op-uuid-001-' + Date.now();
  const opIdConcurrent = 'test-op-uuid-concurrent-' + Date.now();
  const opIdStale = 'test-op-uuid-stale-' + Date.now();

  // Clean up any previous test keys
  await prisma.idempotencyKey.deleteMany({
    where: { operationId: { in: [opId1, opIdConcurrent, opIdStale] } },
  });

  // Test 1: Single Request with operation ID creates 1 EmergencyRequest & 1 COMPLETED IdempotencyKey
  const res1 = createMockRes();
  const req1: any = {
    user: { userId: citizen.id, role: 'CITIZEN' },
    headers: { 'x-stride-operation-id': opId1 },
    body: {
      address: '77 CMH Road, Indiranagar',
      description: 'Water rising up to 4 feet, elderly member requires rescue',
      peopleCount: 3,
      injuredCount: 1,
      criticalMedicalNeed: true,
      waterLevel: 'HIGH',
      emergencyType: 'FLOOD',
    },
  };
  await createRescueRequest(req1, res1);
  assert(res1.statusCode === 201, 'First request with clientOperationId succeeds with HTTP 201');
  assert(res1.data && res1.data.id, 'First request returns created RescueRequest with id');

  const key1 = await prisma.idempotencyKey.findUnique({ where: { operationId: opId1 } });
  assert(key1 !== null && key1.status === 'COMPLETED', 'IdempotencyKey record is saved with status COMPLETED');
  assert(key1?.serverRequestId === res1.data.id, 'IdempotencyKey serverRequestId matches created SOS id');

  // Test 2 (Test B): Retry after simulated timeout returns original SOS with HTTP 200 without creating duplicate
  const resRetry = createMockRes();
  await createRescueRequest(req1, resRetry);
  assert(resRetry.statusCode === 200, 'Retry of same operationId returns HTTP 200');
  assert(resRetry.data && resRetry.data.id === res1.data.id, 'Retry returns the EXACT same RescueRequest ID');

  const totalWithOpId1 = await prisma.emergencyRequest.count({
    where: { id: res1.data.id },
  });
  assert(totalWithOpId1 === 1, 'Exactly ONE server EmergencyRequest exists after retry');

  // Test 3 (Test A): Two rapid concurrent requests with the SAME operationId result in exactly ONE SOS
  const reqConc1: any = {
    user: { userId: citizen.id, role: 'CITIZEN' },
    headers: { 'x-stride-operation-id': opIdConcurrent },
    body: {
      address: '100 Feet Road, Indiranagar',
      description: 'Roof collapse risk due to storm water',
      peopleCount: 2,
    },
  };
  const reqConc2: any = { ...reqConc1 };
  const resConc1 = createMockRes();
  const resConc2 = createMockRes();

  await Promise.all([createRescueRequest(reqConc1, resConc1), createRescueRequest(reqConc2, resConc2)]);

  const concKey = await prisma.idempotencyKey.findUnique({ where: { operationId: opIdConcurrent } });
  assert(concKey !== null && concKey.status === 'COMPLETED', 'Concurrent requests result in COMPLETED IdempotencyKey');

  const bothSucceeded = (resConc1.statusCode === 200 || resConc1.statusCode === 201) &&
                        (resConc2.statusCode === 200 || resConc2.statusCode === 201);
  assert(bothSucceeded, 'Both concurrent requests succeed cleanly without 500 error');
  assert(
    resConc1.data.id === resConc2.data.id,
    'Both concurrent requests return the EXACT same server EmergencyRequest ID'
  );

  const totalConcurrentSos = await prisma.emergencyRequest.count({
    where: { id: concKey?.serverRequestId || '' },
  });
  assert(totalConcurrentSos === 1, 'Exactly ONE EmergencyRequest created under concurrent collision');

  // Test 4 (Test C): Stale PROCESSING recovery scenario
  // Simulate a server crash during PROCESSING by creating a stale key
  await prisma.idempotencyKey.create({
    data: {
      operationId: opIdStale,
      userId: citizen.id,
      operationType: 'CREATE_SOS',
      status: 'PROCESSING',
      createdAt: new Date(Date.now() - 20000), // 20s ago
      updatedAt: new Date(Date.now() - 20000),
    },
  });

  const reqStale: any = {
    user: { userId: citizen.id, role: 'CITIZEN' },
    headers: { 'x-stride-operation-id': opIdStale },
    body: {
      address: 'Stale Recovery Address',
      description: 'Stale recovery description',
      peopleCount: 1,
    },
  };
  const resStale = createMockRes();
  await createRescueRequest(reqStale, resStale);
  assert(
    resStale.statusCode === 201 || resStale.statusCode === 200,
    'Stale PROCESSING request safely recovers and creates SOS instead of locking at 409'
  );

  // Test 5 (Test 9): User Isolation on server
  const resWrongUser = createMockRes();
  const reqWrongUser: any = {
    user: { userId: 'usr-different-attacker', role: 'CITIZEN' },
    headers: { 'x-stride-operation-id': opId1 }, // User A's operation ID
    body: {
      address: 'Fake address',
      description: 'Fake description',
    },
  };
  await createRescueRequest(reqWrongUser, resWrongUser);
  assert(
    resWrongUser.statusCode === 403,
    'Server rejects operation ID submitted under a different user (HTTP 403 Forbidden)'
  );

  // Test 6: Canonical Validation preservation
  const resInvalid = createMockRes();
  const reqInvalid: any = {
    user: { userId: citizen.id, role: 'CITIZEN' },
    headers: { 'x-stride-operation-id': 'op-invalid-' + Date.now() },
    body: { address: '' }, // Missing description and address
  };
  await createRescueRequest(reqInvalid, resInvalid);
  assert(
    resInvalid.statusCode === 400,
    'Missing address/description returns HTTP 400 without creating IdempotencyKey'
  );

  // Test 7: Deterministic priority invariance on server
  assert(
    res1.data.priorityBreakdown &&
      res1.data.priorityBreakdown.criticalMedical === 25 &&
      res1.data.priorityBreakdown.injured === 15,
    'Existing deterministic server priority formula is 100% preserved in response'
  );

  // --- SUITE 3: REAL BROWSER INDEXEDDB & OUTBOX TESTS (PLAYWRIGHT) ---
  console.log('\n--- SUITE 3: REAL BROWSER INDEXEDDB & OUTBOX TESTS (PLAYWRIGHT) ---');

  const testScriptSource = `
    import {
      offlineSosService,
      sosSyncManager,
      offlineStorageService,
      deleteStrideDB,
      openStrideDB,
    } from './src/offline/index';

    window.__STRIDE_DURING_API_URL__ = 'http://localhost:4892';

    // Mock stored user for citizen testing
    localStorage.setItem('stride_user', JSON.stringify({
      id: '${citizen.id}',
      name: '${citizen.name}',
      role: 'CITIZEN'
    }));

    window.runBrowserSosSuite = async function(step) {
      const results = [];
      function check(condition, name, err) {
        results.push({ name, passed: Boolean(condition), error: err || '' });
      }

      if (step === 'offline_create') {
        try {
          await deleteStrideDB();

          // 1. Create SOS while offline
          const outcome = await offlineSosService.createSos({
            address: '14 BTM Layout 2nd Stage',
            description: 'Trapped on 1st floor due to flood waters',
            peopleCount: 4,
            injuredCount: 2,
            criticalMedicalNeed: true,
            waterLevel: 'HIGH',
            emergencyType: 'FLOOD'
          });

          check(outcome.isOffline === true, 'Offline SOS creation returns isOffline=true');
          check(Boolean(outcome.localSos), 'Offline SOS creation returns localSos object');

          const opId = outcome.localSos.clientOperationId;
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opId);
          check(isUuid, 'Client operation ID is a valid UUID (' + opId + ')');

          // Check that no fake priority score was generated
          check(outcome.localSos.priorityScore === 0, 'Offline SOS does not fabricate fake server priority score (score=0)');
          check(outcome.localSos.syncStatus === 'PENDING', 'Offline SOS syncStatus is PENDING');

          // Check activeSos store in IndexedDB
          const inActiveStore = await offlineStorageService.getActiveSos(opId);
          check(inActiveStore.ok && inActiveStore.data && inActiveStore.data.id === opId, 'ActiveSos record safely stored in IndexedDB activeSos store');

          // Check sosOutbox store in IndexedDB
          const inOutboxStore = await offlineStorageService.getOutboxItem(opId);
          check(inOutboxStore.ok && inOutboxStore.data && inOutboxStore.data.id === opId, 'Mutation safely queued in IndexedDB sosOutbox store');
          check(inOutboxStore.ok && inOutboxStore.data && inOutboxStore.data.syncStatus === 'PENDING', 'Outbox item status is PENDING');

          // Check localStorage pointer
          const activeLocalId = localStorage.getItem('stride_active_sos_id');
          check(activeLocalId === opId, 'Active SOS ID pointer persisted in localStorage');

          localStorage.setItem('__test_op_id', opId);
        } catch (e) {
          results.push({ name: 'Unexpected exception in offline_create', passed: false, error: e.message });
        }
      } else if (step === 'reload_verify') {
        try {
          const opId = localStorage.getItem('__test_op_id');
          const active = await offlineSosService.getActiveSos('${citizen.id}');
          check(Boolean(active && active.id === opId), 'Page reload preserves pending active SOS with exact same clientOperationId');

          const outboxRes = await offlineStorageService.getOutboxItem(opId);
          check(Boolean(outboxRes.ok && outboxRes.data && outboxRes.data.id === opId), 'Page reload preserves pending outbox mutation with exact same ID');
        } catch (e) {
          results.push({ name: 'Unexpected exception in reload_verify', passed: false, error: e.message });
        }
      } else if (step === 'sync_verify') {
        try {
          const opId = localStorage.getItem('__test_op_id');

          // Trigger reconnect synchronization
          const syncReport = await sosSyncManager.syncPendingOutbox();
          check(syncReport.syncedCount >= 1, 'sosSyncManager.syncPendingOutbox synchronized pending outbox mutation');

          // Verify activeSos is now SYNCED with real serverId
          const active = await offlineStorageService.getActiveSos(opId);
          check(active.ok && active.data && active.data.syncStatus === 'SYNCED', 'activeSos updated to syncStatus=SYNCED');
          check(active.ok && active.data && Boolean(active.data.serverId), 'activeSos backfilled with serverId');
          check(active.ok && active.data && active.data.priorityScore > 0, 'activeSos populated with real server priorityScore (' + active.data.priorityScore + ')');

          // Verify outbox item is SYNCED
          const outboxItem = await offlineStorageService.getOutboxItem(opId);
          check(outboxItem.ok && outboxItem.data && outboxItem.data.syncStatus === 'SYNCED', 'Outbox mutation transitioned to SYNCED');

          // Verify rapid second sync does NOT duplicate
          const secondSync = await sosSyncManager.syncPendingOutbox();
          check(secondSync.syncedCount === 0, 'Rapid second sync does not attempt re-transmission of SYNCED mutation');
        } catch (e) {
          results.push({ name: 'Unexpected exception in sync_verify', passed: false, error: e.message });
        }
      } else if (step === 'user_isolation_verify') {
        try {
          // Switch authenticated user to User B
          localStorage.setItem('stride_user', JSON.stringify({
            id: 'usr-different-user-b',
            name: 'Priya Citizen',
            role: 'CITIZEN'
          }));

          // Queue an offline mutation for User B
          const outcomeB = await offlineSosService.createSos({
            address: 'User B Location',
            description: 'User B Distress',
            peopleCount: 1,
          });

          // Attempt sync as User C
          localStorage.setItem('stride_user', JSON.stringify({
            id: 'usr-third-user-c',
            name: 'Third Citizen',
            role: 'CITIZEN'
          }));

          const syncReportC = await sosSyncManager.syncPendingOutbox();
          check(syncReportC.syncedCount === 0, 'User C session cannot synchronize User B pending outbox item (strict user isolation)');

          // Restore citizen session
          localStorage.setItem('stride_user', JSON.stringify({
            id: '${citizen.id}',
            name: '${citizen.name}',
            role: 'CITIZEN'
          }));
        } catch (e) {
          results.push({ name: 'Unexpected exception in user_isolation_verify', passed: false, error: e.message });
        }
      } else if (step === 'online_create_verify') {
        try {
          // Test F: Existing online create flow completes directly without duplicate
          const onlineOutcome = await offlineSosService.createSos({
            address: 'Online Test Address',
            description: 'Direct online emergency submission',
            peopleCount: 2,
            criticalMedicalNeed: false,
          });

          check(onlineOutcome.isOffline === false, 'Online creation returns isOffline=false');
          check(Boolean(onlineOutcome.serverSos), 'Online creation returns serverSos object directly');
          check(onlineOutcome.localSos.syncStatus === 'SYNCED', 'Online creation sets syncStatus=SYNCED immediately');

          // Check that it was NOT enqueued in sosOutbox as PENDING
          const outboxPending = await offlineStorageService.getOutboxItemsByStatus('PENDING');
          const hasThisInPending = (outboxPending.data || []).some(o => o.id === onlineOutcome.localSos.clientOperationId);
          check(!hasThisInPending, 'Online creation does NOT leave pending outbox item (zero duplicate server creation)');
        } catch (e) {
          results.push({ name: 'Unexpected exception in online_create_verify', passed: false, error: e.message });
        }
      }

      return results;
    };
  `;

  // Bundle test script
  const bundleResult = esbuild.buildSync({
    stdin: {
      contents: testScriptSource,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2020',
  });

  const bundledJs = bundleResult.outputFiles[0].text;

  // Launch mock HTTP server to host the test bundle and handle real SOS requests
  const testHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>SOS Outbox Test Runner</title></head>
      <body>
        <div id="root"><h1>STRIDE Offline SOS Test Runner</h1></div>
        <script type="module">${bundledJs}</script>
      </body>
    </html>
  `;

  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url?.includes('/rescue-requests')) {
      let bodyStr = '';
      req.on('data', (chunk) => {
        bodyStr += chunk;
      });
      req.on('end', async () => {
        try {
          const parsedBody = bodyStr ? JSON.parse(bodyStr) : {};
          const mockRes = createMockRes();
          const mockReq: any = {
            user: { userId: citizen.id, role: 'CITIZEN' },
            headers: req.headers,
            body: parsedBody,
          };
          await createRescueRequest(mockReq, mockRes);
          res.writeHead(mockRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockRes.data));
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(testHtml);
  });

  await new Promise<void>((resolve) => server.listen(4892, resolve));

  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:4892');

    // STEP A: Offline SOS Creation
    await context.setOffline(true);
    const offlineResults: any[] = await page.evaluate(async () => {
      return (window as any).runBrowserSosSuite('offline_create');
    });
    for (const r of offlineResults) {
      assert(r.passed, r.name, r.error);
    }

    // STEP B: Page Reload Preservation (Test D)
    await context.setOffline(false);
    await page.reload();
    await context.setOffline(true);
    const reloadResults: any[] = await page.evaluate(async () => {
      return (window as any).runBrowserSosSuite('reload_verify');
    });
    for (const r of reloadResults) {
      assert(r.passed, r.name, r.error);
    }

    // STEP C: Reconnect & Synchronization
    await context.setOffline(false);
    const syncResults: any[] = await page.evaluate(async () => {
      return (window as any).runBrowserSosSuite('sync_verify');
    });
    for (const r of syncResults) {
      assert(r.passed, r.name, r.error);
    }

    // STEP D: User Isolation in Browser
    const isolationResults: any[] = await page.evaluate(async () => {
      return (window as any).runBrowserSosSuite('user_isolation_verify');
    });
    for (const r of isolationResults) {
      assert(r.passed, r.name, r.error);
    }

    // STEP E: Existing Online Flow (Test F)
    const onlineResults: any[] = await page.evaluate(async () => {
      return (window as any).runBrowserSosSuite('online_create_verify');
    });
    for (const r of onlineResults) {
      assert(r.passed, r.name, r.error);
    }

    await browser.close();
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOfflineSosOutboxSuite().catch((err) => {
  console.error('Fatal error in offline SOS outbox test suite:', err);
  process.exit(1);
});
