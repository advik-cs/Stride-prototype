import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runOfflineStorageSuite() {
  console.log('================================================================');
  console.log('STRIDE INDEXEDDB FOUNDATION & TYPED OFFLINE STORAGE SUITE');
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

  // --- SUITE 1: STATIC ARCHITECTURE & CODEBASE INSPECTION ---
  console.log('--- SUITE 1: STATIC ARCHITECTURE AUDIT ---');

  const typesPath = path.resolve(process.cwd(), 'src/offline/types.ts');
  const dbPath = path.resolve(process.cwd(), 'src/offline/db.ts');
  const servicePath = path.resolve(process.cwd(), 'src/offline/offlineStorageService.ts');
  const mainPath = path.resolve(process.cwd(), 'src/main.tsx');

  assert(fs.existsSync(typesPath), 'src/offline/types.ts exists');
  assert(fs.existsSync(dbPath), 'src/offline/db.ts exists');
  assert(fs.existsSync(servicePath), 'src/offline/offlineStorageService.ts exists');

  const typesContent = fs.readFileSync(typesPath, 'utf-8');
  assert(typesContent.includes('export interface StrideDBSchema'), 'types.ts defines StrideDBSchema');
  assert(typesContent.includes('export interface AppMetadataRecord'), 'types.ts defines AppMetadataRecord');
  assert(typesContent.includes('export interface UserSessionRecord'), 'types.ts defines UserSessionRecord');
  assert(typesContent.includes('export interface HouseholdRecord'), 'types.ts defines HouseholdRecord');
  assert(typesContent.includes('export interface HouseholdMemberRecord'), 'types.ts defines HouseholdMemberRecord');
  assert(typesContent.includes('export interface ShelterRecord'), 'types.ts defines ShelterRecord');
  assert(typesContent.includes('export interface HospitalRecord'), 'types.ts defines HospitalRecord');
  assert(typesContent.includes('export interface MapDataRecord'), 'types.ts defines MapDataRecord');
  assert(typesContent.includes('export interface HazardSnapshotRecord'), 'types.ts defines HazardSnapshotRecord');
  assert(typesContent.includes('export interface ActiveSosRecord'), 'types.ts defines ActiveSosRecord');
  assert(typesContent.includes('export interface SosOutboxRecord'), 'types.ts defines SosOutboxRecord');
  assert(typesContent.includes('export interface SyncMetadataRecord'), 'types.ts defines SyncMetadataRecord');
  assert(typesContent.includes('export type StorageResult'), 'types.ts defines StorageResult union');
  assert(typesContent.includes('export class StorageError'), 'types.ts defines StorageError class');

  const dbContent = fs.readFileSync(dbPath, 'utf-8');
  assert(dbContent.includes("STRIDE_DB_NAME = 'stride-offline'"), 'db.ts configures STRIDE_DB_NAME as stride-offline');
  assert(dbContent.includes('STRIDE_DB_VERSION = 1'), 'db.ts configures initial schema version 1');
  assert(dbContent.includes('isIndexedDBSupported'), 'db.ts exports environment check isIndexedDBSupported');
  assert(dbContent.includes('upgradeStrideDB'), 'db.ts implements non-destructive upgrade handler');

  const mainContent = fs.readFileSync(mainPath, 'utf-8');
  assert(mainContent.includes('initStrideDB'), 'src/main.tsx includes non-blocking initStrideDB startup call');

  // --- SUITE 2: BROWSER INDEXEDDB LIVE ENGINE VERIFICATION ---
  console.log('\n--- SUITE 2: BROWSER INDEXEDDB LIVE ENGINE TESTS (REAL CHROMIUM/EDGE) ---');

  // Bundle test script with esbuild
  const testScriptSource = `
    import {
      STRIDE_DB_NAME,
      STRIDE_DB_VERSION,
      openStrideDB,
      closeStrideDB,
      deleteStrideDB,
      isIndexedDBSupported,
      offlineStorageService,
      StorageError,
    } from './src/offline/index';

    async function runInBrowser() {
      const results = [];
      function check(condition, name, err) {
        results.push({ name, passed: Boolean(condition), error: err || '' });
      }

      try {
        // Reset DB before testing
        await deleteStrideDB();

        // 1. Environment check
        check(isIndexedDBSupported(), 'IndexedDB is supported in browser environment');

        // 2. Open DB
        const db = await openStrideDB();
        check(db !== null, 'Database opens successfully');
        check(db.name === 'stride-offline', 'Database name is strictly stride-offline');
        check(db.version === 1, 'Database version is strictly 1');

        // 3. All 11 stores exist
        const expectedStores = [
          'appMetadata',
          'userSession',
          'household',
          'householdMembers',
          'shelters',
          'hospitals',
          'mapData',
          'hazardSnapshots',
          'activeSos',
          'sosOutbox',
          'syncMetadata'
        ];
        const storeNames = Array.from(db.objectStoreNames);
        const allStoresExist = expectedStores.every(s => storeNames.includes(s));
        check(allStoresExist && storeNames.length === 11, 'All 11 stores exist in database');

        // 4. Required indexes exist
        const tx = db.transaction(expectedStores, 'readonly');
        const householdIndexes = Array.from(tx.objectStore('household').indexNames);
        check(householdIndexes.includes('by-userId'), 'household store has by-userId index');

        const memberIndexes = Array.from(tx.objectStore('householdMembers').indexNames);
        check(memberIndexes.includes('by-householdId'), 'householdMembers store has by-householdId index');

        const shelterIndexes = Array.from(tx.objectStore('shelters').indexNames);
        check(shelterIndexes.includes('by-status'), 'shelters store has by-status index');

        const hospitalIndexes = Array.from(tx.objectStore('hospitals').indexNames);
        check(hospitalIndexes.includes('by-name'), 'hospitals store has by-name index');

        const mapIndexes = Array.from(tx.objectStore('mapData').indexNames);
        check(mapIndexes.includes('by-disasterId'), 'mapData store has by-disasterId index');

        const sosIndexes = Array.from(tx.objectStore('activeSos').indexNames);
        check(sosIndexes.includes('by-syncStatus') && sosIndexes.includes('by-updatedAt'), 'activeSos store has by-syncStatus and by-updatedAt indexes');

        const outboxIndexes = Array.from(tx.objectStore('sosOutbox').indexNames);
        check(outboxIndexes.includes('by-syncStatus') && outboxIndexes.includes('by-clientTimestamp'), 'sosOutbox store has by-syncStatus and by-clientTimestamp indexes');

        // 5. Store 1 CRUD: appMetadata
        const metaPut = await offlineStorageService.putAppMetadata({
          key: 'device_install_id',
          value: 'device-xyz-123',
          updatedAt: '2026-09-22T10:00:00Z'
        });
        check(metaPut.ok && metaPut.data === 'device_install_id', 'appMetadata put works');
        const metaGet = await offlineStorageService.getAppMetadata('device_install_id');
        check(metaGet.ok && metaGet.data && metaGet.data.value === 'device-xyz-123', 'appMetadata get works');

        // 6. Store 2 CRUD: userSession
        const sessionPut = await offlineStorageService.putUserSession({
          userId: 'usr-1',
          name: 'Ramesh Iyer',
          role: 'CITIZEN',
          mobileNumber: '9800000011',
          householdId: 'hh-1',
          lastAuthenticated: '2026-09-22T10:00:00Z'
        });
        check(sessionPut.ok && sessionPut.data === 'usr-1', 'userSession put works');
        const sessionGet = await offlineStorageService.getUserSession('usr-1');
        check(sessionGet.ok && sessionGet.data && sessionGet.data.name === 'Ramesh Iyer', 'userSession get works');

        // 7. Store 3 CRUD: household & index query
        const hhPut = await offlineStorageService.putHousehold({
          id: 'hh-1',
          userId: 'usr-1',
          name: 'Building A, Apt 401',
          address: 'Indiranagar 100ft Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          latitude: 12.9716,
          longitude: 77.5946,
          onboardingCompleted: true,
          lastSyncedAt: '2026-09-22T10:00:00Z'
        });
        check(hhPut.ok && hhPut.data === 'hh-1', 'household put works');
        const hhByUserId = await offlineStorageService.getHouseholdByUserId('usr-1');
        check(hhByUserId.ok && hhByUserId.data && hhByUserId.data.id === 'hh-1', 'household queried by userId index');

        // 8. Store 4 CRUD: householdMembers & index query
        await offlineStorageService.putHouseholdMembers([
          { id: 'mem-1', householdId: 'hh-1', name: 'Ramesh Iyer', age: 42, relationship: 'Self', category: 'ADULT', syncStatus: 'SYNCED' },
          { id: 'mem-2', householdId: 'hh-1', name: 'Priya Iyer', age: 39, relationship: 'Spouse', category: 'ADULT', syncStatus: 'SYNCED' },
          { id: 'mem-3', householdId: 'hh-1', name: 'Aarav Iyer', age: 10, relationship: 'Child', category: 'CHILD', syncStatus: 'SYNCED' }
        ]);
        const membersGet = await offlineStorageService.getHouseholdMembers('hh-1');
        check(membersGet.ok && membersGet.data.length === 3, 'householdMembers multiple records share same householdId');

        // 9. Store 5 CRUD: shelters & index query
        await offlineStorageService.putShelters([
          { id: 'sh-1', name: 'Koramangala Indoor Stadium', address: '80ft Road', latitude: 12.9352, longitude: 77.6245, capacity: 500, contactNumber: '+91 80 2553 0001', status: 'ACTIVE' },
          { id: 'sh-2', name: 'Indiranagar Community Hall', address: 'CMH Road', latitude: 12.9784, longitude: 77.6408, capacity: 250, contactNumber: '+91 80 2525 0002', status: 'FULL' }
        ]);
        const activeShelters = await offlineStorageService.getSheltersByStatus('ACTIVE');
        check(activeShelters.ok && activeShelters.data.length === 1 && activeShelters.data[0].id === 'sh-1', 'shelters queried by status index');

        // 10. Store 6 CRUD: hospitals & index query
        await offlineStorageService.putHospital({
          id: 'hosp-1',
          name: 'Manipal Hospital HAL Airport Road',
          address: '98 HAL Airport Rd',
          latitude: 12.9592,
          longitude: 77.6537,
          contactNumber: '080-2502-4444',
          totalBeds: 600,
          availableBeds: 42,
          icuBedsAvailable: 8,
          specialities: ['Trauma', 'Emergency Medicine'],
          doctors: [{ name: 'Dr. Suresh Rao', speciality: 'Trauma', onDuty: true }],
          disclaimer: '⚠️ DEMO DATA'
        });
        const hospByName = await offlineStorageService.getHospitalByName('Manipal Hospital HAL Airport Road');
        check(hospByName.ok && hospByName.data && hospByName.data.id === 'hosp-1', 'hospitals queried by name index');

        // 11. Store 7 CRUD: mapData & index query
        await offlineStorageService.putMapData({
          id: 'map-zone-1',
          disasterId: 'dis-bangalore-2026',
          name: 'Bellandur Inundation Zone',
          riskLevel: 'HIGH',
          polygonGeoJson: '[[12.93, 77.67], [12.94, 77.68]]',
          radiusKm: 4.5
        });
        const mapByDisaster = await offlineStorageService.getMapDataByDisasterId('dis-bangalore-2026');
        check(mapByDisaster.ok && mapByDisaster.data.length === 1, 'mapData queried by disasterId index');

        // 12. Store 8 CRUD: hazardSnapshots
        await offlineStorageService.putHazardSnapshot({
          id: 'snap-live-1',
          temperature: 24.2,
          apparentTemperature: 26.1,
          precipitation: 18.5,
          relativeHumidity: 92,
          windSpeed: 28,
          floodRiskLevel: 'HIGH',
          badge: 'High Inundation Risk — Heavy Rainfall Active',
          recordedAt: '2026-09-22T10:30:00Z',
          expiresAt: '2026-09-22T11:00:00Z'
        });
        const snapGet = await offlineStorageService.getHazardSnapshot('snap-live-1');
        check(snapGet.ok && snapGet.data && snapGet.data.floodRiskLevel === 'HIGH', 'hazardSnapshots CRUD works');

        // 13. Store 9 CRUD: activeSos & index query
        await offlineStorageService.putActiveSos({
          id: 'sos-loc-001',
          localId: 'sos-loc-001',
          userId: 'usr-1',
          peopleCount: 4,
          childrenCount: 1,
          elderlyCount: 0,
          disabledCount: 0,
          injuredCount: 2,
          criticalMedicalNeed: false,
          waterLevel: 'HIGH',
          emergencyType: 'FLOOD',
          conditions: ['TRAPPED', 'WATER_RISING'],
          priorityScore: 78,
          priorityLevel: 'HIGH',
          description: 'Water rising up to first floor, 4 people trapped upstairs',
          address: 'Indiranagar 100ft Rd',
          latitude: 12.9716,
          longitude: 77.5946,
          status: 'PENDING',
          syncStatus: 'PENDING',
          createdAt: '2026-09-22T10:35:00Z',
          updatedAt: '2026-09-22T10:35:00Z'
        });
        const pendingSos = await offlineStorageService.getActiveSosBySyncStatus('PENDING');
        check(pendingSos.ok && pendingSos.data.length === 1 && pendingSos.data[0].id === 'sos-loc-001', 'activeSos queried by syncStatus index');

        // 14. Store 10 CRUD: sosOutbox & index query
        await offlineStorageService.putOutboxItem({
          id: 'op-uuid-8891-aabb',
          userId: 'usr-1',
          actionType: 'CREATE_SOS',
          endpoint: '/api/during/sos/request',
          payload: { peopleCount: 4, waterLevel: 'HIGH' },
          clientTimestamp: '2026-09-22T10:35:01Z',
          syncStatus: 'PENDING',
          retryCount: 0
        });
        const pendingOutbox = await offlineStorageService.getOutboxItemsByStatus('PENDING');
        check(pendingOutbox.ok && pendingOutbox.data.length === 1 && pendingOutbox.data[0].id === 'op-uuid-8891-aabb', 'sosOutbox queried by syncStatus index');

        // 15. Store 11 CRUD: syncMetadata
        await offlineStorageService.putSyncMetadata({
          entityName: 'shelters',
          lastSyncTime: '2026-09-22T10:00:00Z',
          recordCount: 2,
          syncState: 'IDLE'
        });
        const syncMeta = await offlineStorageService.getSyncMetadata('shelters');
        check(syncMeta.ok && syncMeta.data && syncMeta.data.recordCount === 2, 'syncMetadata CRUD works');

        // 16. Multi-user coexistence
        await offlineStorageService.putUserSession({
          userId: 'usr-2',
          name: 'Inspector Rajesh Kumar',
          role: 'RESCUER',
          mobileNumber: '9800000001',
          lastAuthenticated: '2026-09-22T10:15:00Z'
        });
        const allSessions = await offlineStorageService.getAllUserSessions();
        check(allSessions.ok && allSessions.data.length === 2, 'Multiple users coexist in userSession without key collisions');

        // 17. Atomic transaction support
        const txResult = await offlineStorageService.runTransaction(
          ['activeSos', 'sosOutbox'],
          'readwrite',
          async (tx) => {
            const sos = await tx.objectStore('activeSos').get('sos-loc-001');
            if (sos) {
              sos.syncStatus = 'SYNCED';
              await tx.objectStore('activeSos').put(sos);
            }
            const outboxItem = await tx.objectStore('sosOutbox').get('op-uuid-8891-aabb');
            if (outboxItem) {
              outboxItem.syncStatus = 'FAILED';
              await tx.objectStore('sosOutbox').put(outboxItem);
            }
            return { updated: true };
          }
        );
        check(txResult.ok && txResult.data && txResult.data.updated === true, 'Multi-store atomic transaction completes successfully');

        const updatedSos = await offlineStorageService.getActiveSos('sos-loc-001');
        check(updatedSos.ok && updatedSos.data && updatedSos.data.syncStatus === 'SYNCED', 'Atomic transaction modifications committed');

        // 18. Database close and reopen preserves data
        await closeStrideDB();
        const reopenedDb = await openStrideDB();
        check(reopenedDb !== null, 'Database reopens successfully');
        const preservedUser = await offlineStorageService.getUserSession('usr-1');
        check(preservedUser.ok && preservedUser.data && preservedUser.data.name === 'Ramesh Iyer', 'Reopened database preserves existing user session');
        const preservedMembers = await offlineStorageService.getHouseholdMembers('hh-1');
        check(preservedMembers.ok && preservedMembers.data.length === 3, 'Reopened database preserves existing household members');

        // 19. Optional fields & edge case resilience
        const minimalHousehold = await offlineStorageService.putHousehold({
          id: 'hh-min',
          userId: 'usr-2',
          name: 'Minimal Household',
          address: 'No street number',
          city: 'Bengaluru',
          state: 'Karnataka',
          latitude: 12.9,
          longitude: 77.5,
          onboardingCompleted: false
        });
        check(minimalHousehold.ok, 'Storage layer handles records with omitted optional fields');

        // 20. Distinguish empty result vs unavailable DB
        // Legitimate empty result:
        const nonExistent = await offlineStorageService.getHousehold('does-not-exist');
        check(nonExistent.ok === true && nonExistent.data === null, 'Non-existent record returns { ok: true, data: null }');

        const emptyMembers = await offlineStorageService.getHouseholdMembers('non-existent-hh');
        check(emptyMembers.ok === true && Array.isArray(emptyMembers.data) && emptyMembers.data.length === 0, 'Empty member query returns { ok: true, data: [] }');

      } catch (err) {
        results.push({ name: 'Unexpected test runner exception', passed: false, error: err.message });
      }

      return results;
    }

    window.__runStrideStorageTests = runInBrowser;
    window.__strideOffline = {
      STRIDE_DB_NAME,
      STRIDE_DB_VERSION,
      openStrideDB,
      closeStrideDB,
      deleteStrideDB,
      isIndexedDBSupported,
      offlineStorageService,
      StorageError,
    };
  `;

  const buildResult = await esbuild.build({
    stdin: {
      contents: testScriptSource,
      resolveDir: process.cwd(),
      sourcefile: 'browser_test_runner.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
  });

  const bundledJs = buildResult.outputFiles[0].text;

  // Spin up ephemeral http server so browser has a valid origin (not opaque about:blank)
  const http = await import('http');
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(bundledJs);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>STRIDE IDB Test</title><script src="/bundle.js"></script></head><body></body></html>`);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  // Launch Playwright (Edge or Chromium)
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to local test page
  await page.goto(`http://127.0.0.1:${port}`);

  // Execute in browser
  const browserResults: TestResult[] = await page.evaluate(async () => {
    return (window as any).__runStrideStorageTests();
  });

  for (const r of browserResults) {
    assert(r.passed, r.name, r.error);
  }

  // --- SUITE 3: ERROR DISTINCTION & UNAVAILABLE DB SIMULATION ---
  console.log('\n--- SUITE 3: ERROR DISTINCTION & GRACEFUL DEGRADATION ---');

  // Test environment where indexedDB is simulated unavailable
  const unavailableSimResult = await page.evaluate(async () => {
    const { closeStrideDB, offlineStorageService } = (window as any).__strideOffline;
    await closeStrideDB();

    // Override indexedDB on window
    const originalIdb = window.indexedDB;
    try {
      Object.defineProperty(window, 'indexedDB', {
        value: null,
        writable: true,
        configurable: true,
      });

      // Query storage service while DB is unavailable
      const result = await offlineStorageService.getHousehold('any-id');
      const isErrorDistinguishable = !result.ok && result.error?.code === 'DB_UNAVAILABLE';

      return {
        isErrorDistinguishable,
        resultOk: result.ok,
        errorCode: !result.ok ? result.error?.code : null,
        errorMsg: !result.ok ? result.error?.message : null,
      };
    } finally {
      // Restore indexedDB
      Object.defineProperty(window, 'indexedDB', {
        value: originalIdb,
        writable: true,
        configurable: true,
      });
    }
  });

  assert(
    unavailableSimResult.isErrorDistinguishable === true && unavailableSimResult.resultOk === false,
    'Database-unavailable state is explicitly distinguishable from legitimate empty results ({ ok: false, error: DB_UNAVAILABLE })'
  );

  await context.close();
  await browser.close();
  server.close();

  console.log('\n================================================================');
  console.log(`OFFLINE STORAGE VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOfflineStorageSuite().catch((err) => {
  console.error('Fatal error in offline storage verification suite:', err);
  process.exit(1);
});
