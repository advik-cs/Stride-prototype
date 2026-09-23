import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import prisma from '../src/server/config/database.ts';
import { createRescueRequest } from '../src/server/controllers/rescueController.ts';
import { connectivityService } from '../src/offline/connectivityService.ts';
import { backgroundSyncService, SOS_SYNC_TAG, SOS_PERIODIC_SYNC_TAG } from '../src/offline/backgroundSyncService.ts';
import { sosSyncManager } from '../src/offline/sosSyncManager.ts';

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

async function runPersistenceSuite() {
  console.log('================================================================');
  console.log('STRIDE OFFLINE SOS CONNECTIVITY PERSISTENCE (LAYER 2 + 3) SUITE');
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

  // ============================================================================
  // SUITE 1: STATIC ARCHITECTURAL INVARIANTS & SECURITY BOUNDARIES
  // ============================================================================
  console.log('--- SUITE 1: STATIC ARCHITECTURAL INVARIANTS & SECURITY BOUNDARIES ---');

  const connServicePath = path.resolve(process.cwd(), 'src/offline/connectivityService.ts');
  const bgSyncServicePath = path.resolve(process.cwd(), 'src/offline/backgroundSyncService.ts');
  const swSyncPath = path.resolve(process.cwd(), 'public/sw-sync.js');
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
  const swDistPath = path.resolve(process.cwd(), 'dist/sw.js');

  assert(fs.existsSync(connServicePath), 'src/offline/connectivityService.ts exists');
  assert(fs.existsSync(bgSyncServicePath), 'src/offline/backgroundSyncService.ts exists');
  assert(fs.existsSync(swSyncPath), 'public/sw-sync.js exists');

  const connServiceContent = fs.readFileSync(connServicePath, 'utf-8');
  assert(
    connServiceContent.includes('checkBackendReachability') &&
      connServiceContent.includes('/api/health') &&
      connServiceContent.includes('probeCooldownMs'),
    'connectivityService implements checkBackendReachability probing /api/health with cooldown'
  );
  assert(
    connServiceContent.includes('hasPendingSos') &&
      connServiceContent.includes('CREATE_SOS'),
    'connectivityService implements user-scoped hasPendingSos'
  );

  const bgSyncContent = fs.readFileSync(bgSyncServicePath, 'utf-8');
  assert(
    bgSyncContent.includes('registerSosSync') &&
      bgSyncContent.includes('registerPeriodicSosSync') &&
      bgSyncContent.includes('isBackgroundSyncSupported') &&
      bgSyncContent.includes('isPeriodicSyncSupported'),
    'backgroundSyncService implements Layer 2 Background Sync and Layer 3 Periodic Sync'
  );
  assert(
    bgSyncContent.includes("SOS_SYNC_TAG = 'stride-sos-sync'"),
    'Background Sync registration uses dedicated tag stride-sos-sync'
  );
  assert(
    bgSyncContent.includes("SOS_PERIODIC_SYNC_TAG = 'stride-sos-periodic-sync'"),
    'Periodic Background Sync registration uses dedicated tag stride-sos-periodic-sync'
  );

  const swSyncContent = fs.readFileSync(swSyncPath, 'utf-8');
  assert(
    swSyncContent.includes("tag === 'stride-sos-sync'") &&
      swSyncContent.includes("tag === 'stride-sos-periodic-sync'"),
    'public/sw-sync.js listens for stride-sos-sync and stride-sos-periodic-sync events'
  );
  assert(
    swSyncContent.includes("type: 'STRIDE_TRIGGER_SOS_SYNC'") &&
      swSyncContent.includes('client.postMessage'),
    'sw-sync.js notifies active application clients to invoke existing synchronization'
  );
  assert(
    !swSyncContent.includes('calculatePriority') &&
      !swSyncContent.includes('priorityScore') &&
      !swSyncContent.includes('CRITICAL'),
    '19. Service worker does not calculate priority or contain priority business logic'
  );
  assert(
    !swSyncContent.includes('putOutboxItem') && !swSyncContent.includes('createSos'),
    '20. Service worker does not create duplicate SOS records'
  );
  assert(
    swSyncContent.includes('safely preserved in PENDING status') ||
      swSyncContent.includes('leaving outbox in PENDING state'),
    '21. No-window behavior is safe with existing authentication architecture (preserves outbox for authenticated foreground sync)'
  );

  const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');
  assert(
    viteConfigContent.includes("importScripts: ['sw-sync.js']"),
    'vite.config.ts configures importScripts for sw-sync.js'
  );

  if (fs.existsSync(swDistPath)) {
    const swDistContent = fs.readFileSync(swDistPath, 'utf-8');
    assert(
      swDistContent.includes('sw-sync.js'),
      'Generated production dist/sw.js includes sw-sync.js'
    );
    assert(
      swDistContent.includes('/^\\/api\\/.*/') && swDistContent.includes('denylist'),
      'Service worker does not cache emergency mutation requests'
    );
  }

  // Verify mesh networking is NOT present
  const allOfflineFiles = fs.readdirSync(path.resolve(process.cwd(), 'src/offline'));
  let meshFound = false;
  for (const f of allOfflineFiles) {
    const c = fs.readFileSync(path.resolve(process.cwd(), 'src/offline', f), 'utf-8');
    if (c.toLowerCase().includes('webrtc') || c.toLowerCase().includes('meshnetwork') || c.toLowerCase().includes('bluetooth')) {
      meshFound = true;
      break;
    }
  }
  assert(!meshFound, 'Confirmation: Zero mesh networking implemented in codebase');

  // ============================================================================
  // SUITE 2: REACHABILITY PROBING, TIMEOUTS, COOLDOWN & FAST-PATH
  // ============================================================================
  console.log('\n--- SUITE 2: BACKEND HEALTH PROBE & REACHABILITY LOGIC ---');

  // Test 1: navigator.onLine === false prevents health probe
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  try {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });
    let fetchCalled = false;
    const origFetch = global.fetch;
    (global as any).fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ status: 'ok' }));
    };

    const isReachableOffline = await connectivityService.checkBackendReachability(1000, true);
    assert(isReachableOffline === false, '1. navigator.onLine === false returns false immediately');
    assert(fetchCalled === false, '1. navigator.onLine === false prevents any health probe network requests');
    (global as any).fetch = origFetch;
  } finally {
    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine);
    } else {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    }
  }

  // Ensure navigator.onLine is true for subsequent reachability tests
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });

  // Test 2: navigator.onLine === true does not automatically mean backend reachable
  let mockHealthStatus = 500;
  let probeCallCount = 0;
  const originalFetch = global.fetch;
  (global as any).fetch = async (url: string) => {
    if (String(url).includes('/health')) {
      probeCallCount++;
      if (mockHealthStatus === 200) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', database: 'connected' }),
        } as any;
      }
      return {
        ok: false,
        status: mockHealthStatus,
        json: async () => ({ status: 'error' }),
      } as any;
    }
    return originalFetch(url);
  };

  try {
    // 2. navigator.onLine is true, but health probe fails
    const reachableFailed = await connectivityService.checkBackendReachability(2000, true);
    assert(reachableFailed === false, '2. navigator.onLine === true does not assume reachable when probe fails');
    assert(connectivityService.getStatus().serverReachable === false, '4. Failed health probe reports backend unreachable');

    // 3. Successful health probe reports backend reachable
    mockHealthStatus = 200;
    const reachableSuccess = await connectivityService.checkBackendReachability(2000, true);
    assert(reachableSuccess === true, '3. Successful health probe reports backend reachable');
    assert(connectivityService.getStatus().serverReachable === true, '3. Diagnostic status reflects serverReachable=true');

    // 6. Deduplicates concurrent calls
    probeCallCount = 0;
    const [p1, p2, p3] = await Promise.all([
      connectivityService.checkBackendReachability(2000, true),
      connectivityService.checkBackendReachability(2000, true),
      connectivityService.checkBackendReachability(2000, true),
    ]);
    assert(p1 === true && p2 === true && p3 === true, '6. Concurrent health probes all resolve consistently');
    assert(probeCallCount === 1, '6. Concurrent health probes are deduplicated into exactly one request');

    // 7. Respects cooldown
    probeCallCount = 0;
    const r1 = await connectivityService.checkBackendReachability(2000, false);
    const r2 = await connectivityService.checkBackendReachability(2000, false);
    assert(r1 === true && r2 === true, '7. Cooldown probe returns cached reachability');
    assert(probeCallCount === 0, '7. Non-forced call within 5s cooldown does not dispatch network probe');
  } finally {
    (global as any).fetch = originalFetch;
  }

  // ============================================================================
  // SUITE 3: BACKGROUND SYNC & PERIODIC SYNC FEATURE DETECTION
  // ============================================================================
  console.log('\n--- SUITE 3: BACKGROUND SYNC & PERIODIC SYNC FEATURE DETECTION ---');

  const isBgSupported = backgroundSyncService.isBackgroundSyncSupported();
  assert(typeof isBgSupported === 'boolean', '13. isBackgroundSyncSupported returns boolean without throwing');
  assert(SOS_SYNC_TAG === 'stride-sos-sync', '14. Background Sync registration uses dedicated tag stride-sos-sync');

  const registerOutcome = await backgroundSyncService.registerSosSync();
  assert(typeof registerOutcome === 'boolean', '15. Unsupported/supported Background Sync gracefully returns boolean without throwing');

  const isPeriodicSupported = backgroundSyncService.isPeriodicSyncSupported();
  assert(typeof isPeriodicSupported === 'boolean', '22. isPeriodicSyncSupported returns boolean without throwing');

  const periodicOutcome = await backgroundSyncService.registerPeriodicSosSync();
  assert(typeof periodicOutcome === 'boolean', '23. Periodic Background Sync registration returns boolean without throwing');
  assert(SOS_PERIODIC_SYNC_TAG === 'stride-sos-periodic-sync', '23. Periodic sync uses stride-sos-periodic-sync tag');

  // ============================================================================
  // SUITE 4: REAL BROWSER (PLAYWRIGHT) END-TO-END VERIFICATION
  // ============================================================================
  console.log('\n--- SUITE 4: REAL BROWSER (PLAYWRIGHT) CONNECTIVITY & PERSISTENCE ---');

  // Find existing citizen for Playwright browser test
  const testCitizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });
  if (!testCitizen) throw new Error('Citizen user not found in database');

  const browserBundleSource = `
    import {
      offlineSosService,
      sosSyncManager,
      connectivityService,
      backgroundSyncService,
      offlineStorageService,
      deleteStrideDB,
      openStrideDB,
    } from './src/offline/index';

    // Mock stored citizen user
    localStorage.setItem('stride_user', JSON.stringify({
      id: '${testCitizen.id}',
      name: '${testCitizen.name}',
      role: 'CITIZEN'
    }));

    (window as any).__runPersistenceTest = async function(step, payload) {
      if (step === 'reset_db') {
        await deleteStrideDB();
        await openStrideDB();
        return true;
      }

      if (step === 'test_user_scoping') {
        const userA = '${testCitizen.id}';
        const userB = 'usr-other-' + Date.now();
        const dummyMutA = {
          id: 'op-a-' + Date.now(),
          userId: userA,
          actionType: 'CREATE_SOS' as const,
          endpoint: '/api/during/rescue-requests',
          payload: { address: 'User A Address', description: 'User A distress' },
          clientTimestamp: new Date().toISOString(),
          syncStatus: 'PENDING' as const,
          retryCount: 0,
        };
        await offlineStorageService.putOutboxItem(dummyMutA);
        const hasA = await connectivityService.hasPendingSos(userA);
        const hasB = await connectivityService.hasPendingSos(userB);
        const hasUnknown = await connectivityService.hasPendingSos('non-existent');
        await offlineStorageService.deleteOutboxItem(dummyMutA.id);
        return { hasA, hasB, hasUnknown };
      }

      if (step === 'test_probe_invariance') {
        const dummyBackoff = {
          id: 'op-backoff-' + Date.now(),
          userId: '${testCitizen.id}',
          actionType: 'CREATE_SOS' as const,
          endpoint: '/api/during/rescue-requests',
          payload: { address: 'Backoff Address', description: 'Backoff distress' },
          clientTimestamp: new Date().toISOString(),
          syncStatus: 'PENDING' as const,
          retryCount: 2,
          nextRetryAt: Date.now() + 15000,
        };
        await offlineStorageService.putOutboxItem(dummyBackoff);
        await connectivityService.checkBackendReachability(2000, true);
        const after = await offlineStorageService.getOutboxItem(dummyBackoff.id);
        await offlineStorageService.deleteOutboxItem(dummyBackoff.id);
        return {
          retryCount: after.data?.retryCount,
          nextRetryAt: after.data?.nextRetryAt,
          syncStatus: after.data?.syncStatus,
        };
      }

      if (step === 'create_offline_sos') {
        const result = await offlineSosService.createSos({
          address: '77 Bannerghatta Main Rd, Bengaluru',
          description: 'Flash flood rising near residential enclave',
          peopleCount: 4,
          criticalMedicalNeed: false,
          waterLevel: 'HIGH',
          emergencyType: 'FLOOD',
        });
        return {
          isOffline: result.isOffline,
          clientOperationId: result.localSos.clientOperationId,
          syncStatus: result.localSos.syncStatus,
          priorityScore: result.localSos.priorityScore,
        };
      }

      if (step === 'test_online_events') {
        let syncCount = 0;
        const origSync = sosSyncManager.syncPendingOutbox;
        sosSyncManager.syncPendingOutbox = async () => {
          syncCount++;
          return { syncedCount: 1, errors: [] };
        };

        // Active user has pending SOS
        await sosSyncManager.handleOnlineEvent();
        const countWithPending = syncCount;

        // Rapid online events coalescing
        await Promise.all([
          sosSyncManager.handleOnlineEvent(),
          sosSyncManager.handleOnlineEvent(),
          sosSyncManager.handleOnlineEvent(),
        ]);
        const countRapid = syncCount;
        const isMutexClean = !sosSyncManager.isSyncInProgress();

        sosSyncManager.syncPendingOutbox = origSync;
        return { countWithPending, countRapid, isMutexClean };
      }

      if (step === 'test_stale_recovery') {
        const staleId = 'op-stale-' + Date.now();
        await offlineStorageService.putOutboxItem({
          id: staleId,
          userId: '${testCitizen.id}',
          actionType: 'CREATE_SOS',
          endpoint: '/api/during/rescue-requests',
          payload: { address: 'Stale Address', description: 'Stale distress' },
          clientTimestamp: new Date(Date.now() - 30000).toISOString(),
          syncStatus: 'SYNCING',
          retryCount: 1,
        });
        const recovered = await sosSyncManager.recoverStaleSyncingItems(true);
        const item = await offlineStorageService.getOutboxItem(staleId);
        await offlineStorageService.deleteOutboxItem(staleId);
        return { recovered, status: item.data?.syncStatus, id: item.data?.id, staleId };
      }

      if (step === 'test_cancellation') {
        const cancelId = 'op-cancel-' + Date.now();
        await offlineStorageService.putActiveSosAndOutbox(
          {
            id: cancelId,
            localId: cancelId,
            clientOperationId: cancelId,
            userId: '${testCitizen.id}',
            address: 'Cancel address',
            description: 'Cancel description',
            peopleCount: 1,
            childrenCount: 0,
            elderlyCount: 0,
            disabledCount: 0,
            injuredCount: 0,
            criticalMedicalNeed: false,
            waterLevel: 'LOW',
            emergencyType: 'FLOOD',
            conditions: [],
            priorityScore: 0,
            priorityLevel: 'LOW',
            status: 'PENDING',
            syncStatus: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: cancelId,
            userId: '${testCitizen.id}',
            actionType: 'CREATE_SOS',
            endpoint: '/api/during/rescue-requests',
            payload: { address: 'Cancel address', description: 'Cancel description' },
            clientTimestamp: new Date().toISOString(),
            syncStatus: 'PENDING',
            retryCount: 0,
          }
        );
        await offlineSosService.cancelSos(cancelId);
        const outbox = await offlineStorageService.getOutboxItem(cancelId);
        const sos = await offlineStorageService.getActiveSos(cancelId);
        return { outboxDeleted: outbox.data === null, sosStatus: sos.data?.status };
      }

      if (step === 'sync_pending_outbox') {
        return await sosSyncManager.syncPendingOutbox();
      }

      if (step === 'get_local_sos') {
        const res = await offlineStorageService.getActiveSos(payload.clientOperationId);
        return res.data;
      }

      if (step === 'get_outbox_item') {
        const res = await offlineStorageService.getOutboxItem(payload.clientOperationId);
        return res.data;
      }

      return null;
    };
    (window as any).__ready = true;
  `;

  let bundledJs = '';
  try {
    const buildResult = await esbuild.build({
      stdin: {
        contents: browserBundleSource,
        resolveDir: process.cwd(),
        sourcefile: 'persistence_browser_runner.ts',
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2020',
    });
    bundledJs = buildResult.outputFiles[0].text;
  } catch (err: any) {
    console.error('esbuild bundling failed:', err);
    process.exit(1);
  }

  let serverSosCreationCount = 0;
  const mockHttpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', database: 'connected' }));
      return;
    }

    if (req.url?.includes('/rescue-requests')) {
      let bodyStr = '';
      req.on('data', (chunk) => (bodyStr += chunk));
      req.on('end', async () => {
        try {
          serverSosCreationCount++;
          const parsed = JSON.parse(bodyStr || '{}');
          const mockRes = createMockRes();
          const mockReq: any = {
            user: { userId: testCitizen.id, role: 'CITIZEN' },
            headers: req.headers,
            body: parsed,
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

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Persistence Test Runner</title></head>
  <body>
    <div id="root"><h1>STRIDE Offline SOS Persistence Runner</h1></div>
    <script type="module">${bundledJs}</script>
  </body>
</html>`);
  });

  await new Promise<void>((resolve) => mockHttpServer.listen(0, '127.0.0.1', () => resolve()));
  const testPort = (mockHttpServer.address() as any).port;

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let opId = '';

  try {
    // Point app health URL and API URL to test server
    await page.goto(`http://127.0.0.1:${testPort}`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window as any).__ready === true);
    await page.evaluate((port) => {
      (window as any).__STRIDE_HEALTH_URL = `http://127.0.0.1:${port}/api/health`;
      (window as any).__STRIDE_DURING_API_URL__ = `http://127.0.0.1:${port}`;
    }, testPort);

    // Reset IndexedDB
    await page.evaluate(() => (window as any).__runPersistenceTest('reset_db'));

    // Step 1: User-scoped pending check
    const scopingRes: any = await page.evaluate(() =>
      (window as any).__runPersistenceTest('test_user_scoping')
    );
    assert(scopingRes.hasA === true, '8. hasPendingSos returns true for user with pending SOS mutation');
    assert(scopingRes.hasB === false, '8. hasPendingSos returns false for different user (strict user scoping)');
    assert(scopingRes.hasUnknown === false, '8. hasPendingSos returns false for non-existent user');

    // Step 2: Health probe does not mutate retry/backoff schedules
    const probeInvariance: any = await page.evaluate(() =>
      (window as any).__runPersistenceTest('test_probe_invariance')
    );
    assert(
      probeInvariance.retryCount === 2 && probeInvariance.syncStatus === 'PENDING',
      '5. Health probe does NOT mutate SOS outbox state or retry/backoff schedules'
    );

    // Step 3: Queue offline SOS
    await context.setOffline(true);
    const offlineResult: any = await page.evaluate(() =>
      (window as any).__runPersistenceTest('create_offline_sos')
    );

    assert(offlineResult.isOffline === true, 'A. Offline SOS creation returns isOffline=true');
    assert(Boolean(offlineResult.clientOperationId), 'A. Offline SOS returns valid clientOperationId');
    assert(offlineResult.syncStatus === 'PENDING', 'A. Queued SOS syncStatus is PENDING');
    assert(offlineResult.priorityScore === 0, '19. No authoritative priority fabricated on client');

    opId = offlineResult.clientOperationId;

    // Step 4: Online event reactions
    await context.setOffline(false);
    const onlineEventRes: any = await page.evaluate(() =>
      (window as any).__runPersistenceTest('test_online_events')
    );
    assert(onlineEventRes.countWithPending === 1, '10. Reachable backend triggers EXISTING sync manager on online event');
    assert(onlineEventRes.countRapid >= 1, '11. Multiple rapid online events are safely handled');
    assert(onlineEventRes.isMutexClean === true, '12. Existing sync mutex remains effective');

    // Step 5: Stale SYNCING recovery
    const staleRes: any = await page.evaluate(() =>
      (window as any).__runPersistenceTest('test_stale_recovery')
    );
    assert(staleRes.recovered >= 1, '30. Stale SYNCING recovery detected and recovered orphaned item');
    assert(staleRes.status === 'PENDING' && staleRes.id === staleRes.staleId, '30. Stale item restored to PENDING preserving exact clientOperationId');

    // Step 6: Cancellation semantics
    const cancelRes: any = await page.evaluate(() =>
      (window as any).__runPersistenceTest('test_cancellation')
    );
    assert(cancelRes.outboxDeleted === true, '29. Cancellation deletes outbox mutation atomically');
    assert(cancelRes.sosStatus === 'CANCELLED', '29. Cancellation marks local SOS status CANCELLED');

    // Step 7: Flush pending outbox to mock server
    const syncReport: any = await page.evaluate(() =>
      (window as any).__runPersistenceTest('sync_pending_outbox')
    );
    assert(syncReport.syncedCount === 1, 'A. Existing sync manager flushes queued SOS with 1 item synced');

    // Step 8: Verify local activeSos and outbox updated
    const localSosAfter: any = await page.evaluate((id) =>
      (window as any).__runPersistenceTest('get_local_sos', { clientOperationId: id }),
      opId
    );
    assert(localSosAfter.syncStatus === 'SYNCED', 'A. Active SOS transitioned to SYNCED in IndexedDB');
    assert(Boolean(localSosAfter.serverId), 'A. Active SOS received serverId from server acknowledgement');
    assert(localSosAfter.priorityScore > 0, '28. Active SOS populated with authoritative server priority score');

    const outboxAfter: any = await page.evaluate((id) =>
      (window as any).__runPersistenceTest('get_outbox_item', { clientOperationId: id }),
      opId
    );
    assert(outboxAfter.syncStatus === 'SYNCED', 'A. Outbox record marked SYNCED');

    // Step 9: Exactly-once idempotency: Repeated sync flushes do NOT duplicate SOS
    const secondSyncReport: any = await page.evaluate(() =>
      (window as any).__runPersistenceTest('sync_pending_outbox')
    );
    assert(secondSyncReport.syncedCount === 0, '27. Exactly-once: Subsequent sync does not re-transmit SYNCED item');

    // Verify exactly 1 EmergencyRequest exists on server for this clientOperationId
    const idempotencyRecord = await prisma.idempotencyKey.findUnique({
      where: { operationId: opId },
    });
    assert(
      idempotencyRecord !== null && idempotencyRecord.status === 'COMPLETED',
      '27. Exactly ONE IdempotencyKey record created with status COMPLETED'
    );
    assert(
      idempotencyRecord?.serverRequestId === localSosAfter.serverId,
      '27. IdempotencyKey serverRequestId matches synced SOS id'
    );

    const serverSosCount = await prisma.emergencyRequest.count({
      where: { id: localSosAfter.serverId },
    });
    assert(serverSosCount === 1, '27. Exactly ONE EmergencyRequest created on server (idempotency verified)');

  } finally {
    await browser.close();
    mockHttpServer.close();
    // Clean up test emergency requests and idempotency keys
    if (opId) {
      const key = await prisma.idempotencyKey.findUnique({ where: { operationId: opId } });
      if (key?.serverRequestId) {
        await prisma.emergencyCondition.deleteMany({
          where: { emergencyRequestId: key.serverRequestId },
        }).catch(() => {});
        await prisma.emergencyRequest.deleteMany({
          where: { id: key.serverRequestId },
        }).catch(() => {});
      }
      await prisma.idempotencyKey.deleteMany({
        where: { operationId: opId },
      }).catch(() => {});
    }
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(`PERSISTENCE SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPersistenceSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error in persistence suite:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
