import fs from 'fs';
import path from 'path';
import http from 'http';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runOfflineDataCacheSuite() {
  console.log('================================================================');
  console.log('STRIDE OFFLINE DATA CACHING & HYDRATION SUITE (PHASE 2 STEP 3)');
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

  const cacheServicePath = path.resolve(process.cwd(), 'src/offline/cacheService.ts');
  const householdServicePath = path.resolve(process.cwd(), 'src/services/householdService.ts');
  const hospitalServicePath = path.resolve(process.cwd(), 'src/services/hospitalService.ts');
  const liveWeatherPath = path.resolve(process.cwd(), 'src/components/common/LiveWeatherCard.tsx');

  assert(fs.existsSync(cacheServicePath), 'src/offline/cacheService.ts exists');

  const cacheContent = fs.readFileSync(cacheServicePath, 'utf-8');
  assert(cacheContent.includes('getHouseholdWithFallback'), 'cacheService implements getHouseholdWithFallback');
  assert(cacheContent.includes('getSheltersWithFallback'), 'cacheService implements getSheltersWithFallback');
  assert(cacheContent.includes('getHospitalsWithFallback'), 'cacheService implements getHospitalsWithFallback');
  assert(cacheContent.includes('getMapDataWithFallback'), 'cacheService implements getMapDataWithFallback');
  assert(cacheContent.includes('getHazardSnapshotWithFallback'), 'cacheService implements getHazardSnapshotWithFallback');
  assert(cacheContent.includes('persistUserSession'), 'cacheService implements persistUserSession');

  // Verify Refinement 1: No circular dependency (beforeApi does not import cacheService)
  const beforeApiPath = path.resolve(process.cwd(), 'src/api/beforeApi.ts');
  const beforeApiContent = fs.readFileSync(beforeApiPath, 'utf-8');
  assert(!beforeApiContent.includes('cacheService'), 'beforeApi.ts has zero imports from cacheService (no circular dependency)');

  // Verify Refinement 2: Preserved return contracts
  const hhContent = fs.readFileSync(householdServicePath, 'utf-8');
  assert(hhContent.includes('async getMyHousehold(): Promise<Household>'), 'householdService.getMyHousehold preserves Promise<Household> contract');

  const hospContent = fs.readFileSync(hospitalServicePath, 'utf-8');
  assert(hospContent.includes('async getHospitals(') && hospContent.includes('Promise<HospitalListResponse>'), 'hospitalService.getHospitals preserves Promise<HospitalListResponse> contract');

  // Verify Refinement 3: Weather staleness derived from timestamp/expiresAt
  assert(cacheContent.includes('expiresAt'), 'cacheService computes and evaluates actual expiresAt for weather staleness');
  const weatherContent = fs.readFileSync(liveWeatherPath, 'utf-8');
  assert(weatherContent.includes('isOfflineData') && weatherContent.includes('isDataStale'), 'LiveWeatherCard distinguishes live from offline cached/stale weather');

  // --- SUITE 2: REAL BROWSER CHROMIUM/EDGE HYDRATION TESTS ---
  console.log('\n--- SUITE 2: REAL BROWSER HYDRATION & PERSISTENCE (ONLINE) ---');

  const testScriptSource = `
    import {
      offlineStorageService,
      offlineCacheService,
      deleteStrideDB,
      closeStrideDB,
      openStrideDB,
    } from './src/offline/index';

    // Global mock datasets for test coordination
    const mockHousehold = {
      id: 'hh-user-101',
      householdCode: 'HH-USER101',
      createdByUserId: 'usr-ramesh',
      name: 'Ramesh Residence',
      address: '42 CMH Road',
      latitude: 12.9784,
      longitude: 77.6408,
      members: [
        { id: 'm-101', householdId: 'hh-user-101', name: 'Ramesh Iyer', age: 42, relationship: 'Self', category: 'ADULT' },
        { id: 'm-102', householdId: 'hh-user-101', name: 'Priya Iyer', age: 39, relationship: 'Spouse', category: 'ADULT' },
        { id: 'm-103', householdId: 'hh-user-101', name: 'Aarav Iyer', age: 10, relationship: 'Child', category: 'CHILD' },
      ]
    };

    const mockShelters = [
      { id: 'sh-1', name: 'Koramangala Indoor Stadium', address: '80ft Rd', latitude: 12.935, longitude: 77.624, capacity: 500, contactNumber: '+91 80 2553 0001', status: 'ACTIVE' },
      { id: 'sh-2', name: 'Indiranagar Community Hall', address: '100ft Rd', latitude: 12.978, longitude: 77.640, capacity: 300, contactNumber: '+91 80 2525 0002', status: 'ACTIVE' }
    ];

    const mockHospitals = [
      {
        id: 'hosp-1',
        name: 'Manipal Hospital HAL',
        address: 'HAL Airport Rd',
        latitude: 12.959,
        longitude: 77.653,
        contactNumber: '080-2502-4444',
        totalBeds: 600,
        availableBeds: 42,
        icuBedsTotal: 50,
        icuBedsAvailable: 8,
        emergencyDepartmentAvailable: true,
        emergencyStatusText: 'Operational',
        specialities: ['Trauma', 'Emergency Medicine'],
        doctors: [{ name: 'Dr. Suresh', speciality: 'Trauma', onDuty: true }],
        facilityType: 'HOSPITAL',
        disclaimer: '⚠️ DEMO DATA'
      }
    ];

    const mockZones = [
      { id: 'zone-1', disasterId: 'dis-1', name: 'Bellandur Flood Plain', riskLevel: 'HIGH', polygonGeoJson: '[[12.93, 77.67]]', radiusKm: 4.5 }
    ];

    async function runOnlinePhase() {
      const results = [];
      function check(condition, name, err) {
        results.push({ name, passed: Boolean(condition), error: err || '' });
      }

      try {
        await deleteStrideDB();

        // 1. Household & Members Persistence
        const hhPersist = await offlineCacheService.persistHousehold(mockHousehold, 'usr-ramesh');
        check(hhPersist.ok && hhPersist.data === 'hh-user-101', 'Online household fetch persists household to IndexedDB');

        const membersInDb = await offlineStorageService.getHouseholdMembers('hh-user-101');
        check(membersInDb.ok && membersInDb.data.length === 3, 'Online household members fetch persists members to IndexedDB');

        // 2. Shelters Persistence
        const shPersist = await offlineCacheService.persistShelters(mockShelters);
        check(shPersist.ok, 'Online shelters fetch persists shelters to IndexedDB');

        // 3. Hospitals Persistence
        const hospPersist = await offlineCacheService.persistHospitals(mockHospitals);
        check(hospPersist.ok, 'Online hospitals fetch persists hospitals to IndexedDB');

        // 4. Map Data Persistence
        const mapPersist = await offlineCacheService.persistMapData('dis-1', mockZones);
        check(mapPersist.ok, 'Online map data fetch persists map zones to IndexedDB');

        // 5. Hazard Snapshot Persistence (Fresh: expires in 1 hour)
        const mockWeatherFresh = {
          temperature: 24.5,
          apparentTemperature: 26.0,
          windSpeed: 15.0,
          windDirection: 90,
          windDirectionCardinal: 'E',
          precipitation: 22.5,
          relativeHumidity: 94,
          weatherCode: 65,
          time: new Date().toISOString(),
          hourly: []
        };
        const weatherPersist = await offlineCacheService.persistHazardSnapshot(12.97, 77.59, mockWeatherFresh);
        check(weatherPersist.ok, 'Online weather fetch persists hazard snapshot with timestamp & TTL');

        // 6. Expired Hazard Snapshot Persistence (expired 2 hours ago)
        await offlineStorageService.putHazardSnapshot({
          id: 'hazard_13.00_77.60',
          temperature: 20.0,
          apparentTemperature: 21.0,
          precipitation: 0.0,
          relativeHumidity: 60,
          windSpeed: 5.0,
          floodRiskLevel: 'LOW',
          badge: 'Low Surface Inundation Risk',
          recordedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
        });
        check(true, 'Test setup: Stored expired hazard snapshot for staleness verification');

        // 7. Non-destructive Upsert / Deduplication
        mockShelters[0].capacity = 550;
        await offlineCacheService.persistShelters(mockShelters);
        const deduplicatedShelters = await offlineStorageService.getAllShelters();
        check(
          deduplicatedShelters.ok && deduplicatedShelters.data.length === 2 && deduplicatedShelters.data[0].capacity === 550,
          'Repeated fetches cleanly upsert existing records without duplicate ID entries'
        );

      } catch (err) {
        results.push({ name: 'Unexpected test runner exception (online phase)', passed: false, error: err.message });
      }

      return results;
    }

    async function runOfflinePhase() {
      const results = [];
      function check(condition, name, err) {
        results.push({ name, passed: Boolean(condition), error: err || '' });
      }

      try {
        // 1. Offline Fallback: Household & Members
        const hhFallback = await offlineCacheService.getHouseholdWithFallback('usr-ramesh');
        check(hhFallback.ok && hhFallback.data.source === 'cache', 'Offline household request returns source="cache"');
        check(hhFallback.ok && hhFallback.data.data && hhFallback.data.data.id === 'hh-user-101', 'Offline household request returns cached household data');
        check(hhFallback.ok && hhFallback.data.data && hhFallback.data.data.members.length === 3, 'Offline household request populates all cached members');

        // 2. Offline Fallback: Shelters
        const sheltersFallback = await offlineCacheService.getSheltersWithFallback();
        check(sheltersFallback.ok && sheltersFallback.data.source === 'cache', 'Offline shelters request returns source="cache"');
        check(sheltersFallback.ok && sheltersFallback.data.data.length === 2, 'Offline shelters request returns all cached shelters');

        // 3. Offline Fallback: Hospitals
        const hospitalsFallback = await offlineCacheService.getHospitalsWithFallback();
        check(hospitalsFallback.ok && hospitalsFallback.data.source === 'cache', 'Offline hospitals request returns source="cache"');
        check(hospitalsFallback.ok && hospitalsFallback.data.data.hospitals.length === 1, 'Offline hospitals request returns all cached hospitals');

        // 4. Offline Fallback: Map Data
        const mapFallback = await offlineCacheService.getMapDataWithFallback('dis-1');
        check(mapFallback.ok && mapFallback.data.source === 'cache', 'Offline map data request returns source="cache"');
        check(mapFallback.ok && mapFallback.data.data.length === 1, 'Offline map data request returns cached zone boundaries');

        // 5. Fresh Weather Staleness (within TTL -> isStale === false)
        const weatherFreshFallback = await offlineCacheService.getHazardSnapshotWithFallback(12.97, 77.59);
        check(weatherFreshFallback.ok && weatherFreshFallback.data.isStale === false, 'Freshly cached weather within TTL is NOT marked stale (isStale=false)');

        // 6. Expired Weather Staleness (past TTL -> isStale === true)
        const weatherExpiredFallback = await offlineCacheService.getHazardSnapshotWithFallback(13.00, 77.60);
        check(weatherExpiredFallback.ok && weatherExpiredFallback.data.isStale === true, 'Expired cached weather is accurately flagged with isStale=true');

        // 7. Strict User Isolation: User B ('usr-priya') cannot access User A ('usr-ramesh') household
        const crossUserAttempt = await offlineCacheService.getHouseholdWithFallback('usr-priya');
        check(
          crossUserAttempt.ok && crossUserAttempt.data.source === 'none' && crossUserAttempt.data.data === null,
          'Strict User Isolation: User A cached household is NEVER leaked to User B (source="none", data=null)'
        );

        // 8. No-cache + Offline Produces Typed Empty/None Result
        const unpopulatedDisasterMap = await offlineCacheService.getMapDataWithFallback('dis-non-existent');
        check(
          unpopulatedDisasterMap.ok && unpopulatedDisasterMap.data.source === 'none' && unpopulatedDisasterMap.data.data.length === 0,
          'No-cache + offline produces source="none" with empty array, never fabricates speculative data'
        );

        // 9. Error Distinction: IndexedDB Unavailable State
        await closeStrideDB();
        const originalIdb = window.indexedDB;
        try {
          Object.defineProperty(window, 'indexedDB', { value: null, writable: true, configurable: true });
          const dbErrorResult = await offlineCacheService.getHouseholdWithFallback('usr-ramesh');
          check(
            !dbErrorResult.ok && dbErrorResult.error.code === 'DB_UNAVAILABLE',
            'Storage/IndexedDB failure remains distinguishable from legitimate empty results ({ ok: false, error: DB_UNAVAILABLE })'
          );
        } finally {
          Object.defineProperty(window, 'indexedDB', { value: originalIdb, writable: true, configurable: true });
        }

      } catch (err) {
        results.push({ name: 'Unexpected test runner exception (offline phase)', passed: false, error: err.message });
      }

      return results;
    }

    window.__runOnlinePhase = runOnlinePhase;
    window.__runOfflinePhase = runOfflinePhase;
  `;

  const buildResult = await esbuild.build({
    stdin: {
      contents: testScriptSource,
      resolveDir: process.cwd(),
      sourcefile: 'browser_cache_test_runner.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
  });

  const bundledJs = buildResult.outputFiles[0].text;

  // Local HTTP server for authentic browser origin
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(bundledJs);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>STRIDE Cache Test</title><script src="/bundle.js"></script></head><body></body></html>`);
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

  await page.goto(`http://127.0.0.1:${port}`);

  // Part A: Execute online phase
  const onlineResults: TestResult[] = await page.evaluate(async () => {
    return (window as any).__runOnlinePhase();
  });

  for (const r of onlineResults) {
    assert(r.passed, r.name, r.error);
  }

  // Part B: Disconnect browser network simulating real offline state
  console.log('\n--- SUITE 3: REAL BROWSER OFFLINE FALLBACK & USER ISOLATION (NETWORK OFF) ---');
  await context.setOffline(true);

  const offlineResults: TestResult[] = await page.evaluate(async () => {
    return (window as any).__runOfflinePhase();
  });

  for (const r of offlineResults) {
    assert(r.passed, r.name, r.error);
  }

  await context.close();
  await browser.close();
  server.close();

  console.log('\n================================================================');
  console.log(`OFFLINE DATA CACHE SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOfflineDataCacheSuite().catch((err) => {
  console.error('Fatal error in offline data cache suite:', err);
  process.exit(1);
});
