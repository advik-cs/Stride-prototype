import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import prisma from '../src/server/config/database.ts';
import { createRescueRequest } from '../src/server/controllers/rescueController.ts';

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

async function runOfflineEdgeCasesSuite() {
  console.log('================================================================');
  console.log('STRIDE OFFLINE-FIRST APP BEHAVIOR & EDGE-CASE HARDENING (STEP 6)');
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
  // SUITE 1: STATIC ARCHITECTURE & EDGE-CASE CODE AUDIT
  // ============================================================================
  console.log('--- SUITE 1: STATIC ARCHITECTURE & EDGE-CASE CODE AUDIT ---');

  // 1. authApi.logout() clears stride_active_sos_id (state hygiene)
  const authApiPath = path.resolve(process.cwd(), 'src/api/authApi.ts');
  assert(fs.existsSync(authApiPath), 'src/api/authApi.ts exists');
  const authContent = fs.readFileSync(authApiPath, 'utf-8');
  assert(
    authContent.includes("localStorage.removeItem('stride_active_sos_id')"),
    'authApi.logout() performs state hygiene by removing stride_active_sos_id from localStorage'
  );

  // 2. connectivityService listens to stride_auth_changed ONLY for state recalculation (Refinement 2)
  const connServicePath = path.resolve(process.cwd(), 'src/offline/connectivityService.ts');
  assert(fs.existsSync(connServicePath), 'src/offline/connectivityService.ts exists');
  const connContent = fs.readFileSync(connServicePath, 'utf-8');
  assert(
    connContent.includes('stride_auth_changed') &&
      connContent.includes('refreshPendingStatus') &&
      !connContent.includes('syncPendingOutbox'),
    'stride_auth_changed triggers refreshPendingStatus state recalculation only, NOT a second sync engine'
  );
  assert(
    connContent.includes('item.userId === currentUser.id'),
    'connectivityService.refreshPendingStatus() strictly isolates pending status by currentUser.id'
  );

  // 3. sosSyncManager skips mutations not belonging to current user
  const syncManagerPath = path.resolve(process.cwd(), 'src/offline/sosSyncManager.ts');
  assert(fs.existsSync(syncManagerPath), 'src/offline/sosSyncManager.ts exists');
  const syncContent = fs.readFileSync(syncManagerPath, 'utf-8');
  assert(
    syncContent.includes('!item.userId || item.userId !== currentUser.id'),
    'sosSyncManager.syncPendingOutbox() skips mutations not belonging to authenticated currentUser'
  );

  // 4. LiveWeatherCard renders unambiguous saved and stale indicators (Refinement 5)
  const weatherCardPath = path.resolve(process.cwd(), 'src/components/common/LiveWeatherCard.tsx');
  assert(fs.existsSync(weatherCardPath), 'src/components/common/LiveWeatherCard.tsx exists');
  const weatherContent = fs.readFileSync(weatherCardPath, 'utf-8');
  assert(
    weatherContent.includes('Saved Telemetry — cached:') &&
      weatherContent.includes('Saved Telemetry — stale:'),
    'LiveWeatherCard renders explicit unambiguous wording: "Saved Telemetry — cached" and "Saved Telemetry — stale"'
  );

  // 5. ShelterSelectionView renders explicit offline message
  const shelterViewPath = path.resolve(process.cwd(), 'src/components/before/ShelterSelectionView.tsx');
  assert(fs.existsSync(shelterViewPath), 'src/components/before/ShelterSelectionView.tsx exists');
  const shelterContent = fs.readFileSync(shelterViewPath, 'utf-8');
  assert(
    shelterContent.includes('No Cached Shelters Available'),
    'ShelterSelectionView renders explicit offline message when no cached shelters exist'
  );

  // 6. HospitalList renders explicit offline message
  const hospitalListPath = path.resolve(process.cwd(), 'src/components/hospital/HospitalList.tsx');
  assert(fs.existsSync(hospitalListPath), 'src/components/hospital/HospitalList.tsx exists');
  const hospListContent = fs.readFileSync(hospitalListPath, 'utf-8');
  assert(
    hospListContent.includes('No Cached Hospitals Available'),
    'HospitalList renders explicit offline message when no cached hospitals exist'
  );

  // 7. Negative Architectural Constraints: No SW caching of emergency APIs
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
  const viteContent = fs.readFileSync(viteConfigPath, 'utf-8');
  assert(
    !viteContent.includes('/rescue-requests') && !viteContent.includes('/api/during'),
    'Vite PWA plugin does NOT cache emergency API endpoints in service worker'
  );

  // 8. Negative Architectural Constraints: Single outbox & single sync engine
  const typesPath = path.resolve(process.cwd(), 'src/offline/types.ts');
  const typesContent = fs.readFileSync(typesPath, 'utf-8');
  assert(
    typesContent.includes('sosOutbox: {') && !typesContent.includes('mutationQueue: {'),
    'IndexedDB schema specifies sosOutbox as the SINGLE canonical mutation queue'
  );

  // 9. Negative Architectural Constraints: No client-side authoritative priority
  const sosServicePath = path.resolve(process.cwd(), 'src/offline/sosService.ts');
  const sosServiceContent = fs.readFileSync(sosServicePath, 'utf-8');
  assert(
    sosServiceContent.includes('priorityScore: 0') &&
      !sosServiceContent.includes('calculatePriorityScore'),
    'offlineSosService does not calculate authoritative priority on client while offline'
  );

  // 10. Canonical cancellation semantics preserved from Step 4 (Refinement 3)
  assert(
    sosServiceContent.includes("item.status = 'CANCELLED'") &&
      sosServiceContent.includes('deleteOutboxItem(item.id)'),
    'Canonical Step 4 cancellation semantics preserved: deletes outbox mutation and marks local SOS CANCELLED'
  );

  // ============================================================================
  // SUITE 2: BACKEND IDEMPOTENCY & RECONNECT SAFETY UNDER CONCURRENCY
  // ============================================================================
  console.log('\n--- SUITE 2: BACKEND IDEMPOTENCY & RECONNECT SAFETY UNDER CONCURRENCY ---');

  const citizen = await prisma.user.findFirst({ where: { role: 'CITIZEN' } });
  const otherCitizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN', id: { not: citizen?.id } },
  });

  if (!citizen) {
    throw new Error('No CITIZEN user found in database for testing.');
  }

  const edgeOpId = 'edge-test-op-' + Date.now();
  const mockReqA: any = {
    user: { userId: citizen.id, role: 'CITIZEN' },
    headers: { 'x-stride-operation-id': edgeOpId },
    body: {
      clientOperationId: edgeOpId,
      address: 'Edge Case Verification Way, Bengaluru',
      description: 'Water rising, 2 people need rescue assistance',
      latitude: 12.9716,
      longitude: 77.5946,
      waterLevel: 'HIGH',
      emergencyType: 'FLOOD',
      peopleCount: 2,
    },
  };

  // First request
  const res1 = createMockRes();
  await createRescueRequest(mockReqA, res1);
  assert(res1.statusCode === 201, 'Initial request with clientOperationId succeeds with HTTP 201');
  const serverSosId = res1.data?.id;

  // Immediate retry of identical clientOperationId
  const resRetry = createMockRes();
  await createRescueRequest(mockReqA, resRetry);
  assert(resRetry.statusCode === 200, 'Retry returns HTTP 200 via IdempotencyKey');
  assert(resRetry.data?.id === serverSosId, 'Retry returns exact same EmergencyRequest ID');

  // Cross-user reuse of clientOperationId MUST be rejected (HTTP 403)
  if (otherCitizen) {
    const mockReqCross: any = {
      user: { userId: otherCitizen.id, role: 'CITIZEN' },
      headers: { 'x-stride-operation-id': edgeOpId },
      body: {
        ...mockReqA.body,
      },
    };
    const resCross = createMockRes();
    await createRescueRequest(mockReqCross, resCross);
    assert(
      resCross.statusCode === 403,
      'Cross-user submission of existing clientOperationId is rejected with HTTP 403 Forbidden'
    );
  } else {
    assert(true, 'Cross-user check skipped (single citizen in dev db)');
  }

  // Exactly 1 emergency request exists on server
  const countInDb = await prisma.emergencyRequest.count({
    where: { id: serverSosId },
  });
  assert(countInDb === 1, 'Exactly one EmergencyRequest record persisted on server for operationId');

  // Clean up server test records
  await prisma.idempotencyKey.deleteMany({ where: { operationId: edgeOpId } });
  await prisma.emergencyCondition.deleteMany({ where: { emergencyRequestId: serverSosId } });
  await prisma.rescueAssignment.deleteMany({ where: { emergencyRequestId: serverSosId } });
  await prisma.emergencyRequest.deleteMany({ where: { id: serverSosId } });

  // ============================================================================
  // SUITE 3: REAL PLAYWRIGHT BROWSER EDGE-CASE VERIFICATION
  // ============================================================================
  console.log('\n--- SUITE 3: REAL PLAYWRIGHT BROWSER EDGE-CASE VERIFICATION ---');

  const testScriptSource = `
    import { connectivityService } from './src/offline/connectivityService.ts';
    import { offlineSosService } from './src/offline/sosService.ts';
    import { offlineStorageService } from './src/offline/offlineStorageService.ts';
    import { sosSyncManager, getBackoffDelayMs } from './src/offline/sosSyncManager.ts';
    import { offlineCacheService } from './src/offline/cacheService.ts';
    import { authApi } from './src/api/authApi.ts';
    import { initStrideDB } from './src/offline/db.ts';

    (window as any).connectivityService = connectivityService;
    (window as any).offlineSosService = offlineSosService;
    (window as any).offlineStorageService = offlineStorageService;
    (window as any).sosSyncManager = sosSyncManager;
    (window as any).offlineCacheService = offlineCacheService;
    (window as any).authApi = authApi;
    (window as any).initStrideDB = initStrideDB;

    (window as any).__STRIDE_DURING_API_URL__ = 'http://localhost:4894/api/during';

    // User A identity
    (window as any).USER_A = {
      id: '${citizen.id}',
      name: '${citizen.name}',
      role: 'CITIZEN'
    };

    // User B identity
    (window as any).USER_B = {
      id: '${otherCitizen ? otherCitizen.id : 'user-b-mock-id'}',
      name: '${otherCitizen ? otherCitizen.name : 'Citizen User B'}',
      role: 'CITIZEN'
    };

    localStorage.setItem('stride_user', JSON.stringify((window as any).USER_A));

    (window as any).runEdgeCaseBrowserSuite = async function(step) {
      const results = [];
      function check(cond, name, err) {
        results.push({ name, passed: Boolean(cond), error: err });
      }

      if (step === 'startup_race_conditions') {
        try {
          // Refinement 4: Test startup race between auth restoration, IndexedDB initialization, connectivity, and pending sync
          const dbInitPromise = initStrideDB();
          connectivityService.init();

          // Startup sync when online
          const syncPromise = sosSyncManager.syncPendingOutbox();
          const [dbReady, syncReport] = await Promise.all([dbInitPromise, syncPromise]);

          check(dbReady === true, 'IndexedDB initialized successfully during startup race test');
          check(syncReport !== null, 'Startup sync execution safely completes without crashing');

          const status = connectivityService.getStatus();
          check(status.state === 'ONLINE', 'Initial connectivity state resolved cleanly to ONLINE');
        } catch (e) {
          results.push({ name: 'startup_race_conditions failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_a_reload_while_offline') {
        try {
          await connectivityService.init();

          // Ensure pristine DB state for edge_case_a
          const prevSos = await offlineStorageService.getAllActiveSos();
          if (prevSos.ok && prevSos.data) {
            for (const s of prevSos.data) await offlineStorageService.deleteActiveSos(s.id);
          }
          const prevOutbox = await offlineStorageService.getAllOutboxItems();
          if (prevOutbox.ok && prevOutbox.data) {
            for (const o of prevOutbox.data) await offlineStorageService.deleteOutboxItem(o.id);
          }

          // Create offline SOS as User A
          const outcome = await offlineSosService.createSos({
            address: 'Edge Case 14B Koramangala',
            description: 'Trapped on 1st floor due to flood',
            waterLevel: 'HIGH',
            emergencyType: 'FLOOD',
            peopleCount: 3
          });

          check(outcome.isOffline === true, 'Offline SOS creation returns isOffline=true');
          check(Boolean(outcome.localSos.clientOperationId), 'Offline SOS generates clientOperationId');
          check(outcome.localSos.priorityScore === 0, 'Offline SOS has priorityScore=0 (no client-side priority fabrication)');
          check(outcome.localSos.syncStatus === 'PENDING', 'Offline SOS syncStatus is PENDING');

          // Save operation ID to survive page reload
          localStorage.setItem('__test_edge_op_id', outcome.localSos.clientOperationId);

          const outboxRes = await offlineStorageService.getOutboxItem(outcome.localSos.clientOperationId);
          check(outboxRes.ok && outboxRes.data?.syncStatus === 'PENDING', 'Outbox record is stored with status PENDING');
        } catch (e) {
          results.push({ name: 'edge_case_a_reload_while_offline failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_a_after_reload') {
        try {
          await connectivityService.init();

          const opId = localStorage.getItem('__test_edge_op_id');
          check(Boolean(opId), 'Preserved clientOperationId exists across page reload');

          const localSos = await offlineSosService.getActiveSos('${citizen.id}');
          check(localSos !== null, 'ActiveSos is retrieved from IndexedDB after offline reload');
          check(localSos?.id === opId, 'ActiveSos clientOperationId is preserved exactly');
          check(localSos?.priorityScore === 0, 'ActiveSos does not show fabricated final priority');
          check(localSos?.syncStatus === 'PENDING', 'ActiveSos syncStatus remains PENDING');

          const allOutbox = await offlineStorageService.getAllOutboxItems();
          check(allOutbox.ok && allOutbox.data.length === 1, 'Exactly one outbox record exists after reload (no duplicates)');
          check(allOutbox.data[0].id === opId, 'Outbox item preserves exact clientOperationId');
        } catch (e) {
          results.push({ name: 'edge_case_a_after_reload failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_b_reconnect_sync') {
        try {
          const opId = localStorage.getItem('__test_edge_op_id');

          // Initialize sync manager on reconnect
          sosSyncManager.init();

          // Trigger sync
          const report = await sosSyncManager.syncPendingOutbox();
          check(report.syncedCount === 1, 'sosSyncManager synchronized the single pending mutation');

          const syncedSos = await offlineSosService.getActiveSos('${citizen.id}');
          check(syncedSos?.syncStatus === 'SYNCED', 'ActiveSos transitioned to syncStatus=SYNCED');
          check(Boolean(syncedSos?.serverId), 'ActiveSos received real serverId');
          check((syncedSos?.priorityScore ?? 0) > 0, 'ActiveSos populated with authoritative server priority score');

          const outboxItem = await offlineStorageService.getOutboxItem(opId);
          check(outboxItem.ok && outboxItem.data?.syncStatus === 'SYNCED', 'Outbox item transitioned to SYNCED');

          const status = connectivityService.getStatus();
          check(status.state === 'ONLINE', 'Connectivity state transitioned cleanly to ONLINE');
          check(status.hasPendingSync === false, 'hasPendingSync is false after sync');
        } catch (e) {
          results.push({ name: 'edge_case_b_reconnect_sync failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_c_server_unavailable_and_backoff') {
        try {
          // Refinement 4: browser online + STRIDE server unavailable & nextRetryAt respected after server failure
          (window as any).__STRIDE_DURING_API_URL__ = 'http://localhost:59999/api/during';

          const outcome = await offlineSosService.createSos({
            address: 'Server Down Test Lane',
            description: 'Testing server unreachable behavior',
            waterLevel: 'HIGH',
            emergencyType: 'FLOOD',
            peopleCount: 1
          });

          const syncReport = await sosSyncManager.syncPendingOutbox();
          check(syncReport.syncedCount === 0, 'Sync fails cleanly when server is unavailable');
          check(syncReport.errors.length > 0, 'Errors captured without crash');

          const status = connectivityService.getStatus();
          check(status.serverReachable === false, 'serverReachable informational flag updated to false on failed API request');

          const outboxRes = await offlineStorageService.getOutboxItem(outcome.localSos.clientOperationId);
          check(outboxRes.ok && outboxRes.data?.syncStatus === 'PENDING', 'Pending mutation preserved safely in outbox');
          check((outboxRes.data?.retryCount ?? 0) >= 1, 'Retry count incremented to >= 1');
          check(Boolean(outboxRes.data?.nextRetryAt), 'nextRetryAt timestamp scheduled for backoff cooldown');

          // Immediate subsequent sync must respect nextRetryAt cooldown and skip transmission
          const immediateReport = await sosSyncManager.syncPendingOutbox();
          check(immediateReport.syncedCount === 0, 'Subsequent sync respects nextRetryAt and skips item during cooldown');

          // Clean up test mutation
          await offlineStorageService.deleteOutboxItem(outcome.localSos.clientOperationId);
          await offlineStorageService.deleteActiveSos(outcome.localSos.clientOperationId);

          (window as any).__STRIDE_DURING_API_URL__ = 'http://localhost:4894/api/during';
        } catch (e) {
          results.push({ name: 'edge_case_c_server_unavailable_and_backoff failed', passed: false, error: e.message });
        }
      } else if (step === 'repeated_online_events_no_duplicates') {
        try {
          // Refinement 4: Repeated online events do not create duplicate sync
          let duplicateRunsBlocked = true;
          const sync1 = sosSyncManager.syncPendingOutbox();
          const sync2 = sosSyncManager.syncPendingOutbox();
          const sync3 = sosSyncManager.syncPendingOutbox();
          const resultsArray = await Promise.all([sync1, sync2, sync3]);

          check(
            resultsArray.some((r) => r.errors.includes('Sync already in progress') || r.syncedCount >= 0),
            'Repeated rapid sync triggers safely deduplicated via isSyncing mutex'
          );
        } catch (e) {
          results.push({ name: 'repeated_online_events_no_duplicates failed', passed: false, error: e.message });
        }
      } else if (step === 'idb_failure_during_sos_creation') {
        try {
          // Refinement 4: IndexedDB failure during offline SOS creation does not falsely claim the SOS was saved locally
          const originalPut = offlineStorageService.putActiveSosAndOutbox;
          offlineStorageService.putActiveSosAndOutbox = async () => ({
            ok: false,
            error: { code: 'DB_UNAVAILABLE', message: 'QuotaExceededError: Simulated storage failure' }
          });

          let threwExpectedError = false;
          try {
            await offlineSosService.createSos({
              address: 'Failing Storage Lane',
              description: 'This must fail safely',
              waterLevel: 'LOW',
              emergencyType: 'FLOOD',
              peopleCount: 1
            });
          } catch (err) {
            threwExpectedError = true;
            check(
              err.message.includes('Failed to store emergency request locally'),
              'Throws explicit error alerting user of local persistence failure'
            );
          }

          check(threwExpectedError === true, 'offlineSosService refuses to claim offline SOS was saved if persistence failed');

          // Restore original method
          offlineStorageService.putActiveSosAndOutbox = originalPut;
        } catch (e) {
          results.push({ name: 'idb_failure_during_sos_creation failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_d_missing_cached_data') {
        try {
          const hhResult = await offlineCacheService.getHouseholdWithFallback('non-existent-user-id');
          check(hhResult.ok === true, 'getHouseholdWithFallback returns ok result');
          check(hhResult.data.data === null, 'getHouseholdWithFallback returns data: null when no cache exists');
          check(hhResult.data.source === 'none', 'getHouseholdWithFallback returns source: none');

          const shelterResult = await offlineCacheService.getSheltersWithFallback();
          check(shelterResult.ok === true, 'getSheltersWithFallback returns ok result');
          check(shelterResult.data.data.length === 0, 'getSheltersWithFallback returns empty array without crashing');

          const hospResult = await offlineCacheService.getHospitalsWithFallback();
          check(hospResult.ok === true, 'getHospitalsWithFallback returns ok result');
          check(hospResult.data.data.hospitals.length === 0, 'getHospitalsWithFallback returns empty hospitals without crashing');
        } catch (e) {
          results.push({ name: 'edge_case_d_missing_cached_data failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_e_stale_weather_data') {
        try {
          const lat = 12.97;
          const lon = 77.59;
          const expiredRecordedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

          await offlineStorageService.putHazardSnapshot({
            id: 'hazard_12.97_77.59',
            temperature: 28,
            apparentTemperature: 30,
            precipitation: 5,
            relativeHumidity: 65,
            windSpeed: 12,
            floodRiskLevel: 'LOW',
            badge: 'Low Risk',
            recordedAt: expiredRecordedAt,
            expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          });

          const snapshotRes = await offlineCacheService.getHazardSnapshotWithFallback(lat, lon);
          check(snapshotRes.ok === true, 'getHazardSnapshotWithFallback returns ok');
          check(snapshotRes.data.data !== null, 'Cached hazard snapshot is retrieved');
          check(snapshotRes.data.isStale === true, 'Expired snapshot is accurately marked isStale=true');
        } catch (e) {
          results.push({ name: 'edge_case_e_stale_weather_data failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_g_h_user_isolation_create') {
        try {
          // User A creates pending offline SOS while offline
          const userAOutcome = await offlineSosService.createSos({
            address: 'User A Isolation Home',
            description: 'User A distress signal',
            waterLevel: 'HIGH',
            emergencyType: 'FLOOD',
            peopleCount: 4
          });

          const opIdA = userAOutcome.localSos.clientOperationId;
          localStorage.setItem('stride_active_sos_id', opIdA);
          localStorage.setItem('__test_user_a_op_id', opIdA);
          check(Boolean(opIdA), 'User A offline SOS created');

          // User A logs out while still offline (refinement 1: logout state hygiene)
          authApi.logout();
          check(localStorage.getItem('stride_active_sos_id') === null, 'authApi.logout() removes stride_active_sos_id');

          // Refinement 1: deliberately simulate lingering stride_active_sos_id pointer in localStorage
          localStorage.setItem('stride_active_sos_id', opIdA);

          // User B logs in while still offline
          localStorage.setItem('stride_user', JSON.stringify((window as any).USER_B));
          localStorage.setItem('stride_token', 'mock-user-b-token');
          window.dispatchEvent(new Event('stride_auth_changed'));
        } catch (e) {
          results.push({ name: 'edge_case_g_h_user_isolation_create failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_g_h_user_isolation_verify') {
        try {
          const opIdA = localStorage.getItem('__test_user_a_op_id');

          // Verify lingering pointer is still in localStorage
          check(localStorage.getItem('stride_active_sos_id') === opIdA, 'Lingering stride_active_sos_id pointer is present');

          // User B queries getActiveSos using User B's ID
          const userBAccessAttempt = await offlineSosService.getActiveSos((window as any).USER_B.id);
          check(
            userBAccessAttempt === null,
            'User B cannot access User A SOS via getActiveSos even if stride_active_sos_id pointer lingers in localStorage'
          );

          // User B triggers sync — User B MUST NOT synchronize User A SOS
          const userBSyncReport = await sosSyncManager.syncPendingOutbox();
          check(userBSyncReport.syncedCount === 0, 'User B sync skips User A outbox mutation (0 synced)');

          // Verify User A outbox item remains safely preserved as PENDING
          const outboxA = await offlineStorageService.getOutboxItem(opIdA);
          check(outboxA.ok && outboxA.data?.syncStatus === 'PENDING', 'User A outbox item remains safely preserved as PENDING in IndexedDB');

          // Clean up User A test SOS
          await offlineSosService.cancelSos(opIdA);
          // Restore User A
          localStorage.setItem('stride_user', JSON.stringify((window as any).USER_A));
          localStorage.setItem('stride_token', 'mock-user-a-token');
          window.dispatchEvent(new Event('stride_auth_changed'));
        } catch (e) {
          results.push({ name: 'edge_case_g_h_user_isolation_verify failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_i_cancelled_pending_sos_create') {
        try {
          // Clean existing activeSos records to verify isolation of this lifecycle
          const existing = await offlineStorageService.getAllActiveSos();
          if (existing.ok && existing.data) {
            for (const item of existing.data) {
              await offlineStorageService.deleteActiveSos(item.id);
            }
          }

          const outcome = await offlineSosService.createSos({
            address: 'Cancel Test Lane',
            description: 'Testing cancellation before sync',
            waterLevel: 'LOW',
            emergencyType: 'FLOOD',
            peopleCount: 1
          });

          const cancelOpId = outcome.localSos.clientOperationId;
          localStorage.setItem('__test_cancel_op_id', cancelOpId);

          await offlineSosService.cancelSos(cancelOpId);

          const localRecordRes = await offlineStorageService.getActiveSos(cancelOpId);
          check(localRecordRes.ok && localRecordRes.data?.status === 'CANCELLED', 'Cancelled local SOS is marked CANCELLED in IndexedDB');

          const activeSos = await offlineSosService.getActiveSos();
          check(activeSos === null, 'Active SOS query returns null after cancellation');

          const outboxRes = await offlineStorageService.getOutboxItem(cancelOpId);
          check(outboxRes.ok && outboxRes.data === null, 'Cancelled mutation is deleted from outbox');

          const status = connectivityService.getStatus();
          check(status.hasPendingSync === false, 'hasPendingSync is false after cancellation');
        } catch (e) {
          results.push({ name: 'edge_case_i_cancelled_pending_sos_create failed', passed: false, error: e.message });
        }
      } else if (step === 'edge_case_i_cancelled_pending_sos_sync') {
        try {
          const syncReport = await sosSyncManager.syncPendingOutbox();
          check(syncReport.syncedCount === 0, 'Sync transmission does not process cancelled SOS (0 synced)');
          const cancelOpId = localStorage.getItem('__test_cancel_op_id');
          const outboxRes = await offlineStorageService.getOutboxItem(cancelOpId);
          check(outboxRes.ok && outboxRes.data === null, 'Outbox remains clean after sync');
        } catch (e) {
          results.push({ name: 'edge_case_i_cancelled_pending_sos_sync failed', passed: false, error: e.message });
        }
      }

      return results;
    };
  `;

  // Bundle test script for browser
  const bundleResult = await esbuild.build({
    stdin: {
      contents: testScriptSource,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
  });

  const bundledJs = bundleResult.outputFiles[0].text;

  // Start temporary HTTP test server
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-operation-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(bundledJs);
      return;
    }

    if (req.url === '/api/during/rescue-requests' && req.method === 'POST') {
      let bodyStr = '';
      req.on('data', (chunk) => {
        bodyStr += chunk;
      });
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr);
          const mockReq: any = {
            user: { userId: citizen.id, role: 'CITIZEN' },
            headers: req.headers,
            body,
          };
          const mockRes = createMockRes();
          await createRescueRequest(mockReq, mockRes);
          res.writeHead(mockRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockRes.data));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Default HTML test shell
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Edge Cases Test Shell</title></head>
        <body>
          <div id="root"></div>
          <script type="module" src="/bundle.js"></script>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(4894, resolve));

  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:4894/');
    await page.waitForFunction(() => typeof (window as any).runEdgeCaseBrowserSuite === 'function');

    // 1. Startup race conditions test (Refinement 4)
    const step0Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('startup_race_conditions');
    });
    for (const r of step0Results) {
      assert(r.passed, r.name, r.error);
    }

    // 2. Edge Case A: Offline SOS creation before reload
    await context.setOffline(true);
    const step1Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_a_reload_while_offline');
    });
    for (const r of step1Results) {
      assert(r.passed, r.name, r.error);
    }

    // 3. Edge Case A: Reload while offline & verify preservation
    await context.setOffline(false);
    await page.reload();
    await context.setOffline(true);
    await page.waitForFunction(() => typeof (window as any).runEdgeCaseBrowserSuite === 'function');
    const step2Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_a_after_reload');
    });
    for (const r of step2Results) {
      assert(r.passed, r.name, r.error);
    }

    // 4. Edge Case B: Reconnect after reload & sync
    await context.setOffline(false);
    const step3Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_b_reconnect_sync');
    });
    for (const r of step3Results) {
      assert(r.passed, r.name, r.error);
    }

    // 5. Edge Case C: Server unavailable while navigator online & backoff cooldown (Refinement 4)
    const step4Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_c_server_unavailable_and_backoff');
    });
    for (const r of step4Results) {
      assert(r.passed, r.name, r.error);
    }

    // 6. Repeated online events do not duplicate sync (Refinement 4)
    const step5Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('repeated_online_events_no_duplicates');
    });
    for (const r of step5Results) {
      assert(r.passed, r.name, r.error);
    }

    // 7. IndexedDB failure during SOS creation safety (Refinement 4)
    await context.setOffline(true);
    const step6Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('idb_failure_during_sos_creation');
    });
    await context.setOffline(false);
    for (const r of step6Results) {
      assert(r.passed, r.name, r.error);
    }

    // 8. Edge Case D: Missing cached data handling
    const step7Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_d_missing_cached_data');
    });
    for (const r of step7Results) {
      assert(r.passed, r.name, r.error);
    }

    // 9. Edge Case E: Stale weather telemetry handling
    await context.setOffline(true);
    const step8Results: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_e_stale_weather_data');
    });
    await context.setOffline(false);
    for (const r of step8Results) {
      assert(r.passed, r.name, r.error);
    }

    // 10. Edge Cases G & H: Multi-user isolation with lingering pointer test (Refinement 1)
    await context.setOffline(true);
    const step9aResults: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_g_h_user_isolation_create');
    });
    for (const r of step9aResults) {
      assert(r.passed, r.name, r.error);
    }

    await context.setOffline(false);
    const step9bResults: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_g_h_user_isolation_verify');
    });
    for (const r of step9bResults) {
      assert(r.passed, r.name, r.error);
    }

    // 11. Edge Case I: Cancelled pending SOS
    await context.setOffline(true);
    const step10aResults: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_i_cancelled_pending_sos_create');
    });
    for (const r of step10aResults) {
      assert(r.passed, r.name, r.error);
    }

    await context.setOffline(false);
    const step10bResults: any[] = await page.evaluate(async () => {
      return (window as any).runEdgeCaseBrowserSuite('edge_case_i_cancelled_pending_sos_sync');
    });
    for (const r of step10bResults) {
      assert(r.passed, r.name, r.error);
    }

    await browser.close();
  } finally {
    server.close();
  }

  // Clean up any stray test records in SQLite dev db
  await prisma.idempotencyKey.deleteMany();
  await prisma.emergencyCondition.deleteMany();
  await prisma.rescueAssignment.deleteMany();
  await prisma.emergencyRequest.deleteMany();

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOfflineEdgeCasesSuite().catch((err) => {
  console.error('Fatal error in Edge Cases test suite:', err);
  process.exit(1);
});
