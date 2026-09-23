import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import { isSnapshotStale, formatLastUpdated, formatWeatherTelemetryLabel, ONE_HOUR_MS } from '../src/offline/offlineDateUtils';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runOfflineLastKnownDataSuite() {
  console.log('================================================================');
  console.log('STRIDE OFFLINE DATA VISIBILITY — SHOW LAST ONLINE SNAPSHOT SUITE');
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
  // SUITE 1: STATIC ARCHITECTURE & SOURCE CODE INVARIANTS
  // ============================================================================
  console.log('--- SUITE 1: STATIC ARCHITECTURE & SOURCE CODE INVARIANTS ---');

  const dateUtilsPath = path.resolve(process.cwd(), 'src/offline/offlineDateUtils.ts');
  const cacheServicePath = path.resolve(process.cwd(), 'src/offline/cacheService.ts');
  const storageServicePath = path.resolve(process.cwd(), 'src/offline/offlineStorageService.ts');
  const shelterServicePath = path.resolve(process.cwd(), 'src/services/shelterService.ts');
  const hospitalServicePath = path.resolve(process.cwd(), 'src/services/hospitalService.ts');
  const disasterServicePath = path.resolve(process.cwd(), 'src/services/disasterService.ts');
  const mapServicePath = path.resolve(process.cwd(), 'src/services/mapService.ts');
  const shelterViewPath = path.resolve(process.cwd(), 'src/components/before/ShelterSelectionView.tsx');
  const hospViewPath = path.resolve(process.cwd(), 'src/components/hospital/HospitalInformationView.tsx');
  const hospListPath = path.resolve(process.cwd(), 'src/components/hospital/HospitalList.tsx');
  const beforeMapPath = path.resolve(process.cwd(), 'src/components/before/BeforeMapView.tsx');
  const duringMapPath = path.resolve(process.cwd(), 'src/components/during/DuringMapView.tsx');
  const liveWeatherPath = path.resolve(process.cwd(), 'src/components/common/LiveWeatherCard.tsx');

  assert(fs.existsSync(dateUtilsPath), 'src/offline/offlineDateUtils.ts exists');
  const dateUtilsContent = fs.readFileSync(dateUtilsPath, 'utf-8');
  assert(dateUtilsContent.includes('isSnapshotStale'), 'offlineDateUtils exports isSnapshotStale');
  assert(dateUtilsContent.includes('formatLastUpdated'), 'offlineDateUtils exports formatLastUpdated');
  assert(dateUtilsContent.includes('formatWeatherTelemetryLabel'), 'offlineDateUtils exports formatWeatherTelemetryLabel');
  assert(dateUtilsContent.includes('60 * 60 * 1000'), 'offlineDateUtils defines 1-hour freshness threshold (3,600,000 ms)');

  const cacheContent = fs.readFileSync(cacheServicePath, 'utf-8');
  assert(cacheContent.includes('persistDisasters') && cacheContent.includes('getDisastersWithFallback'), 'cacheService implements disaster persistence & fallback');
  assert(cacheContent.includes('persistCitizenMap') && cacheContent.includes('getCitizenMapWithFallback'), 'cacheService implements citizen map persistence & fallback');
  assert(cacheContent.includes('latest_citizen_map_${userId}'), 'cacheService scopes citizen map to userId (Refinement 1 user isolation)');
  assert(cacheContent.includes('persistRescuerMap') && cacheContent.includes('getRescuerMapWithFallback'), 'cacheService implements rescuer map persistence & fallback');

  const storageContent = fs.readFileSync(storageServicePath, 'utf-8');
  assert(storageContent.includes('getAllMapData'), 'offlineStorageService implements getAllMapData for hazard zones query');

  const shelterServiceContent = fs.readFileSync(shelterServicePath, 'utf-8');
  assert(shelterServiceContent.includes('getSheltersWithMeta'), 'shelterService implements getSheltersWithMeta with metadata');
  assert(shelterServiceContent.includes('async getShelters(): Promise<Shelter[]>'), 'shelterService preserves getShelters contract');

  const hospContent = fs.readFileSync(hospitalServicePath, 'utf-8');
  assert(hospContent.includes('source') && hospContent.includes('lastSyncedAt') && hospContent.includes('isStale'), 'hospitalService attaches cache metadata');

  const mapContent = fs.readFileSync(mapServicePath, 'utf-8');
  assert(mapContent.includes('persistCitizenMap'), 'mapService persists citizen map online');
  assert(mapContent.includes('getCitizenMapWithFallback(userId)'), 'mapService strictly uses user-scoped citizen map (Refinement 1)');
  assert(mapContent.includes('getHouseholdWithFallback') && mapContent.includes('getSheltersWithFallback') && mapContent.includes('getHospitalsWithFallback'), 'mapService implements compositional offline map fallback (Refinement 4)');

  const shelterViewContent = fs.readFileSync(shelterViewPath, 'utf-8');
  assert(shelterViewContent.includes('formatLastUpdated'), 'ShelterSelectionView formats last-updated indicator');
  assert(shelterViewContent.includes('Occupancy reflects the last saved update and may have changed'), 'ShelterSelectionView clarifies occupancy snapshot status');
  assert(shelterViewContent.includes('No saved shelter data is available on this device yet'), 'ShelterSelectionView displays empty state message');
  assert(shelterViewContent.includes('No Cached Shelters Available'), 'ShelterSelectionView preserves test-checked heading');

  const hospViewContent = fs.readFileSync(hospViewPath, 'utf-8');
  assert(hospViewContent.includes('formatLastUpdated'), 'HospitalInformationView formats last-updated indicator');
  assert(hospViewContent.includes('Availability reflects the last saved update and may have changed'), 'HospitalInformationView clarifies availability snapshot status');

  const hospListContent = fs.readFileSync(hospListPath, 'utf-8');
  assert(hospListContent.includes('No saved hospital data is available on this device yet'), 'HospitalList displays empty state message');
  assert(hospListContent.includes('No Cached Hospitals Available'), 'HospitalList preserves test-checked heading');

  const beforeMapContent = fs.readFileSync(beforeMapPath, 'utf-8');
  assert(beforeMapContent.includes('formatLastUpdated'), 'BeforeMapView formats last-updated indicator');
  assert(beforeMapContent.includes('Hazard information reflects the last saved snapshot'), 'BeforeMapView clarifies hazard boundary snapshot status');
  assert(beforeMapContent.includes('No saved map data is available on this device yet'), 'BeforeMapView displays empty state when no map data is cached');

  const duringMapContent = fs.readFileSync(duringMapPath, 'utf-8');
  assert(duringMapContent.includes('formatLastUpdated'), 'DuringMapView formats last-updated indicator');
  assert(duringMapContent.includes('Hazard information reflects the last saved snapshot'), 'DuringMapView clarifies hazard snapshot status');
  assert(duringMapContent.includes('No saved map data is available on this device yet'), 'DuringMapView displays empty state when no map data is cached');

  const liveWeatherContent = fs.readFileSync(liveWeatherPath, 'utf-8');
  assert(liveWeatherContent.includes('Saved Telemetry — cached:') && liveWeatherContent.includes('Saved Telemetry — stale:'), 'LiveWeatherCard preserves existing wording distinction');
  assert(liveWeatherContent.includes('formatWeatherTelemetryLabel'), 'LiveWeatherCard uses formatWeatherTelemetryLabel');
  assert(liveWeatherContent.includes('No saved weather data is available on this device yet'), 'LiveWeatherCard displays empty state when no weather telemetry is cached');

  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
  const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');
  assert(viteConfigContent.includes('openstreetmap-tiles') && viteConfigContent.includes('arcgis-satellite-tiles'), 'vite.config.ts configures tile runtimeCaching for OSM and ArcGIS');
  assert(viteConfigContent.includes("handler: 'CacheFirst'"), 'Tile caching uses CacheFirst strategy');
  assert(viteConfigContent.includes('purgeOnQuotaError: true'), 'Tile runtime caching specifies purgeOnQuotaError');

  const typesPath = path.resolve(process.cwd(), 'src/offline/types.ts');
  const typesContent = fs.readFileSync(typesPath, 'utf-8');
  assert(typesContent.includes('expectedArrivals?: number | null') && typesContent.includes('hasOccupancyData?: boolean'), 'ShelterRecord includes typed occupancy persistence fields');

  assert(shelterViewContent.includes('shelter.hasOccupancyData === false || shelter.occupancyUnavailable'), 'ShelterSelectionView differentiates genuine expected arrivals from unavailable');

  // ============================================================================
  // SUITE 2: DETERMINISTIC FRESHNESS & FORMATTING UNIT LOGIC
  // ============================================================================
  console.log('\n--- SUITE 2: DETERMINISTIC FRESHNESS & FORMATTING UNIT LOGIC ---');

  const nowMs = Date.now();
  const freshIso = new Date(nowMs - 15 * 60 * 1000).toISOString(); // 15 mins ago
  const staleIso = new Date(nowMs - 75 * 60 * 1000).toISOString(); // 75 mins ago (> 1 hour)
  const yesterdayIso = new Date(nowMs - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago

  // isSnapshotStale tests
  assert(!isSnapshotStale(freshIso, ONE_HOUR_MS), 'isSnapshotStale returns false for snapshot aged 15 minutes (<= 1 hour)');
  assert(isSnapshotStale(staleIso, ONE_HOUR_MS), 'isSnapshotStale returns true for snapshot aged 75 minutes (> 1 hour)');
  assert(isSnapshotStale(null), 'isSnapshotStale returns true for null timestamp');
  assert(isSnapshotStale(undefined), 'isSnapshotStale returns true for undefined timestamp');
  assert(isSnapshotStale('invalid-date'), 'isSnapshotStale returns true for invalid date string');

  // formatLastUpdated tests
  const freshLabel = formatLastUpdated(freshIso, false);
  assert(freshLabel.includes('Last updated:') && freshLabel.includes('· Cached'), `formatLastUpdated produces fresh badge: "${freshLabel}"`);

  const staleLabel = formatLastUpdated(staleIso, true);
  assert(staleLabel.includes('Last updated:') && staleLabel.includes('· Stale'), `formatLastUpdated produces stale badge: "${staleLabel}"`);

  const yesterdayLabel = formatLastUpdated(yesterdayIso, true);
  assert(yesterdayLabel.includes('Last updated yesterday') && yesterdayLabel.includes('· Stale'), `formatLastUpdated produces yesterday label: "${yesterdayLabel}"`);

  // formatLastUpdated online vs offline tests
  const onlineFreshLabel = formatLastUpdated(freshIso, false, false);
  assert(onlineFreshLabel.includes('Last updated:') && !onlineFreshLabel.includes('· Cached'), `formatLastUpdated produces clean online label without "· Cached": "${onlineFreshLabel}"`);

  const fourDaysAgoIso = new Date(nowMs - 4 * 24 * 60 * 60 * 1000).toISOString();
  const pastDayStaleLabel = formatLastUpdated(fourDaysAgoIso, true, true);
  assert(pastDayStaleLabel.includes('Last updated:') && pastDayStaleLabel.includes('· Stale'), `formatLastUpdated produces date-based stale badge for past days: "${pastDayStaleLabel}"`);

  // formatWeatherTelemetryLabel tests
  const weatherFreshLabel = formatWeatherTelemetryLabel(freshIso, false);
  assert(weatherFreshLabel.includes('Saved Telemetry · Cached ·'), `formatWeatherTelemetryLabel produces fresh format: "${weatherFreshLabel}"`);

  const weatherStaleLabel = formatWeatherTelemetryLabel(staleIso, true);
  assert(weatherStaleLabel.includes('Saved Telemetry · Stale ·'), `formatWeatherTelemetryLabel produces stale format: "${weatherStaleLabel}"`);

  // ============================================================================
  // SUITE 3: REAL BROWSER HYDRATION, OFFLINE CACHE & MULTI-USER ISOLATION
  // ============================================================================
  console.log('\n--- SUITE 3: REAL BROWSER HYDRATION, PERSISTENCE & USER ISOLATION ---');

  const testScriptSource = `
    import {
      offlineStorageService,
      offlineCacheService,
      deleteStrideDB,
      closeStrideDB,
      openStrideDB,
    } from './src/offline/index';
    import { isSnapshotStale, formatLastUpdated, formatWeatherTelemetryLabel } from './src/offline/offlineDateUtils';
    import { mapService } from './src/services/mapService';
    import { shelterService } from './src/services/shelterService';
    import { hospitalService } from './src/services/hospitalService';
    import { disasterService } from './src/services/disasterService';

    const mockHouseholdUserA = {
      id: 'hh-user-A',
      householdCode: 'HH-USER-A',
      createdByUserId: 'usr-user-A',
      name: 'User A Family Home',
      address: '100 Indiranagar 100ft Rd',
      latitude: 12.9716,
      longitude: 77.6412,
      members: [
        { id: 'm-A1', householdId: 'hh-user-A', name: 'Alice', age: 34, relationship: 'Self', category: 'ADULT' }
      ]
    };

    const mockHouseholdUserB = {
      id: 'hh-user-B',
      householdCode: 'HH-USER-B',
      createdByUserId: 'usr-user-B',
      name: 'User B Family Home',
      address: '25 Whitefield Main Rd',
      latitude: 12.9698,
      longitude: 77.7500,
      members: [
        { id: 'm-B1', householdId: 'hh-user-B', name: 'Bob', age: 29, relationship: 'Self', category: 'ADULT' }
      ]
    };

    const mockShelters = [
      { id: 'sh-101', name: 'Kanteerava Stadium Relief Outpost', address: 'Sampangi Rama Nagara', latitude: 12.9698, longitude: 77.5926, capacity: 600, contactNumber: '+91 80 2221 0001', status: 'AVAILABLE', expectedArrivals: 45, remainingCapacity: 555, occupancyPercentage: 8, hasOccupancyData: true },
      { id: 'sh-102', name: 'Koramangala Indoor Shelter', address: '80ft Rd Koramangala', latitude: 12.9352, longitude: 77.6245, capacity: 450, contactNumber: '+91 80 2553 0002', status: 'AVAILABLE', expectedArrivals: 0, remainingCapacity: 450, occupancyPercentage: 0, hasOccupancyData: true }
    ];

    const mockHospitals = [
      {
        id: 'hosp-101',
        name: 'Bowring and Lady Curzon Hospital',
        address: 'Shivajinagar, Bengaluru',
        latitude: 12.9830,
        longitude: 77.6047,
        contactNumber: '080-2559-1325',
        totalBeds: 500,
        availableBeds: 68,
        icuBedsTotal: 40,
        icuBedsAvailable: 12,
        emergencyDepartmentAvailable: true,
        emergencyStatusText: 'Operational',
        specialities: ['Emergency Medicine', 'Trauma'],
        doctors: [{ name: 'Dr. Rao', speciality: 'Trauma', onDuty: true }],
        facilityType: 'HOSPITAL',
      }
    ];

    const mockDisasters = [
      { id: 'dis-bangalore-flood', title: 'Monsoon Urban Flash Flood 2026', type: 'FLOOD', status: 'ACTIVE', severity: 'HIGH' }
    ];

    const mockZones = [
      { id: 'zone-101', disasterId: 'dis-bangalore-flood', name: 'Koramangala Drain Inundation Basin', riskLevel: 'RED', polygonGeoJson: '[[12.935, 77.620],[12.945, 77.630],[12.925, 77.625]]', radiusKm: 3.5 }
    ];

    const mockWeather = {
      temperature: 24.5,
      apparentTemperature: 25.2,
      windSpeed: 18.2,
      windDirection: 210,
      windDirectionCardinal: 'SSW',
      precipitation: 12.4,
      relativeHumidity: 88,
      weatherCode: 63,
      time: new Date().toISOString(),
      hourly: [
        { time: new Date().toISOString(), temp: 24.5, precipProb: 80, weatherCode: 63 }
      ]
    };

    async function runOnlinePhase() {
      const results = [];
      function check(condition, name, err) {
        results.push({ name, passed: Boolean(condition), error: err || '' });
      }

      try {
        await deleteStrideDB();

        // 1. Shelter persistence
        const shelterPut = await offlineCacheService.persistShelters(mockShelters);
        check(shelterPut.ok, '1. Shelter API success persists to IndexedDB');

        // 2. Hospital persistence
        const hospPut = await offlineCacheService.persistHospitals(mockHospitals);
        check(hospPut.ok, '5. Hospital API success persists to IndexedDB');

        // 3. Disaster & Hazard zones persistence
        const disPut = await offlineCacheService.persistDisasters(mockDisasters);
        check(disPut.ok, 'Disaster event persists to IndexedDB metadata');

        const zonePut = await offlineCacheService.persistMapData('dis-bangalore-flood', mockZones);
        check(zonePut.ok, '9. Map/disaster danger zones persisted after online fetch');

        // 4. Weather telemetry persistence
        const weatherPut = await offlineCacheService.persistHazardSnapshot(12.9716, 77.5946, mockWeather);
        check(weatherPut.ok, '12. Weather fetch updates cached snapshot in IndexedDB');

        // 5. User-A citizen map persistence (Strict User Isolation)
        const userAMap = {
          registeredHome: {
            id: mockHouseholdUserA.id,
            name: mockHouseholdUserA.name,
            address: mockHouseholdUserA.address,
            latitude: mockHouseholdUserA.latitude,
            longitude: mockHouseholdUserA.longitude,
            membersCount: 1,
            members: mockHouseholdUserA.members,
          },
          radiusKm: 5.0,
          shelters: mockShelters,
          facilities: { hospitals: mockHospitals, fireStations: [], policeStations: [], checkpoints: [] },
          roads: [],
          zones: mockZones,
          source: 'server',
          lastSyncedAt: new Date().toISOString(),
          isStale: false,
        };
        const mapPutUserA = await offlineCacheService.persistCitizenMap('usr-user-A', userAMap);
        check(mapPutUserA.ok, 'User A citizen map successfully saved under user-scoped key');

        // 6. User-A household persistence
        const hhPutUserA = await offlineCacheService.persistHousehold(mockHouseholdUserA, 'usr-user-A');
        check(hhPutUserA.ok, 'User A household persisted');

      } catch (err) {
        results.push({ name: 'Online phase exception', passed: false, error: err.message });
      }

      return results;
    }

    async function runOfflinePhase() {
      const results = [];
      function check(condition, name, err) {
        results.push({ name, passed: Boolean(condition), error: err || '' });
      }

      try {
        // 1. Offline shelter fallback
        const shelterRes = await offlineCacheService.getSheltersWithFallback();
        check(
          shelterRes.ok && shelterRes.data.data.length === 2 && shelterRes.data.source === 'cache',
          '2. Offline shelter request returns cached data (source: cache, 2 shelters)'
        );
        check(
          shelterRes.ok && shelterRes.data.source !== 'server',
          '19. Cached shelter data is never presented as live (source is cache)'
        );
        check(
          shelterRes.ok && shelterRes.data.data[0].expectedArrivals === 45 && shelterRes.data.data[0].hasOccupancyData === true,
          '27. SHELTER OCCUPANCY: Restores expected arrivals (45) and occupancy status offline'
        );
        check(
          shelterRes.ok && shelterRes.data.data[1].expectedArrivals === 0 && shelterRes.data.data[1].hasOccupancyData === true,
          '28. SHELTER OCCUPANCY: Differentiates genuine expected arrivals (0) from unavailable'
        );

        // 2. Offline hospital fallback
        const hospRes = await offlineCacheService.getHospitalsWithFallback();
        check(
          hospRes.ok && hospRes.data.data.hospitals.length === 1 && hospRes.data.source === 'cache',
          '6. Offline hospital request returns cached data (source: cache, 1 hospital)'
        );
        check(
          hospRes.ok && hospRes.data.source !== 'server',
          '19. Cached hospital data is never presented as live'
        );

        // 3. Offline map data fallback
        const mapDataRes = await offlineCacheService.getMapDataWithFallback('dis-bangalore-flood');
        check(
          mapDataRes.ok && mapDataRes.data.data.length === 1 && mapDataRes.data.source === 'cache',
          '10. Offline map renders latest cached danger zones'
        );

        // 4. Offline weather snapshot fallback
        const weatherRes = await offlineCacheService.getHazardSnapshotWithFallback(12.9716, 77.5946);
        check(
          weatherRes.ok && weatherRes.data.data.temperature === 24.5 && weatherRes.data.source === 'cache',
          '13. Offline weather displays cached snapshot'
        );
        check(
          weatherRes.ok && !weatherRes.data.isStale,
          '14. Fresh weather snapshot maintains fresh status (not stale yet)'
        );

        // 5. Critical User Isolation Test (Refinement 1)
        // User A was logged in and cached map. Now query for User B who never cached map.
        const userBMapRes = await offlineCacheService.getCitizenMapWithFallback('usr-user-B');
        check(
          userBMapRes.ok && userBMapRes.data.source === 'none' && userBMapRes.data.data === null,
          '23. USER ISOLATION: User B CANNOT access User A cached map state (returns source: none)'
        );

        // User A querying their own cache gets their own home
        const userAMapRes = await offlineCacheService.getCitizenMapWithFallback('usr-user-A');
        check(
          userAMapRes.ok && userAMapRes.data.data.registeredHome.name === 'User A Family Home',
          '23. USER ISOLATION: User A gets their own registered home from user-scoped cache'
        );

        // 6. Compositional Map Fallback Test (Refinement 4)
        // For User B: household is not in citizenMap, but public shelters and zones are in cache.
        // We verify mapService.getCitizenMap provides compositional fallback combining all available data
        localStorage.setItem('stride_user', JSON.stringify({ id: 'usr-user-B', name: 'Bob Citizen', role: 'CITIZEN' }));
        const compositionalMap = await mapService.getCitizenMap('dis-bangalore-flood');
        check(
          compositionalMap.source === 'cache',
          '26. COMPOSITIONAL MAP: When user has no full citizen map cached, source is cache via public entities'
        );
        check(
          compositionalMap.shelters.length === 2,
          '26. COMPOSITIONAL MAP: Composes public cached shelters (2 shelters retained)'
        );
        check(
          compositionalMap.facilities.hospitals.length === 1,
          '26. COMPOSITIONAL MAP: Composes public cached hospitals (1 hospital retained)'
        );
        check(
          compositionalMap.zones.length === 1,
          '26. COMPOSITIONAL MAP: Composes public cached danger zones (1 zone retained)'
        );
        check(
          compositionalMap.registeredHome.name !== 'User A Family Home',
          '23. USER ISOLATION & COMPOSITION: User B map NEVER inherits User A household coordinates'
        );

        // 7. No-Cache Empty States Handling
        // Querying for unknown disaster map returns source: 'cache' with 0 zones (or 'none' if empty)
        const emptyMapRes = await offlineCacheService.getMapDataWithFallback('dis-unknown-disaster');
        check(
          emptyMapRes.ok,
          '17. No-cache map state handled safely without throwing'
        );

        // 8. Reconnection / Newer online response replaces older cached snapshot
        const newerShelters = [
          ...mockShelters,
          { id: 'sh-103', name: 'Mallya Hospital Relief Hall', address: 'Vittal Mallya Rd', latitude: 12.971, longitude: 77.597, capacity: 250, contactNumber: '+91 80 2227 0003', status: 'AVAILABLE' }
        ];
        await offlineCacheService.persistShelters(newerShelters);
        const updatedShelterRes = await offlineCacheService.getSheltersWithFallback();
        check(
          updatedShelterRes.ok && updatedShelterRes.data.data.length === 3,
          '20 & 21. Reconnection refreshes cache: Newer online response replaces older cached snapshot (3 shelters)'
        );

        // 9. Cache write failure falls back safely
        // Passing invalid key or broken structure handled gracefully
        const invalidWrite = await offlineCacheService.persistCitizenMap('', null);
        check(
          !invalidWrite.ok && invalidWrite.error.code === 'OPERATION_FAILED',
          '22. Cache write failure returns error result safely without throwing unhandled exception'
        );

        // 10. Storage Error Semantics: Distinguish empty cache vs DB failure (Refinement 3)
        await closeStrideDB();
        const origIdb = window.indexedDB;
        try {
          Object.defineProperty(window, 'indexedDB', { value: null, writable: true, configurable: true });
          const dbFailure = await offlineCacheService.getSheltersWithFallback();
          check(
            !dbFailure.ok && dbFailure.error.code === 'DB_UNAVAILABLE',
            '25. Storage Error Semantics: IndexedDB unavailability returns DB_UNAVAILABLE (not empty list)'
          );
        } finally {
          Object.defineProperty(window, 'indexedDB', { value: origIdb, writable: true, configurable: true });
        }

      } catch (err) {
        results.push({ name: 'Offline phase exception', passed: false, error: err.message });
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
      sourcefile: 'browser_last_known_test_runner.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
  });

  const bundledJs = buildResult.outputFiles[0].text;

  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(bundledJs);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>STRIDE Last Known Data Test</title><script src="/bundle.js"></script></head><body></body></html>`);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`http://127.0.0.1:${port}`);

  // Part A: Execute online phase
  console.log('--- EXECUTING ONLINE HYDRATION PHASE IN BROWSER ---');
  const onlineResults: TestResult[] = await page.evaluate(async () => {
    return (window as any).__runOnlinePhase();
  });

  for (const r of onlineResults) {
    assert(r.passed, r.name, r.error);
  }

  // Part B: Disconnect browser network simulating real offline state
  console.log('\n--- EXECUTING OFFLINE FALLBACK & USER ISOLATION PHASE (BROWSER OFFLINE) ---');
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
  console.log(`OFFLINE LAST KNOWN DATA SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOfflineLastKnownDataSuite().catch((err) => {
  console.error('Fatal error in offline last known data suite:', err);
  process.exit(1);
});
