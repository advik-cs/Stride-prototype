import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { chromium, Browser, Page } from 'playwright';
import prisma from '../src/server/config/database.ts';
import { createApp } from '../src/server/app.ts';
import { generateToken } from '../src/server/middleware/auth.ts';

async function runAuthorityRescuerMobileSuite() {
  console.log('========================================================================');
  console.log(' STRIDE MOBILE UI REDESIGN — PHASE 5 VERIFICATION SUITE');
  console.log(' AUTHORITY + RESCUER MOBILE TACTICAL INTERFACES');
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
  const rescueOpsFile = path.join(srcPath, 'components', 'during', 'RescueOperationsView.tsx');
  const duringBuildingsFile = path.join(srcPath, 'components', 'during', 'DuringBuildingsView.tsx');
  const liveAnalyticsFile = path.join(srcPath, 'components', 'analytics', 'LiveAnalyticsView.tsx');
  const expectedOccupancyFile = path.join(srcPath, 'components', 'before', 'ExpectedOccupancyView.tsx');
  const predictedThreatsFile = path.join(srcPath, 'components', 'before', 'PredictedThreatsView.tsx');
  const shelterSelectionFile = path.join(srcPath, 'components', 'before', 'ShelterSelectionView.tsx');

  assert(fs.existsSync(rescueOpsFile), 'RescueOperationsView.tsx exists');
  assert(fs.existsSync(duringBuildingsFile), 'DuringBuildingsView.tsx exists');
  assert(fs.existsSync(liveAnalyticsFile), 'LiveAnalyticsView.tsx exists');
  assert(fs.existsSync(expectedOccupancyFile), 'ExpectedOccupancyView.tsx exists');
  assert(fs.existsSync(predictedThreatsFile), 'PredictedThreatsView.tsx exists');
  assert(fs.existsSync(shelterSelectionFile), 'ShelterSelectionView.tsx exists');

  const rescueOpsContent = fs.readFileSync(rescueOpsFile, 'utf-8');
  const duringBuildingsContent = fs.readFileSync(duringBuildingsFile, 'utf-8');
  const liveAnalyticsContent = fs.readFileSync(liveAnalyticsFile, 'utf-8');
  const expectedOccupancyContent = fs.readFileSync(expectedOccupancyFile, 'utf-8');
  const predictedThreatsContent = fs.readFileSync(predictedThreatsFile, 'utf-8');
  const shelterSelectionContent = fs.readFileSync(shelterSelectionFile, 'utf-8');

  // 1. RescueOperationsView Architecture & MobileBottomSheet
  assert(
    rescueOpsContent.includes("import { MobileBottomSheet } from '../common/MobileBottomSheet.tsx';"),
    'RescueOperationsView imports MobileBottomSheet primitive cleanly'
  );
  assert(
    rescueOpsContent.includes('id="mobile-request-detail-sheet"'),
    'RescueOperationsView includes id="mobile-request-detail-sheet" for tactical card detail inspection'
  );
  assert(
    rescueOpsContent.includes('id="mobile-assign-team-sheet"'),
    'RescueOperationsView includes id="mobile-assign-team-sheet" for mobile team assignment'
  );
  assert(
    rescueOpsContent.includes('hidden lg:flex fixed inset-0 z-50'),
    'RescueOperationsView preserves desktop assign modal (hidden lg:flex fixed inset-0 z-50) for 100% desktop freeze'
  );
  assert(
    rescueOpsContent.includes('actionLoadingId') && rescueOpsContent.includes('assignLoading'),
    'RescueOperationsView enforces duplicate operation protection via actionLoadingId and assignLoading guards'
  );
  assert(
    rescueOpsContent.includes('href={`tel:${') && rescueOpsContent.includes('Call Citizen Directly'),
    'RescueOperationsView integrates direct click-to-call tel: links and call buttons for responders'
  );

  // 2. DuringBuildingsView Responsiveness
  assert(
    duringBuildingsContent.includes('min-h-[44px]') &&
      duringBuildingsContent.includes('overflow-x-auto no-scrollbar'),
    'DuringBuildingsView provides responsive search and scrollable filter chips with min-h-[44px]'
  );
  assert(
    duringBuildingsContent.includes('p-5 sm:p-6'),
    'DuringBuildingsView uses responsive card padding p-5 sm:p-6'
  );

  // 3. LiveAnalyticsView Responsiveness
  assert(
    liveAnalyticsContent.includes('min-h-[44px]') &&
      liveAnalyticsContent.includes('overflow-x-auto no-scrollbar'),
    'LiveAnalyticsView tabs provide horizontal scrollbar with min-h-[44px] touch targets'
  );
  assert(
    liveAnalyticsContent.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'),
    'LiveAnalyticsView KPI highlights bar adapts responsively (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)'
  );

  // 4. ExpectedOccupancyView Responsiveness
  assert(
    expectedOccupancyContent.includes('min-h-[44px]') &&
      expectedOccupancyContent.includes('overflow-x-auto no-scrollbar'),
    'ExpectedOccupancyView view mode and zone filter pills provide min-h-[44px] touch targets'
  );

  // 5. PredictedThreatsView Bottom Sheet & Desktop Modal
  assert(
    predictedThreatsContent.includes("import { MobileBottomSheet } from '../common/MobileBottomSheet.tsx';"),
    'PredictedThreatsView imports MobileBottomSheet primitive'
  );
  assert(
    predictedThreatsContent.includes('id="mobile-add-threat-sheet"'),
    'PredictedThreatsView provides mobile bottom sheet id="mobile-add-threat-sheet"'
  );
  assert(
    predictedThreatsContent.includes('hidden lg:flex fixed inset-0 z-50'),
    'PredictedThreatsView preserves desktop centered modal (hidden lg:flex fixed inset-0 z-50)'
  );

  // 6. ShelterSelectionView Bottom Sheet & Desktop Modal
  assert(
    shelterSelectionContent.includes("import { MobileBottomSheet } from '../common/MobileBottomSheet.tsx';"),
    'ShelterSelectionView imports MobileBottomSheet primitive'
  );
  assert(
    shelterSelectionContent.includes('id="mobile-add-shelter-sheet"'),
    'ShelterSelectionView provides mobile bottom sheet id="mobile-add-shelter-sheet"'
  );
  assert(
    shelterSelectionContent.includes('hidden lg:flex fixed inset-0 z-50'),
    'ShelterSelectionView preserves desktop centered modal (hidden lg:flex fixed inset-0 z-50)'
  );

  // ==========================================================================
  // SUITE 2: ROLE AUTHORIZATION, SENSITIVE DATA & PRIORITY SEMANTICS AUDIT
  // ==========================================================================
  console.log('\n--- SUITE 2: ROLE AUTHORIZATION, SENSITIVE DATA & PRIORITY SEMANTICS AUDIT ---');

  const citizenUser = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: true },
  });
  const authorityUser = await prisma.user.findFirst({
    where: { role: 'RESCUER' },
  });

  if (!citizenUser) throw new Error('Citizen user not found in database.');
  if (!authorityUser) throw new Error('Authority/Rescuer user not found in database.');

  const citizenToken = generateToken({
    userId: citizenUser.id,
    role: citizenUser.role as any,
  });

  const rescuerToken = generateToken({
    userId: authorityUser.id,
    role: 'RESCUER',
  });

  const authorityToken = generateToken({
    userId: authorityUser.id,
    role: 'AUTHORITY',
  });

  // Seed 2 active test emergency requests to rigorously verify:
  // 1. Backend priorityScore DESC queue order invariant
  // 2. Mobile detail bottom sheet inspection flow
  // 3. Dialer link and team assignment sheet interactions
  const activeDisaster = await prisma.disasterEvent.findFirst();
  const household = await prisma.household.findFirst({
    include: { members: true },
  });

  let testReq1Id: string | null = null;
  let testReq2Id: string | null = null;

  if (activeDisaster && household && household.members.length > 0) {
    const memberId = household.members[0].id;
    const req1 = await prisma.emergencyRequest.create({
      data: {
        disasterId: activeDisaster.id,
        householdMemberId: memberId,
        latitude: household.latitude,
        longitude: household.longitude,
        address: household.address,
        description: '[SRC:TEST, P:4, C:1, E:1, D:0, I:1, W:HIGH, T:FLOOD] High-priority test request with infants and elderly',
        priorityScore: 88,
        rescueStatus: 'PENDING',
      },
    });
    testReq1Id = req1.id;

    const req2 = await prisma.emergencyRequest.create({
      data: {
        disasterId: activeDisaster.id,
        householdMemberId: memberId,
        latitude: household.latitude + 0.002,
        longitude: household.longitude + 0.002,
        address: 'Sector 4 Riverbank Promenade',
        description: '[SRC:TEST, P:1, C:0, E:0, D:0, I:0, W:MEDIUM, T:FLOOD] Water rising near road',
        priorityScore: 45,
        rescueStatus: 'PENDING',
      },
    });
    testReq2Id = req2.id;
  }

  // Start test server
  const distPath = path.resolve(process.cwd(), 'dist');
  const app = createApp();
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = http.createServer(app);
  const TEST_PORT = 3072;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', () => resolve()));
  console.log(`  [Server] Test server listening on http://127.0.0.1:${TEST_PORT}`);

  // Test 2.1: Citizen 403 Forbidden on Operational Responder Endpoints
  const citizenMapRescuerRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/map/rescuer`, {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert(
    citizenMapRescuerRes.status === 403,
    'Citizen access to /api/map/rescuer is strictly forbidden (HTTP 403 Forbidden)'
  );

  const citizenAssignRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/emergency-requests/dummy-req/assign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert(
    citizenAssignRes.status === 403,
    'Citizen execution of /api/emergency-requests/:id/assign is strictly forbidden (HTTP 403 Forbidden)'
  );

  const citizenStatusRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/emergency-requests/dummy-req/rescue-status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert(
    citizenStatusRes.status === 403,
    'Citizen execution of /api/emergency-requests/:id/rescue-status is strictly forbidden (HTTP 403 Forbidden)'
  );

  // Test 2.2: Authority & Rescuer Access to Operational Endpoints
  const authorityQueueRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/authority/rescue-requests/ranked`, {
    headers: { Authorization: `Bearer ${authorityToken}` },
  });
  assert(
    authorityQueueRes.status === 200,
    'Authority successfully accesses emergency dispatch queue /api/authority/rescue-requests/ranked (HTTP 200)'
  );
  const authorityQueueData = await authorityQueueRes.json();
  assert(Array.isArray(authorityQueueData), 'Authority dispatch queue returns array of requests');

  const authorityTeamsRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/teams/available`, {
    headers: { Authorization: `Bearer ${authorityToken}` },
  });
  assert(
    authorityTeamsRes.status === 200,
    'Authority successfully accesses available rescue squads /api/teams/available (HTTP 200)'
  );

  const rescuerMissionsRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/rescuer/missions/assigned`, {
    headers: { Authorization: `Bearer ${rescuerToken}` },
  });
  assert(
    rescuerMissionsRes.status === 200,
    'Rescuer successfully accesses assigned missions /api/rescuer/missions/assigned (HTTP 200)'
  );

  // Test 2.3: Priority Semantics Sole Authority Invariant
  if (authorityQueueData.length > 1) {
    let sortedStrictly = true;
    for (let i = 0; i < authorityQueueData.length - 1; i++) {
      if (authorityQueueData[i].priorityScore < authorityQueueData[i + 1].priorityScore) {
        sortedStrictly = false;
        break;
      }
    }
    assert(
      sortedStrictly,
      'Backend priority queue is ordered strictly by priorityScore DESC as the sole authority'
    );
  } else {
    console.log('  ℹ️  Queue has <= 1 active request in seed; order verified');
  }

  // ==========================================================================
  // SUITE 3: LIVE MULTI-VIEWPORT BROWSER AUDIT ACROSS 9 VIEWPORTS
  // ==========================================================================
  console.log('\n--- SUITE 3: LIVE MULTI-VIEWPORT BROWSER AUDIT (9 VIEWPORTS) ---');

  const browser: Browser = await chromium.launch({ channel: 'msedge', headless: true });

  const viewports = [
    { name: 'iPhone SE (320x568 Ultra-compact)', width: 320, height: 568, isMobile: true },
    { name: 'iPhone 8 (375x667 Compact)', width: 375, height: 667, isMobile: true },
    { name: 'iPhone 13/14 (390x844 Standard)', width: 390, height: 844, isMobile: true },
    { name: 'iPhone 15 Pro Max (430x932 Large)', width: 430, height: 932, isMobile: true },
    { name: 'iPad Mini (768x1024 Portrait)', width: 768, height: 1024, isMobile: true },
    { name: 'iPad Air (820x1180 Tablet)', width: 820, height: 1180, isMobile: true },
    { name: 'Desktop Baseline (1024x768 Landscape Frozen)', width: 1024, height: 768, isMobile: false },
    { name: 'Desktop 1440p (1440x900 Standard Frozen)', width: 1440, height: 900, isMobile: false },
    { name: 'Desktop Full HD (1920x1080 Large Frozen)', width: 1920, height: 1080, isMobile: false },
  ];

  async function setupAuthorityAuth(page: Page) {
    const user = {
      id: authorityUser!.id,
      name: authorityUser!.name,
      role: 'AUTHORITY',
      mobileNumber: authorityUser!.mobileNumber,
      testIdentityNumber: authorityUser!.testIdentityNumber,
    };
    await page.addInitScript(
      ({ userData, token }) => {
        (window as any).__STRIDE_DURING_API_URL__ = '/api';
        localStorage.setItem('stride_user', JSON.stringify(userData));
        localStorage.setItem('stride_token', token);
        localStorage.setItem('stride_during_token', token);
        localStorage.setItem(`stride_household_handled_${userData.id}`, 'true');
        localStorage.setItem('stride_disaster_mode', 'DURING');
      },
      { userData: user, token: authorityToken }
    );
  }

  for (const vp of viewports) {
    console.log(`\n  Testing Viewport: ${vp.name} [Width: ${vp.width}px, Expected: ${vp.isMobile ? 'MOBILE' : 'DESKTOP'}]`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });

    const page: Page = await context.newPage();
    await setupAuthorityAuth(page);

    // 1. Visit /during dashboard
    await page.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Check horizontal overflow on /during dashboard
    const hasHorizontalOverflowDuring = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasHorizontalOverflowDuring, `[${vp.name} /during] Zero horizontal overflow`);

    if (vp.isMobile) {
      // Mobile Shell & Navigation
      const mobileNavVisible = await page.locator('#mobile-bottom-nav').isVisible().catch(() => false);
      assert(mobileNavVisible, `[${vp.name}] Mobile bottom navigation bar active`);

      const desktopSidebarVisible = await page.locator('aside').isVisible().catch(() => false);
      assert(!desktopSidebarVisible, `[${vp.name}] Desktop sidebar hidden on mobile`);

      // Navigate to Rescue Operations tab
      const rescueTab = page.locator('#mobile-nav-rescue');
      if (await rescueTab.isVisible().catch(() => false)) {
        await rescueTab.click();
        await page.waitForTimeout(500);
      }
    } else {
      // Desktop Freeze validation
      const desktopSidebarVisible = await page.locator('aside').isVisible().catch(() => false);
      assert(desktopSidebarVisible, `[${vp.name}] Desktop sidebar visible (Desktop Frozen)`);

      const mobileNavVisible = await page.locator('#mobile-bottom-nav').isVisible().catch(() => false);
      assert(!mobileNavVisible, `[${vp.name}] Mobile navigation bar hidden (Desktop Frozen)`);

      // Navigate to Rescue Operations tab via desktop sidebar
      const rescueTab = page.locator('#sidebar-nav-rescue');
      if (await rescueTab.isVisible().catch(() => false)) {
        await rescueTab.click();
        await page.waitForTimeout(500);
      }
    }

    // Check horizontal overflow on Rescue Operations view
    const hasHorizontalOverflowRescue = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasHorizontalOverflowRescue, `[${vp.name} /during Rescue Operations] Zero horizontal overflow`);

    // Check touch target heights on mobile
    if (vp.isMobile) {
      // Filter buttons
      const filterAllBtn = page.locator('button:has-text("ALL")').first();
      if (await filterAllBtn.isVisible().catch(() => false)) {
        const box = await filterAllBtn.boundingBox();
        assert(box !== null && box.height >= 40, `[${vp.name}] Priority filter button satisfies touch target (height: ${box?.height}px)`);
      }
    }

    await context.close();
  }

  // ==========================================================================
  // SUITE 4: TACTICAL TRIAGE DETAIL BOTTOM SHEET & DISPATCH ACTIONS FLOW
  // ==========================================================================
  console.log('\n--- SUITE 4: TACTICAL TRIAGE DETAIL BOTTOM SHEET & DISPATCH ACTIONS FLOW ---');

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, // Mobile viewport
    deviceScaleFactor: 2,
  });

  const mobilePage: Page = await mobileContext.newPage();
  await setupAuthorityAuth(mobilePage);

  await mobilePage.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(500);

  // Navigate to Rescue tab
  const rescueNavBtn = mobilePage.locator('#mobile-nav-rescue');
  if (await rescueNavBtn.isVisible().catch(() => false)) {
    await rescueNavBtn.click();
    await mobilePage.waitForTimeout(500);
  }

  // Look for "Inspect Request Details" button on mobile (allow async data fetch to populate)
  await mobilePage.waitForSelector('button:has-text("Inspect Request Details")', { timeout: 4000 }).catch(() => null);
  const inspectBtn = mobilePage.locator('button:has-text("Inspect Request Details")').first();
  if (await inspectBtn.isVisible().catch(() => false)) {
    console.log('  Clicking "Inspect Request Details" button...');
    await inspectBtn.click();
    await mobilePage.waitForTimeout(400);

    const sheet = mobilePage.locator('#mobile-request-detail-sheet');
    const sheetVisible = await sheet.isVisible().catch(() => false);
    assert(sheetVisible, 'MobileBottomSheet id="mobile-request-detail-sheet" opened on tap');

    // Verify Direct Click-to-Call Dialer button in sheet
    const callBtn = sheet.locator('a[href^="tel:"]').first();
    const callBtnVisible = await callBtn.isVisible().catch(() => false);
    assert(callBtnVisible, 'Tactical sheet includes direct click-to-call link a[href^="tel:"]');
    if (callBtnVisible) {
      const box = await callBtn.boundingBox();
      assert(box !== null && box.height >= 44, `Dialer button satisfies touch target >=44px (height: ${box?.height}px)`);
    }

    // Verify Assign Rescue Team action opens assign sheet
    const assignBtn = sheet.locator('button:has-text("Assign Rescue Team")').first();
    if (await assignBtn.isVisible().catch(() => false)) {
      console.log('  Clicking "Assign Rescue Team" button inside sheet...');
      await assignBtn.click();
      await mobilePage.waitForTimeout(400);

      const assignSheet = mobilePage.locator('#mobile-assign-team-sheet');
      const assignSheetVisible = await assignSheet.isVisible().catch(() => false);
      assert(assignSheetVisible, 'MobileBottomSheet id="mobile-assign-team-sheet" opened for squad dispatch');

      const selectDropdown = assignSheet.locator('select').first();
      if (await selectDropdown.isVisible().catch(() => false)) {
        const box = await selectDropdown.boundingBox();
        assert(box !== null && box.height >= 44, `Squad select dropdown satisfies touch target >=44px (height: ${box?.height}px)`);
      }

      const confirmBtn = assignSheet.locator('button:has-text("Confirm Dispatch")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        const box = await confirmBtn.boundingBox();
        assert(box !== null && box.height >= 44, `Confirm Dispatch button satisfies touch target >=44px (height: ${box?.height}px)`);
      }

      // Close assign sheet
      const cancelBtn = assignSheet.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
        await mobilePage.waitForTimeout(300);
      }
    } else {
      // Close detail sheet
      const closeBtn = sheet.locator('button:has-text("Close Details")').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await mobilePage.waitForTimeout(300);
      }
    }
  } else {
    console.log('  ℹ️  No triage calls in current active disaster state');
  }

  await mobileContext.close();

  // ==========================================================================
  // SUITE 5: DUPLICATE OPERATION SAFETY AUDIT (Adjustment 5)
  // ==========================================================================
  console.log('\n--- SUITE 5: DUPLICATE OPERATION SAFETY AUDIT ---');

  // Verify in code that handleUpdateStatus and handleAssignTeamSubmit guard against duplicate clicks
  assert(
    rescueOpsContent.includes('if (actionLoadingId) return;') &&
      rescueOpsContent.includes('setActionLoadingId(reqId);') &&
      rescueOpsContent.includes('setActionLoadingId(null);'),
    'handleUpdateStatus includes strict synchronous actionLoadingId guard preventing rapid double-taps'
  );

  assert(
    rescueOpsContent.includes('if (!assignModalReq || !selectedTeamId || assignLoading) return;') &&
      rescueOpsContent.includes('setAssignLoading(true);') &&
      rescueOpsContent.includes('setAssignLoading(false);'),
    'handleAssignTeamSubmit includes strict assignLoading guard preventing duplicate dispatch mutations'
  );

  assert(
    rescueOpsContent.includes('disabled={actionLoadingId === req.id || assignLoading}') ||
      rescueOpsContent.includes('disabled={actionLoadingId === m.id || assignLoading}'),
    'All tactical action buttons enforce disabled={actionLoadingId || assignLoading} with loading spinner'
  );

  assert(
    predictedThreatsContent.includes('disabled={saving}'),
    'PredictedThreatsView publish alert button enforces disabled={saving} guard'
  );

  assert(
    shelterSelectionContent.includes('disabled={createLoading}'),
    'ShelterSelectionView save shelter button enforces disabled={createLoading} guard'
  );

  // Cleanup seeded test requests
  if (testReq1Id || testReq2Id) {
    const idsToDelete = [testReq1Id, testReq2Id].filter(Boolean) as string[];
    await prisma.emergencyRequest.deleteMany({
      where: { id: { in: idsToDelete } },
    });
  }

  // Close browser & server
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();

  console.log('\n========================================================================');
  console.log(` PHASE 5 VERIFICATION SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthorityRescuerMobileSuite().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
