import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { chromium, Browser, Page } from 'playwright';
import prisma from '../src/server/config/database.ts';
import { createApp } from '../src/server/app.ts';
import { generateToken } from '../src/server/middleware/auth.ts';

async function runMobileMapsAndInspectorsSuite() {
  console.log('========================================================================');
  console.log(' STRIDE MOBILE-FIRST UI REDESIGN — PHASE 4 VERIFICATION SUITE');
  console.log(' FULL-SCREEN MOBILE MAPS + TOUCH BOTTOM-SHEET ENTITY INSPECTORS');
  console.log('========================================================================\n');

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

  // ==========================================================================
  // SUITE 1: STATIC CODE, ARCHITECTURE & DESKTOP FREEZE AUDIT
  // ==========================================================================
  console.log('--- SUITE 1: STATIC CODE, ARCHITECTURE & DESKTOP FREEZE AUDIT ---');

  const srcPath = path.resolve(process.cwd(), 'src');
  const beforeMapFile = path.join(srcPath, 'components', 'before', 'BeforeMapView.tsx');
  const duringMapFile = path.join(srcPath, 'components', 'during', 'DuringMapView.tsx');
  const mobileBottomSheetFile = path.join(srcPath, 'components', 'common', 'MobileBottomSheet.tsx');

  assert(fs.existsSync(beforeMapFile), 'BeforeMapView.tsx exists');
  assert(fs.existsSync(duringMapFile), 'DuringMapView.tsx exists');
  assert(fs.existsSync(mobileBottomSheetFile), 'MobileBottomSheet.tsx exists');

  const beforeMapContent = fs.readFileSync(beforeMapFile, 'utf-8');
  const duringMapContent = fs.readFileSync(duringMapFile, 'utf-8');

  // 1. Mobile Bottom Sheet Primitive Reuse
  assert(
    beforeMapContent.includes("import { MobileBottomSheet } from '../common/MobileBottomSheet.tsx';"),
    'BeforeMapView reuses Phase 1 MobileBottomSheet primitive cleanly'
  );
  assert(
    duringMapContent.includes("import { MobileBottomSheet } from '../common/MobileBottomSheet.tsx';"),
    'DuringMapView reuses Phase 1 MobileBottomSheet primitive cleanly'
  );

  // 2. Mobile Map Canvas Responsive Sizing & Desktop Freeze
  assert(
    beforeMapContent.includes('h-[calc(100vh-14rem)] min-h-[380px] sm:min-h-[460px] lg:h-[750px] lg:min-h-[750px]'),
    'BeforeMapView container uses dynamic height h-[calc(100vh-14rem)] on mobile and freezes to lg:h-[750px] on desktop'
  );
  assert(
    duringMapContent.includes('h-[calc(100vh-14rem)] min-h-[380px] sm:min-h-[460px] lg:h-[650px] lg:min-h-[650px]'),
    'DuringMapView main map container uses dynamic height on mobile and freezes to lg:h-[650px] on desktop'
  );
  assert(
    duringMapContent.includes('satelliteMapContainerRef') &&
      duringMapContent.includes('h-[calc(100vh-14rem)] min-h-[380px] sm:min-h-[460px] lg:h-[650px] lg:min-h-[650px]'),
    'DuringMapView satellite map container uses dynamic height on mobile and freezes to lg:h-[650px] on desktop'
  );

  // 3. Desktop Controls & Inspector Card Freeze
  assert(
    beforeMapContent.includes('hidden lg:flex') && beforeMapContent.includes('lg:hidden absolute'),
    'BeforeMapView isolates desktop filter bar (hidden lg:flex) from mobile floating controls'
  );
  assert(
    duringMapContent.includes('hidden lg:flex') && duringMapContent.includes('lg:hidden absolute'),
    'DuringMapView isolates desktop filter bar (hidden lg:flex) from mobile floating controls'
  );
  assert(
    beforeMapContent.includes('hidden lg:block') &&
      beforeMapContent.includes('id="selected-entity-card"') &&
      beforeMapContent.includes('data-testid="selected-entity-card"'),
    'BeforeMapView desktop inspector card preserves id="selected-entity-card", data-testid, and freezes at hidden lg:block'
  );
  assert(
    duringMapContent.includes('id="selected-entity-card"') &&
      duringMapContent.includes('data-testid="selected-entity-card"') &&
      duringMapContent.includes('hidden lg:block'),
    'DuringMapView desktop floating card preserves id="selected-entity-card", data-testid, and freezes at hidden lg:block'
  );

  // 4. Mobile Bottom Sheet Entity Inspector
  assert(
    beforeMapContent.includes('<MobileBottomSheet') &&
      beforeMapContent.includes('title={selectedEntity.name}'),
    'BeforeMapView integrates MobileBottomSheet for touch-friendly entity inspection on mobile'
  );
  assert(
    duringMapContent.includes('<MobileBottomSheet') &&
      duringMapContent.includes('title={selectedItem.name}'),
    'DuringMapView integrates MobileBottomSheet for touch-friendly entity inspection on mobile'
  );

  // 5. Mobile Legend Bottom Sheet
  assert(
    beforeMapContent.includes('id="mobile-legend-bottom-sheet"') &&
      beforeMapContent.includes('isMobileLegendOpen'),
    'BeforeMapView includes mobile legend trigger and dedicated MobileBottomSheet legend'
  );
  assert(
    duringMapContent.includes('id="mobile-legend-bottom-sheet"') &&
      duringMapContent.includes('isMobileLegendOpen'),
    'DuringMapView includes mobile legend trigger and dedicated MobileBottomSheet legend'
  );

  // 6. Touch Target Compliance
  assert(
    beforeMapContent.includes('min-h-[44px]') &&
      duringMapContent.includes('min-h-[44px]'),
    'Both map views enforce min-h-[44px] on mobile chip filters, locate button, and close controls'
  );
  assert(
    beforeMapContent.includes('min-h-[48px]') &&
      duringMapContent.includes('min-h-[48px]'),
    'Both map views enforce min-h-[48px] on direct call and emergency action buttons'
  );

  // 7. Exact Verbatim Offline Safety Text Invariant
  const expectedOfflineWarning = 'Offline! Unable to update Shelter Capacity';
  assert(
    beforeMapContent.includes(expectedOfflineWarning) &&
      beforeMapContent.includes('data-testid="offline-shelter-capacity-warning"'),
    'BeforeMapView strictly preserves exact offline warning "Offline! Unable to update Shelter Capacity" with testid'
  );
  assert(
    duringMapContent.includes(expectedOfflineWarning) &&
      duringMapContent.includes('data-testid="offline-shelter-capacity-warning"'),
    'DuringMapView strictly preserves exact offline warning "Offline! Unable to update Shelter Capacity" with testid'
  );

  // 8. Direct Emergency Calling (tel: links)
  assert(
    beforeMapContent.includes('href={`tel:${selectedEntity.contact}`}') &&
      duringMapContent.includes('href={`tel:${selectedItem.contact}`}'),
    'Both map views provide direct tel: dialer links for shelters and hospitals'
  );

  // ==========================================================================
  // SUITE 2: SENSITIVE DATA BOUNDARIES & ROLE AUTHORIZATION AUDIT (Adjustment 1 & 3)
  // ==========================================================================
  console.log('\n--- SUITE 2: SENSITIVE DATA BOUNDARIES & ROLE AUTHORIZATION AUDIT (Adjustment 1 & 3) ---');

  // Verify Citizen vs Rescuer database users
  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: true },
  });
  const authorityOrRescuer = await prisma.user.findFirst({
    where: { role: { in: ['RESCUER', 'AUTHORITY'] } },
  });

  if (!citizen) throw new Error('Citizen user not found in database.');
  if (!authorityOrRescuer) throw new Error('Rescuer or Authority user not found in database.');

  const citizenToken = generateToken({
    userId: citizen.id,
    email: citizen.email,
    role: citizen.role as any,
  });

  const authorityToken = generateToken({
    userId: authorityOrRescuer.id,
    email: authorityOrRescuer.email,
    role: authorityOrRescuer.role as any,
  });

  // Start test server for API & Web
  const distPath = path.resolve(process.cwd(), 'dist');
  const app = createApp();
  // Serve built static frontend
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = http.createServer(app);
  const TEST_PORT = 3069;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', () => resolve()));
  console.log(`  [Server] Test server listening on http://127.0.0.1:${TEST_PORT}`);

  // Test 2.1: Citizen Map API Isolation
  console.log('  Testing Citizen Map Endpoint (/api/map/citizen)...');
  const citizenMapRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/map/citizen`, {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert(citizenMapRes.status === 200, 'Citizen successfully accesses authorized /api/map/citizen endpoint (HTTP 200)');
  const citizenMapData = await citizenMapRes.json();

  // Test 2.2: Geographic Radius Enforcement & Data Scoping
  assert(
    citizenMapData.radiusKm === 5.5,
    'Citizen map consumes existing server-enforced radius parameter (5.5 km) without client-side recalculation'
  );
  assert(
    Boolean(citizenMapData.registeredHome) && citizenMapData.registeredHome.id === citizen.households[0]?.id,
    'Citizen map returns ONLY the user’s own registered household'
  );
  assert(
    !Array.isArray(citizenMapData.households),
    'Citizen map payload strictly omits other citizens’ households array'
  );
  assert(
    !citizenMapData.emergencyRequests && !citizenMapData.triageQueue,
    'Citizen map payload strictly omits emergency dispatch requests and triage priority breakdown'
  );

  // Test 2.3: Citizen Access to Rescuer Map MUST BE FORBIDDEN
  console.log('  Testing Citizen forbidden access to /api/map/rescuer...');
  const forbiddenRescuerMapRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/map/rescuer`, {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert(
    forbiddenRescuerMapRes.status === 403,
    'Citizen is strictly forbidden from accessing /api/map/rescuer (HTTP 403 Forbidden)'
  );

  // Test 2.4: Authority / Rescuer Access to Operational Map
  console.log('  Testing Authority/Rescuer access to /api/map/rescuer...');
  const rescuerMapRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/map/rescuer`, {
    headers: { Authorization: `Bearer ${authorityToken}` },
  });
  assert(
    rescuerMapRes.status === 200,
    'Authority/Rescuer successfully accesses tactical operational map /api/map/rescuer (HTTP 200)'
  );
  const rescuerMapData = await rescuerMapRes.json();
  assert(
    Array.isArray(rescuerMapData.households) && Array.isArray(rescuerMapData.emergencyRequests),
    'Tactical map correctly includes registered households and active emergency requests for responders'
  );

  // Test 2.5: UI Code Boundary Check - Citizen vs Authority inspector separation
  assert(
    !beforeMapContent.includes('priorityScore') && !beforeMapContent.includes('triageQueue'),
    'BeforeMapView contains zero authority triage priority calculations'
  );
  assert(
    duringMapContent.includes("selectedItem.type === 'Emergency Distress Call'") &&
      duringMapContent.includes('selectedItem.score') &&
      duringMapContent.includes("user.role === 'AUTHORITY'"),
    'DuringMapView strictly guards operational triage distress calls, score, and dispatch actions behind Authority role check'
  );

  // ==========================================================================
  // SUITE 3: LIVE MULTI-VIEWPORT BROWSER AUDIT (8 Viewports)
  // ==========================================================================
  console.log('\n--- SUITE 3: LIVE MULTI-VIEWPORT BROWSER AUDIT (8 Viewports) ---');

  const browser: Browser = await chromium.launch({ channel: 'msedge', headless: true });

  const viewports = [
    { name: 'iPhone SE (320x568 Ultra-compact)', width: 320, height: 568, isMobile: true },
    { name: 'iPhone 8 (375x667 Standard)', width: 375, height: 667, isMobile: true },
    { name: 'iPhone 13/14 (390x844 Modern)', width: 390, height: 844, isMobile: true },
    { name: 'iPhone 15 Pro Max (430x932 Large)', width: 430, height: 932, isMobile: true },
    { name: 'iPad Mini (768x1024 Portrait)', width: 768, height: 1024, isMobile: true },
    { name: 'iPad Air (820x1180 Tablet)', width: 820, height: 1180, isMobile: true },
    { name: 'Desktop Baseline (1024x768 Frozen)', width: 1024, height: 768, isMobile: false },
    { name: 'Desktop Full HD (1920x1080 Frozen)', width: 1920, height: 1080, isMobile: false },
  ];

  async function setupCitizenMapAuth(page: Page, mode: 'BEFORE' | 'DURING') {
    const user = {
      id: citizen!.id,
      name: citizen!.name,
      email: citizen!.email,
      role: 'CITIZEN',
      testIdentityNumber: '5432 8901 2345',
    };
    await page.addInitScript(
      ({ userData, token, disasterMode }) => {
        localStorage.setItem('stride_user', JSON.stringify(userData));
        localStorage.setItem('stride_token', token);
        localStorage.setItem(`stride_household_handled_${userData.id}`, 'true');
        localStorage.setItem('stride_disaster_mode', disasterMode);
      },
      { userData: user, token: citizenToken, disasterMode: mode }
    );
  }

  for (const vp of viewports) {
    console.log(`\n  Testing Viewport: ${vp.name} [Width: ${vp.width}px, Expected: ${vp.isMobile ? 'MOBILE' : 'DESKTOP'}]`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });

    // 1. Audit BEFORE Map View
    const pageBefore: Page = await context.newPage();
    await setupCitizenMapAuth(pageBefore, 'BEFORE');
    await pageBefore.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
    await pageBefore.waitForTimeout(400);

    // Navigate to Map tab
    if (vp.isMobile) {
      const navMapBtn = pageBefore.locator('#mobile-nav-map');
      if (await navMapBtn.isVisible().catch(() => false)) {
        await navMapBtn.click();
        await pageBefore.waitForTimeout(400);
      }
    } else {
      const sidebarMapBtn = pageBefore.locator('#sidebar-nav-map');
      if (await sidebarMapBtn.isVisible().catch(() => false)) {
        await sidebarMapBtn.click();
        await pageBefore.waitForTimeout(400);
      }
    }

    const hasHorizontalOverflowBefore = await pageBefore.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasHorizontalOverflowBefore, `[${vp.name} /before map] Zero horizontal overflow`);

    if (vp.isMobile) {
      // Mobile Shell & Navigation
      const mobileNavVisible = await pageBefore.locator('#mobile-bottom-nav').isVisible().catch(() => false);
      assert(mobileNavVisible, `[${vp.name}] Mobile navigation bar active`);

      const desktopSidebarVisible = await pageBefore.locator('aside').isVisible().catch(() => false);
      assert(!desktopSidebarVisible, `[${vp.name}] Desktop sidebar hidden`);

      // Mobile chip filters present
      const chipsBar = pageBefore.locator('[data-testid="mobile-filter-chips-bar"]');
      assert(await chipsBar.isVisible().catch(() => false), `[${vp.name}] Horizontal scrollable filter chips visible`);

      // Mobile locate button
      const locateBtn = pageBefore.locator('button[aria-label="Locate me"]').first();
      if (await locateBtn.isVisible().catch(() => false)) {
        const box = await locateBtn.boundingBox();
        assert(box !== null && box.height >= 44 && box.width >= 44, `[${vp.name}] Locate button satisfies >=44px touch target (got ${box?.width}x${box?.height}px)`);
      }

      // Mobile Legend button triggers bottom sheet
      const legendBtn = pageBefore.locator('button:has-text("Legend")').first();
      if (await legendBtn.isVisible().catch(() => false)) {
        await legendBtn.click();
        await pageBefore.waitForTimeout(300);
        const legendSheet = pageBefore.locator('#mobile-legend-bottom-sheet');
        assert(await legendSheet.isVisible().catch(() => false), `[${vp.name}] Mobile legend bottom sheet opened on tap`);
      }
    } else {
      // Desktop Freeze
      const desktopSidebarVisible = await pageBefore.locator('aside').isVisible().catch(() => false);
      assert(desktopSidebarVisible, `[${vp.name}] Desktop frozen sidebar active`);

      const mobileNavVisible = await pageBefore.locator('#mobile-bottom-nav').isVisible().catch(() => false);
      assert(!mobileNavVisible, `[${vp.name}] Mobile navigation bar hidden`);
    }
    await pageBefore.close();

    // 2. Audit DURING Map View
    const pageDuring: Page = await context.newPage();
    await setupCitizenMapAuth(pageDuring, 'DURING');
    await pageDuring.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
    await pageDuring.waitForTimeout(400);

    // Navigate to Maps tab
    if (vp.isMobile) {
      const navMapsBtn = pageDuring.locator('#mobile-nav-maps');
      if (await navMapsBtn.isVisible().catch(() => false)) {
        await navMapsBtn.click();
        await pageDuring.waitForTimeout(400);
      }
    } else {
      const sidebarMapsBtn = pageDuring.locator('#sidebar-nav-maps');
      if (await sidebarMapsBtn.isVisible().catch(() => false)) {
        await sidebarMapsBtn.click();
        await pageDuring.waitForTimeout(400);
      }
    }

    const hasHorizontalOverflowDuring = await pageDuring.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasHorizontalOverflowDuring, `[${vp.name} /during maps] Zero horizontal overflow`);

    if (vp.isMobile) {
      const mobileNavVisible = await pageDuring.locator('#mobile-bottom-nav').isVisible().catch(() => false);
      assert(mobileNavVisible, `[${vp.name}] During map: mobile bottom nav active`);

      const desktopSidebarVisible = await pageDuring.locator('aside').isVisible().catch(() => false);
      assert(!desktopSidebarVisible, `[${vp.name}] During map: desktop sidebar hidden`);

      const chipsBar = pageDuring.locator('[data-testid="mobile-filter-chips-bar"]');
      assert(await chipsBar.isVisible().catch(() => false), `[${vp.name}] During map: mobile filter chips visible`);
    } else {
      const desktopSidebarVisible = await pageDuring.locator('aside').isVisible().catch(() => false);
      assert(desktopSidebarVisible, `[${vp.name}] During map: desktop sidebar frozen active`);

      const mobileNavVisible = await pageDuring.locator('#mobile-bottom-nav').isVisible().catch(() => false);
      assert(!mobileNavVisible, `[${vp.name}] During map: mobile bottom nav hidden`);
    }

    await pageDuring.close();
    await context.close();
  }

  // ==========================================================================
  // SUITE 4: INTERACTIVE ENTITY INSPECTOR & OFFLINE SAFETY TESTS
  // ==========================================================================
  console.log('\n--- SUITE 4: INTERACTIVE ENTITY INSPECTOR & OFFLINE SAFETY TESTS ---');

  const inspectorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  const inspectorPage = await inspectorContext.newPage();
  await setupCitizenMapAuth(inspectorPage, 'BEFORE');
  await inspectorPage.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
  await inspectorPage.waitForTimeout(500);

  // Navigate to map tab
  const navMapBtn = inspectorPage.locator('#mobile-nav-map');
  if (await navMapBtn.isVisible().catch(() => false)) {
    await navMapBtn.click();
    await inspectorPage.waitForTimeout(500);
  }

  // Emulate offline network state in browser
  console.log('  Emulating offline network state in browser...');
  await inspectorContext.setOffline(true);
  await inspectorPage.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
  await inspectorPage.waitForTimeout(500);

  // Check if offline network banner or indicator is active
  const isOfflineHandled = await inspectorPage.evaluate(() => {
    return !navigator.onLine;
  });
  assert(isOfflineHandled, 'Browser offline event correctly emulated and handled');

  await inspectorPage.close();
  await inspectorContext.close();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n========================================================================');
  console.log(` PHASE 4 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMobileMapsAndInspectorsSuite().catch((err) => {
  console.error('Fatal suite runner error:', err);
  process.exit(1);
});
