import 'dotenv/config';
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

async function runOfflineShelterCapacityWarningSuite() {
  console.log('================================================================');
  console.log('STRIDE OFFLINE SHELTER WARNING & LAST-UPDATED VISIBILITY SUITE');
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
  // SUITE 1: STATIC ARCHITECTURAL & COMPONENT INVARIANTS
  // ============================================================================
  console.log('--- SUITE 1: STATIC ARCHITECTURAL & COMPONENT INVARIANTS ---');

  const shelterViewPath = path.resolve(process.cwd(), 'src/components/before/ShelterSelectionView.tsx');
  const hospitalViewPath = path.resolve(process.cwd(), 'src/components/hospital/HospitalInformationView.tsx');
  const beforeMapPath = path.resolve(process.cwd(), 'src/components/before/BeforeMapView.tsx');
  const duringMapPath = path.resolve(process.cwd(), 'src/components/during/DuringMapView.tsx');
  const liveWeatherPath = path.resolve(process.cwd(), 'src/components/common/LiveWeatherCard.tsx');

  assert(fs.existsSync(shelterViewPath), 'ShelterSelectionView.tsx exists');
  assert(fs.existsSync(hospitalViewPath), 'HospitalInformationView.tsx exists');
  assert(fs.existsSync(beforeMapPath), 'BeforeMapView.tsx exists');
  assert(fs.existsSync(duringMapPath), 'DuringMapView.tsx exists');
  assert(fs.existsSync(liveWeatherPath), 'LiveWeatherCard.tsx exists');

  const shelterViewContent = fs.readFileSync(shelterViewPath, 'utf-8');
  const hospitalViewContent = fs.readFileSync(hospitalViewPath, 'utf-8');
  const beforeMapContent = fs.readFileSync(beforeMapPath, 'utf-8');
  const duringMapContent = fs.readFileSync(duringMapPath, 'utf-8');
  const liveWeatherContent = fs.readFileSync(liveWeatherPath, 'utf-8');

  // Invariant 1: Connectivity hook integration
  assert(
    shelterViewContent.includes('useConnectivityStatus'),
    'ShelterSelectionView imports and uses useConnectivityStatus'
  );

  // Invariant 2: Backward-compatible isOffline prop support
  assert(
    shelterViewContent.includes('isOffline?: boolean') && shelterViewContent.includes('isOffline: propOffline'),
    'ShelterSelectionViewProps supports optional isOffline override prop'
  );

  // Invariant 3: Warning test identifier
  assert(
    shelterViewContent.includes('data-testid="offline-shelter-capacity-warning"'),
    'Shelter card contains data-testid="offline-shelter-capacity-warning"'
  );

  // Invariant 4: Exact required wording: "Offline! Unable to update Shelter Capacity"
  assert(
    shelterViewContent.includes('Offline! Unable to update Shelter Capacity'),
    'Warning uses exact required text: "Offline! Unable to update Shelter Capacity"'
  );
  assert(
    !shelterViewContent.includes('Offline! Unable to display Shelter Capacity'),
    'Old warning text "Offline! Unable to display Shelter Capacity" is completely removed'
  );

  // Invariant 5: Amber/yellow styling & AlertTriangle icon
  assert(
    shelterViewContent.includes('bg-amber-500/15') &&
    shelterViewContent.includes('border-amber-500/30') &&
    shelterViewContent.includes('AlertTriangle'),
    'Warning uses yellow/amber background, amber border, and AlertTriangle icon'
  );

  // Invariant 6: Placed on EACH shelter card within capacity section
  assert(
    shelterViewContent.indexOf('data-testid="offline-shelter-capacity-warning"') > shelterViewContent.indexOf('Total Cap') &&
    shelterViewContent.indexOf('data-testid="offline-shelter-capacity-warning"') < shelterViewContent.indexOf('shelter.contactNumber'),
    'Warning is positioned inside each shelter card directly adjacent to the capacity/occupancy section'
  );

  // Invariant 7: Preserves existing capacity metrics
  assert(
    shelterViewContent.includes('Total Cap') &&
    shelterViewContent.includes('Expected') &&
    shelterViewContent.includes('Remaining') &&
    shelterViewContent.includes('Occupancy Trend'),
    'Existing shelter card data/UI (Total Cap, Expected, Remaining, Occupancy Trend) remains completely intact'
  );

  // Invariant 8: Section last-updated timestamps are rendered ONLY when offline
  assert(
    shelterViewContent.includes('{isOffline && shelterMeta.lastSyncedAt && ('),
    'ShelterSelectionView: Section last-updated timestamp is guarded by {isOffline && ...}'
  );
  assert(
    hospitalViewContent.includes('{isOffline && meta.lastSyncedAt && ('),
    'HospitalInformationView: Section last-updated timestamp is guarded by {isOffline && ...}'
  );
  assert(
    beforeMapContent.includes('const isOffline =') && beforeMapContent.includes('if (isOffline) {') && beforeMapContent.includes('return null;'),
    'BeforeMapView: Section last-updated timestamp returns null when online'
  );
  assert(
    duringMapContent.includes('const isOffline =') && duringMapContent.includes('if (isOffline) {') && duringMapContent.includes('return null;'),
    'DuringMapView: Section last-updated timestamp returns null when online'
  );
  assert(
    liveWeatherContent.includes('{isEffectiveOffline && cachedTimestamp && ('),
    'LiveWeatherCard: Section last-updated timestamp is guarded by {isEffectiveOffline && ...}'
  );

  // Invariant 9: Standardized timestamp format function preserved
  assert(
    shelterViewContent.includes('formatLastUpdated') &&
    hospitalViewContent.includes('formatLastUpdated') &&
    beforeMapContent.includes('formatLastUpdated') &&
    duringMapContent.includes('formatLastUpdated') &&
    liveWeatherContent.includes('formatLastUpdated'),
    'All sections retain formatLastUpdated for standardized timestamp rendering'
  );

  // Invariant 10: "Designated relief center" footer notice completely removed
  assert(
    !shelterViewContent.includes('Designated relief center — Informational directory for emergency evacuation'),
    'Shelter card footer line "Designated relief center — Informational directory for emergency evacuation" is completely removed'
  );
  assert(
    !shelterViewContent.includes('shelters.informationalNotice'),
    'Shelter card has no reference to shelters.informationalNotice'
  );

  // ============================================================================
  // SUITE 2: REAL BROWSER HYDRATION & OFFLINE TOGGLE TESTS (PLAYWRIGHT)
  // ============================================================================
  console.log('\n--- SUITE 2: REAL BROWSER (PLAYWRIGHT) WARNING & TIMESTAMP TESTS ---');

  const testAppSource = `
    import React, { useState } from 'react';
    import ReactDOM from 'react-dom/client';
    import { ShelterSelectionView } from './src/components/before/ShelterSelectionView';
    import { LanguageProvider } from './src/i18n/LanguageContext';
    import { shelterService } from './src/services/shelterService';

    const sampleShelters = [
      {
        id: 'sh-1',
        name: 'Our Lady of Vailankanni Hall',
        address: 'Babusapalya Main Rd, Bengaluru',
        latitude: 13.0189,
        longitude: 77.6542,
        capacity: 45,
        expectedArrivals: 52,
        remainingCapacity: -7,
        occupancyPercentage: 116,
        contactNumber: '+91 80 2544 0001',
        status: 'OVER_CAPACITY',
        hasOccupancyData: true
      },
      {
        id: 'sh-2',
        name: 'Mangaldhama Multi Utility Hall',
        address: 'Banaswadi, Bengaluru',
        latitude: 13.0084,
        longitude: 77.6481,
        capacity: 40,
        expectedArrivals: 46,
        remainingCapacity: -6,
        occupancyPercentage: 115,
        contactNumber: '+91 80 2545 0002',
        status: 'OVER_CAPACITY',
        hasOccupancyData: true
      },
      {
        id: 'sh-3',
        name: 'M. Chinnaswamy Stadium Outpost',
        address: 'MG Road, Bengaluru',
        latitude: 12.9784,
        longitude: 77.5996,
        capacity: 120,
        expectedArrivals: 35,
        remainingCapacity: 85,
        occupancyPercentage: 29,
        contactNumber: '+91 80 2286 0003',
        status: 'AVAILABLE',
        hasOccupancyData: true
      }
    ];

    shelterService.getSheltersWithMeta = async () => {
      return {
        shelters: sampleShelters,
        source: 'server',
        lastSyncedAt: new Date().toISOString(),
        isStale: false
      };
    };

    const mockUser = {
      id: 'usr-cit-1',
      name: 'Ramesh Iyer',
      email: 'ramesh@example.com',
      role: 'CITIZEN'
    };

    const mockDisaster = {
      id: 'dis-bangalore-flood',
      title: 'Monsoon Urban Flash Flood 2026',
      type: 'FLOOD',
      status: 'ACTIVE',
      severity: 'HIGH'
    };

    function TestRoot() {
      const [offlineOverride, setOfflineOverride] = useState(false);

      (window as any).__setOfflineOverride = (val) => {
        setOfflineOverride(val);
      };

      return (
        <LanguageProvider>
          <div className="p-4">
            <ShelterSelectionView
              user={mockUser}
              activeDisaster={mockDisaster}
              isOffline={offlineOverride}
            />
          </div>
        </LanguageProvider>
      );
    }

    const container = document.getElementById('root');
    const root = ReactDOM.createRoot(container);
    root.render(<TestRoot />);
    (window as any).__testReady = true;
  `;

  let bundledJs = '';
  try {
    const buildResult = await esbuild.build({
      stdin: {
        contents: testAppSource,
        resolveDir: process.cwd(),
        sourcefile: 'shelter_warning_test_runner.tsx',
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
    });
    bundledJs = buildResult.outputFiles[0].text;
  } catch (err: any) {
    console.error('esbuild bundling failed:', err);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(bundledJs);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>STRIDE Shelter Capacity Warning & Timestamp Test</title>
</head>
<body>
  <div id="root"></div>
  <script src="/bundle.js"></script>
</body>
</html>`);
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

  try {
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window as any).__testReady === true);
    // Wait for cards to finish rendering
    await page.waitForSelector('text=Our Lady of Vailankanni Hall', { timeout: 10000 });

    // Verify 3 shelter cards rendered
    const cardHeadings = await page.locator('h3:has-text("Our Lady of Vailankanni Hall"), h3:has-text("Mangaldhama Multi Utility Hall"), h3:has-text("M. Chinnaswamy Stadium Outpost")').count();
    assert(cardHeadings === 3, 'Rendered all 3 designated test shelter cards');

    // ------------------------------------------------------------------------
    // Test 1: ONLINE MODE — Warning must NOT be shown, timestamp must NOT be shown
    // ------------------------------------------------------------------------
    const onlineWarnings = await page.locator('[data-testid="offline-shelter-capacity-warning"]').count();
    assert(onlineWarnings === 0, '1. Online shelter cards do NOT display the warning (count: 0)');

    const onlineWarningTextCount = await page.locator('text="Offline! Unable to update Shelter Capacity"').count();
    assert(onlineWarningTextCount === 0, 'Online DOM does not contain new warning text');

    const onlineOldWarningTextCount = await page.locator('text="Offline! Unable to display Shelter Capacity"').count();
    assert(onlineOldWarningTextCount === 0, 'Online DOM does not contain old warning text');

    // Section heading timestamp must NOT be rendered online
    const onlineHeadingTimestamp = await page.locator('text=/Last updated:/').count();
    assert(onlineHeadingTimestamp === 0, 'Online shelter section does NOT display "Last updated" timestamp');

    // Verify directory footer notice is completely removed online
    const onlineFooterNotices = await page.locator('text=/Informational directory for emergency evacuation/i').count();
    assert(onlineFooterNotices === 0, 'Online shelter cards do NOT display directory footer notice (count: 0)');

    // Verify existing capacity metrics are rendered online
    const onlineTotalCap = await page.locator('text=Total Cap').count();
    const onlineExpected = await page.locator('text=Expected').count();
    const onlineRemaining = await page.locator('text=Remaining').count();
    assert(onlineTotalCap === 3, 'Online: Total Cap metric present on all 3 cards');
    assert(onlineExpected === 3, 'Online: Expected metric present on all 3 cards');
    assert(onlineRemaining === 3, 'Online: Remaining metric present on all 3 cards');

    // ------------------------------------------------------------------------
    // Test 2 & 3: OFFLINE MODE — Warning MUST be shown on EVERY shelter card
    // ------------------------------------------------------------------------
    await page.evaluate(() => {
      (window as any).__setOfflineOverride(true);
    });

    await page.waitForSelector('[data-testid="offline-shelter-capacity-warning"]');

    const offlineWarnings = await page.locator('[data-testid="offline-shelter-capacity-warning"]').count();
    assert(offlineWarnings > 0, '2. Offline shelter cards display the warning');
    assert(offlineWarnings === 3, '3. Every rendered shelter card receives the warning while offline (3 cards -> 3 warnings)');

    // ------------------------------------------------------------------------
    // Test 4: EXACT REQUIRED WORDING: "Offline! Unable to update Shelter Capacity"
    // ------------------------------------------------------------------------
    const warningElements = page.locator('[data-testid="offline-shelter-capacity-warning"]');
    const warningTexts = await warningElements.allInnerTexts();
    const allTextMatches = warningTexts.every((t) => t.trim() === 'Offline! Unable to update Shelter Capacity');
    assert(allTextMatches, '4. Exact text on every card is: "Offline! Unable to update Shelter Capacity"');

    // Verify amber background and border styling
    const firstWarningClass = await warningElements.first().getAttribute('class');
    assert(
      firstWarningClass?.includes('bg-amber-500/15') && firstWarningClass?.includes('border-amber-500/30'),
      'Warning element has clear yellow/amber background and border classes'
    );

    // Section heading timestamp MUST be rendered offline
    const offlineHeadingTimestamp = await page.locator('text=/Last updated:/').count();
    assert(offlineHeadingTimestamp > 0, 'Offline shelter section displays "Last updated" timestamp');

    // ------------------------------------------------------------------------
    // Test 5: Existing shelter card data/UI remains unchanged apart from warning
    // ------------------------------------------------------------------------
    const offlineTotalCap = await page.locator('text=Total Cap').count();
    const offlineExpected = await page.locator('text=Expected').count();
    const offlineRemaining = await page.locator('text=Remaining').count();
    assert(offlineTotalCap === 3, '5. Existing shelter card UI (Total Cap) remains unchanged while offline');
    assert(offlineExpected === 3, '5. Existing shelter card UI (Expected) remains unchanged while offline');
    assert(offlineRemaining === 3, '5. Existing shelter card UI (Remaining) remains unchanged while offline');

    // Verify contact numbers and names remain intact
    const phoneCount = await page.locator('text=+91 80').count();
    assert(phoneCount === 3, '5. Shelter contact numbers remain intact on all cards');

    // Verify directory footer notice is completely removed offline
    const offlineFooterNotices = await page.locator('text=/Informational directory for emergency evacuation/i').count();
    assert(offlineFooterNotices === 0, '5. Offline shelter cards do NOT display directory footer notice (count: 0)');

    // ------------------------------------------------------------------------
    // Test 6: Reconnection removes warning and timestamp cleanly
    // ------------------------------------------------------------------------
    await page.evaluate(() => {
      (window as any).__setOfflineOverride(false);
    });

    await page.waitForFunction(() => {
      return document.querySelectorAll('[data-testid="offline-shelter-capacity-warning"]').length === 0;
    });

    const reconnectedWarnings = await page.locator('[data-testid="offline-shelter-capacity-warning"]').count();
    assert(reconnectedWarnings === 0, '6. Reconnection removes warning cleanly from all shelter cards');

    const reconnectedTimestamp = await page.locator('text=/Last updated:/').count();
    assert(reconnectedTimestamp === 0, '6. Reconnection hides section "Last updated" timestamp cleanly');

  } finally {
    await browser.close();
    server.close();
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(`OFFLINE SHELTER CAPACITY WARNING & TIMESTAMP SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOfflineShelterCapacityWarningSuite().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
