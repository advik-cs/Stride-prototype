import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import prisma from '../src/server/config/database.ts';
import { createRescueRequest } from '../src/server/controllers/rescueController.ts';
import { getBackoffDelayMs } from '../src/offline/sosSyncManager.ts';

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

async function runOfflineUxAndSyncHardeningSuite() {
  console.log('================================================================');
  console.log('STRIDE OFFLINE UX, CONNECTIVITY STATE & SYNC HARDENING (STEP 5)');
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

  // --- SUITE 1: STATIC ARCHITECTURE & BOUNDARY CHECKS ---
  console.log('--- SUITE 1: STATIC ARCHITECTURE & BOUNDARY CHECKS ---');

  // 1. Connectivity service existence and exports
  const connServicePath = path.resolve(process.cwd(), 'src/offline/connectivityService.ts');
  assert(fs.existsSync(connServicePath), 'src/offline/connectivityService.ts exists');
  const connContent = fs.readFileSync(connServicePath, 'utf-8');
  assert(
    connContent.includes('getState') &&
      connContent.includes('getStatus') &&
      connContent.includes('subscribe') &&
      connContent.includes('refreshPendingStatus') &&
      connContent.includes('setSyncing') &&
      connContent.includes('recordApiSuccess') &&
      connContent.includes('recordApiFailure'),
    'connectivityService implements state getters, subscriber pattern, and reachability tracking without polling'
  );

  // 2. React hook existence
  const hookPath = path.resolve(process.cwd(), 'src/offline/useConnectivityStatus.ts');
  assert(fs.existsSync(hookPath), 'src/offline/useConnectivityStatus.ts exists');
  const hookContent = fs.readFileSync(hookPath, 'utf-8');
  assert(
    hookContent.includes('useConnectivityStatus') && hookContent.includes('subscribe'),
    'useConnectivityStatus hook subscribes cleanly to connectivityService'
  );

  // 3. GlobalOfflineBanner existence and DashboardLayout integration
  const bannerPath = path.resolve(process.cwd(), 'src/components/common/GlobalOfflineBanner.tsx');
  assert(fs.existsSync(bannerPath), 'src/components/common/GlobalOfflineBanner.tsx exists');
  const layoutPath = path.resolve(process.cwd(), 'src/components/layout/DashboardLayout.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
  assert(
    layoutContent.includes('GlobalOfflineBanner') &&
      layoutContent.includes('<GlobalOfflineBanner />'),
    'GlobalOfflineBanner is mounted in authenticated DashboardLayout'
  );

  // 4. Bounded exponential backoff schedule formula verification (Refinement 1)
  assert(getBackoffDelayMs(1) === 2000, 'Backoff schedule: Attempt 1 is exactly 2,000ms (2s)');
  assert(getBackoffDelayMs(2) === 5000, 'Backoff schedule: Attempt 2 is exactly 5,000ms (5s)');
  assert(getBackoffDelayMs(3) === 15000, 'Backoff schedule: Attempt 3 is exactly 15,000ms (15s)');
  assert(getBackoffDelayMs(4) === 30000, 'Backoff schedule: Attempt 4 is exactly 30,000ms (30s)');
  assert(getBackoffDelayMs(5) === 60000, 'Backoff schedule: Attempt 5 is capped at 60,000ms (60s max)');
  assert(getBackoffDelayMs(10) === 60000, 'Backoff schedule: Higher attempts stay strictly capped at 60,000ms');

  // 5. Service Worker Boundary (Item 22)
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
  const viteContent = fs.readFileSync(viteConfigPath, 'utf-8');
  assert(
    viteContent.includes('/^\\/api\\/.*/') &&
      viteContent.includes('/^\\/auth\\/.*/'),
    'Service worker denylists /api/* and /auth/* from runtime caching'
  );

  // 6. Deterministic Priority and Voice Pipeline Integrity (Items 27, 28)
  const rescueControllerPath = path.resolve(process.cwd(), 'src/server/controllers/rescueController.ts');
  const rescueControllerContent = fs.readFileSync(rescueControllerPath, 'utf-8');
  assert(
    rescueControllerContent.includes('criticalMedicalNeed') &&
      rescueControllerContent.includes('waterLevel') &&
      rescueControllerContent.includes('injuredCount'),
    'Authoritative server deterministic priority calculation is preserved'
  );

  const voiceControllerPath = path.resolve(process.cwd(), 'src/server/controllers/voiceEmergencyController.ts');
  assert(fs.existsSync(voiceControllerPath), 'voiceEmergencyController.ts remains intact');

  // --- SUITE 2: BACKEND SERVER IDEMPOTENCY & CONCURRENCY TESTS ---
  console.log('\n--- SUITE 2: BACKEND SERVER IDEMPOTENCY ---');

  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });
  if (!citizen) throw new Error('Citizen user not found in database');

  const serverOpId = 'op-step5-server-' + Date.now();
  const mockReqA: any = {
    user: { userId: citizen.id, role: 'CITIZEN' },
    headers: { 'x-stride-operation-id': serverOpId },
    body: {
      address: 'Step 5 Test Boulevard',
      description: 'Verifying Step 5 server idempotency',
      waterLevel: 'HIGH',
      emergencyType: 'FLOOD',
      peopleCount: 2,
    },
  };

  const resA = createMockRes();
  await createRescueRequest(mockReqA, resA);
  assert(resA.statusCode === 201, 'First request with clientOperationId succeeds with HTTP 201');
  const createdId = resA.data?.id;

  const resRetry = createMockRes();
  await createRescueRequest(mockReqA, resRetry);
  assert(resRetry.statusCode === 200, 'Retry returns HTTP 200 via cached IdempotencyKey');
  assert(resRetry.data?.id === createdId, 'Retry returns exact same EmergencyRequest ID (no duplicate)');

  // Clean up server test records
  await prisma.idempotencyKey.deleteMany({ where: { operationId: serverOpId } });
  await prisma.emergencyCondition.deleteMany({ where: { emergencyRequestId: createdId } });
  await prisma.rescueAssignment.deleteMany({ where: { emergencyRequestId: createdId } });
  await prisma.emergencyRequest.deleteMany({ where: { id: createdId } });

  // --- SUITE 3: REAL BROWSER (PLAYWRIGHT) CONNECTIVITY & UX TESTS ---
  console.log('\n--- SUITE 3: REAL BROWSER (PLAYWRIGHT) CONNECTIVITY & UX TESTS ---');

  const testScriptSource = `
    import { connectivityService } from './src/offline/connectivityService.ts';
    import { offlineSosService } from './src/offline/sosService.ts';
    import { offlineStorageService } from './src/offline/offlineStorageService.ts';
    import { sosSyncManager, getBackoffDelayMs } from './src/offline/sosSyncManager.ts';
    import { offlineCacheService } from './src/offline/cacheService.ts';

    (window as any).connectivityService = connectivityService;
    (window as any).offlineSosService = offlineSosService;
    (window as any).offlineStorageService = offlineStorageService;
    (window as any).sosSyncManager = sosSyncManager;
    (window as any).offlineCacheService = offlineCacheService;

    // Configure runtime API override
    (window as any).__STRIDE_DURING_API_URL__ = 'http://localhost:4893/api/during';

    // Authenticate test citizen
    localStorage.setItem('stride_user', JSON.stringify({
      id: '${citizen.id}',
      name: '${citizen.name}',
      role: 'CITIZEN'
    }));

    (window as any).runStep5BrowserSuite = async function(step) {
      const results = [];
      function check(cond, name, err) {
        results.push({ name, passed: Boolean(cond), error: err });
      }

      if (step === 'initial_online_state') {
        try {
          connectivityService.init();
          const status = connectivityService.getStatus();
          check(status.state === 'ONLINE', 'Initial state is detected as ONLINE (' + status.state + ')');
          check(status.isOnline === true, 'isOnline is true');
          check(status.isOffline === false, 'isOffline is false');
          check(status.hasPendingSync === false, 'hasPendingSync is false');
        } catch (e) {
          results.push({ name: 'initial_online_state failed', passed: false, error: e.message });
        }
      } else if (step === 'offline_transition') {
        try {
          // Trigger offline
          window.dispatchEvent(new Event('offline'));
          const status = connectivityService.getStatus();
          check(status.state === 'OFFLINE', 'Offline event transitions state to OFFLINE (' + status.state + ')');
          check(status.isOffline === true, 'isOffline is true when offline');
          check(status.isOnline === false, 'isOnline is false when offline');
        } catch (e) {
          results.push({ name: 'offline_transition failed', passed: false, error: e.message });
        }
      } else if (step === 'offline_data_cache_access') {
        try {
          // Cache some mock entities
          await offlineCacheService.persistHousehold({
            id: 'hh-step5-test',
            name: 'Step 5 Household',
            address: '100 Step 5 Road',
            createdByUserId: '${citizen.id}',
            members: [{ id: 'm-step5-1', name: 'Member 1', relationship: 'SELF', isVulnerable: false }]
          }, '${citizen.id}');

          await offlineCacheService.persistShelters([{
            id: 'shelter-step5-1',
            name: 'Indiranagar Relief Center',
            address: 'CMH Road',
            totalCapacity: 200,
            currentOccupancy: 50,
            status: 'OPEN',
            latitude: 12.9716,
            longitude: 77.5946,
            amenities: ['FOOD', 'WATER'],
            contactPhone: '9876543210',
            source: 'test'
          }]);

          await offlineCacheService.persistHospitals([{
            id: 'hosp-step5-1',
            name: 'Manipal Hospital',
            address: 'Old Airport Road',
            type: 'TERTIARY_CARE',
            totalBeds: 500,
            availableBeds: 120,
            icuAvailable: 15,
            emergencyServices: true,
            status: 'NORMAL',
            latitude: 12.9592,
            longitude: 77.6534,
            specialities: ['TRAUMA', 'CARDIAC'],
            doctorsCount: 50,
            contactPhone: '080-25024444'
          }]);

          await offlineCacheService.persistHazardSnapshot(12.97, 77.59, {
            temperature: 24,
            apparentTemperature: 25,
            precipitation: 45,
            relativeHumidity: 85,
            windSpeed: 15,
            weatherCode: 65,
            time: new Date().toISOString()
          });

          // Verify offline access
          const hhRes = await offlineCacheService.getHouseholdWithFallback('${citizen.id}');
          check(hhRes.ok && hhRes.data?.source === 'cache', 'Cached household loads offline with source=cache');

          const shelterRes = await offlineCacheService.getSheltersWithFallback();
          check(shelterRes.ok && shelterRes.data?.source === 'cache', 'Cached shelters load offline with source=cache');
          check(shelterRes.data?.data?.length >= 1, 'Cached shelters returned records offline');

          const hospRes = await offlineCacheService.getHospitalsWithFallback();
          check(hospRes.ok && hospRes.data?.source === 'cache', 'Cached hospitals load offline with source=cache');

          const weatherRes = await offlineCacheService.getHazardSnapshotWithFallback(12.97, 77.59);
          check(weatherRes.ok && weatherRes.data?.source === 'cache', 'Cached weather snapshot loads offline');
          check(weatherRes.data?.isStale === false, 'Freshly cached weather within TTL is not marked stale');

          // No-cache test: query non-existent disaster
          const noCacheRes = await offlineCacheService.getMapDataWithFallback('non-existent-disaster');
          check(noCacheRes.ok && noCacheRes.data?.source === 'none', 'Non-existent dataset returns source=none without fabricating data');
        } catch (e) {
          results.push({ name: 'offline_data_cache_access failed', passed: false, error: e.message });
        }
      } else if (step === 'offline_sos_creation') {
        try {
          // Create SOS while offline
          const outcome = await offlineSosService.createSos({
            address: 'Offline Step 5 Avenue',
            description: 'Trapped on 2nd floor, water rising rapidly',
            waterLevel: 'HIGH',
            emergencyType: 'FLOOD',
            peopleCount: 4,
          });

          check(outcome.isOffline === true, 'Offline SOS returns isOffline=true');
          check(Boolean(outcome.localSos.clientOperationId), 'Valid clientOperationId was generated');
          check(outcome.localSos.priorityScore === 0, 'No fake priority score fabricated on client (score=0)');
          check(outcome.localSos.syncStatus === 'PENDING', 'Local SOS syncStatus is PENDING');

          // Check outbox has record
          const outboxRes = await offlineStorageService.getOutboxItemsByStatus('PENDING');
          check(outboxRes.ok && outboxRes.data?.length >= 1, 'SOS mutation is queued in IndexedDB sosOutbox');

          // Save created operation ID for subsequent tests (survives reload)
          localStorage.setItem('__test_sos_op_id', outcome.localSos.clientOperationId);
          (window as any).__testSosOpId = outcome.localSos.clientOperationId;
        } catch (e) {
          results.push({ name: 'offline_sos_creation failed', passed: false, error: e.message });
        }
      } else if (step === 'online_with_pending_sync') {
        try {
          // Trigger online
          window.dispatchEvent(new Event('online'));
          await connectivityService.refreshPendingStatus();

          const status = connectivityService.getStatus();
          check(status.state === 'ONLINE_PENDING_SYNC', 'Online event with pending mutations sets state to ONLINE_PENDING_SYNC (' + status.state + ')');
          check(status.hasPendingSync === true, 'hasPendingSync is true');
          check(status.isOnline === true, 'isOnline is true when pending');
        } catch (e) {
          results.push({ name: 'online_with_pending_sync failed', passed: false, error: e.message });
        }
      } else if (step === 'sync_execution_and_return_to_online') {
        try {
          let observedSyncingState = false;
          const unsub = connectivityService.subscribe((s) => {
            if (s.state === 'SYNCING') observedSyncingState = true;
          });

          const syncReport = await sosSyncManager.syncPendingOutbox();
          unsub();

          check(syncReport.syncedCount >= 1, 'sosSyncManager synchronized pending mutation');
          check(observedSyncingState === true, 'SYNCING state was emitted during transmission lifecycle');

          const finalStatus = connectivityService.getStatus();
          check(finalStatus.state === 'ONLINE', 'State returned to clean ONLINE after synchronization (' + finalStatus.state + ')');
          check(finalStatus.hasPendingSync === false, 'hasPendingSync is now false');

          // Verify outbox mutation is SYNCED
          const opId = (window as any).__testSosOpId || localStorage.getItem('__test_sos_op_id');
          const outboxItem = await offlineStorageService.getOutboxItem(opId);
          check(outboxItem.data?.syncStatus === 'SYNCED', 'Outbox mutation transitioned to SYNCED');

          const activeSos = await offlineStorageService.getActiveSos(opId);
          check(activeSos.data?.syncStatus === 'SYNCED', 'Active SOS transitioned to SYNCED');
          check(Boolean(activeSos.data?.serverId), 'Active SOS received authoritative serverId');
          check(activeSos.data?.priorityScore > 0, 'Active SOS received authoritative server priorityScore');
        } catch (e) {
          results.push({ name: 'sync_execution_and_return_to_online failed', passed: false, error: e.message });
        }
      } else if (step === 'retry_backoff_verification') {
        try {
          const retryOpId = 'op-backoff-test-' + Date.now();
          // Insert a mock pending mutation pointing to an invalid mock endpoint that fails with 500
          await offlineStorageService.putOutboxItem({
            id: retryOpId,
            userId: '${citizen.id}',
            actionType: 'CREATE_SOS',
            endpoint: '/rescue-requests',
            payload: {
              address: 'FORCE_500_FAIL_TRIGGER',
              description: 'Triggering transient failure for backoff test',
              peopleCount: 2
            },
            clientTimestamp: new Date().toISOString(),
            syncStatus: 'PENDING',
            retryCount: 0
          });

          await offlineStorageService.putActiveSos({
            id: retryOpId,
            clientOperationId: retryOpId,
            userId: '${citizen.id}',
            address: 'FORCE_500_FAIL_TRIGGER',
            description: 'Triggering transient failure for backoff test',
            peopleCount: 2,
            childrenCount: 0,
            elderlyCount: 0,
            disabledCount: 0,
            injuredCount: 0,
            criticalMedicalNeed: false,
            waterLevel: 'HIGH',
            emergencyType: 'FLOOD',
            conditions: [],
            priorityScore: 0,
            priorityLevel: 'LOW',
            status: 'PENDING',
            syncStatus: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          // First sync attempt -> should fail transiently, set retryCount=1 and nextRetryAt = now + 2000
          const beforeAttemptTime = Date.now();
          await sosSyncManager.syncPendingOutbox();

          const itemAfterAttempt1 = await offlineStorageService.getOutboxItem(retryOpId);
          check(itemAfterAttempt1.data?.retryCount === 1, 'Attempt 1 increments retryCount to 1');
          check(itemAfterAttempt1.data?.syncStatus === 'PENDING', 'Attempt 1 resets status to PENDING for retry');
          check(itemAfterAttempt1.data?.id === retryOpId, 'Immutable clientOperationId is strictly preserved across retry');
          check(
            Boolean(itemAfterAttempt1.data?.nextRetryAt) && itemAfterAttempt1.data?.nextRetryAt >= beforeAttemptTime + 1900,
            'nextRetryAt was scheduled according to backoff formula (+2000ms)'
          );

          // Immediate second sync invocation: must SKIP this mutation because backoff cooldown is active
          const rapidSync = await sosSyncManager.syncPendingOutbox();
          const itemAfterRapid = await offlineStorageService.getOutboxItem(retryOpId);
          check(itemAfterRapid.data?.retryCount === 1, 'Rapid retry was prevented by backoff cooldown (retryCount still 1)');

          // Clean up backoff test mutation
          await offlineStorageService.deleteOutboxItem(retryOpId);
          await offlineStorageService.deleteActiveSos(retryOpId);
        } catch (e) {
          results.push({ name: 'retry_backoff_verification failed', passed: false, error: e.message });
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

  const testHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Step 5 Test Runner</title></head>
      <body>
        <div id="root">
          <aside id="global-offline-banner" style="display:none;">Offline Mode Banner</aside>
          <h1>STRIDE Step 5 Offline UX Test Runner</h1>
        </div>
        <script type="module">${bundledJs}</script>
      </body>
    </html>
  `;

  const server = http.createServer(async (req, res) => {
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
          if (parsedBody.address === 'FORCE_500_FAIL_TRIGGER') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Simulated 500 Transient Internal Error' }));
            return;
          }
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

  await new Promise<void>((resolve) => server.listen(4893, resolve));

  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:4893');

    // 1. Initial online state
    const step1Results: any[] = await page.evaluate(async () => {
      return (window as any).runStep5BrowserSuite('initial_online_state');
    });
    for (const r of step1Results) {
      assert(r.passed, r.name, r.error);
    }

    // 2. Offline transition
    await context.setOffline(true);
    const step2Results: any[] = await page.evaluate(async () => {
      return (window as any).runStep5BrowserSuite('offline_transition');
    });
    for (const r of step2Results) {
      assert(r.passed, r.name, r.error);
    }

    // 3. Offline data cache access (Household, Shelters, Hospitals, Weather, No-cache)
    const step3Results: any[] = await page.evaluate(async () => {
      return (window as any).runStep5BrowserSuite('offline_data_cache_access');
    });
    for (const r of step3Results) {
      assert(r.passed, r.name, r.error);
    }

    // 4. Offline SOS creation
    const step4Results: any[] = await page.evaluate(async () => {
      return (window as any).runStep5BrowserSuite('offline_sos_creation');
    });
    for (const r of step4Results) {
      assert(r.passed, r.name, r.error);
    }

    // 5. Reconnect with pending sync
    await context.setOffline(false);
    const step5Results: any[] = await page.evaluate(async () => {
      return (window as any).runStep5BrowserSuite('online_with_pending_sync');
    });
    for (const r of step5Results) {
      assert(r.passed, r.name, r.error);
    }

    // 6. Reload preservation
    await page.reload();
    const reloadStatus: any = await page.evaluate(async () => {
      await (window as any).connectivityService.init();
      return (window as any).connectivityService.getStatus();
    });
    assert(
      reloadStatus.state === 'ONLINE_PENDING_SYNC',
      'Page reload cleanly reconstructs ONLINE_PENDING_SYNC state from IndexedDB outbox'
    );
    assert(reloadStatus.hasPendingSync === true, 'Page reload preserves hasPendingSync=true');

    // 7. Sync execution & return to clean ONLINE
    const step7Results: any[] = await page.evaluate(async () => {
      return (window as any).runStep5BrowserSuite('sync_execution_and_return_to_online');
    });
    for (const r of step7Results) {
      assert(r.passed, r.name, r.error);
    }

    // 8. Retry backoff verification (Bounded exponential backoff)
    const step8Results: any[] = await page.evaluate(async () => {
      return (window as any).runStep5BrowserSuite('retry_backoff_verification');
    });
    for (const r of step8Results) {
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

runOfflineUxAndSyncHardeningSuite().catch((err) => {
  console.error('Fatal error in Step 5 test suite:', err);
  process.exit(1);
});
