import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { chromium, Browser, Page } from 'playwright';

async function runMobileShellTestSuite() {
  console.log('========================================================================');
  console.log(' STRIDE MOBILE-FIRST UI REDESIGN — PHASE 1 VERIFICATION SUITE');
  console.log(' RESPONSIVE APPLICATION SHELL & NAVIGATION PRIMITIVES AUDIT');
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

  // --- SUITE 1: STATIC ARTIFACT & ARCHITECTURE AUDIT ---
  console.log('--- SUITE 1: STATIC ARTIFACT & COMPONENT AUDIT ---');
  const srcPath = path.resolve(process.cwd(), 'src');
  const mobileHeaderFile = path.join(srcPath, 'components', 'layout', 'MobileHeader.tsx');
  const mobileBottomNavFile = path.join(srcPath, 'components', 'layout', 'MobileBottomNav.tsx');
  const mobileDrawerFile = path.join(srcPath, 'components', 'layout', 'MobileDrawer.tsx');
  const mobileBottomSheetFile = path.join(srcPath, 'components', 'common', 'MobileBottomSheet.tsx');
  const dashboardLayoutFile = path.join(srcPath, 'components', 'layout', 'DashboardLayout.tsx');

  assert(fs.existsSync(mobileHeaderFile), 'MobileHeader.tsx component exists');
  assert(fs.existsSync(mobileBottomNavFile), 'MobileBottomNav.tsx component exists');
  assert(fs.existsSync(mobileDrawerFile), 'MobileDrawer.tsx component exists');
  assert(fs.existsSync(mobileBottomSheetFile), 'MobileBottomSheet.tsx component exists');
  assert(fs.existsSync(dashboardLayoutFile), 'DashboardLayout.tsx exists');

  const layoutContent = fs.readFileSync(dashboardLayoutFile, 'utf-8');
  assert(
    layoutContent.includes('hidden lg:flex w-64') || layoutContent.includes('hidden lg:flex'),
    'DashboardLayout gates desktop sidebar with hidden lg:flex'
  );
  assert(
    layoutContent.includes('hidden lg:flex h-16'),
    'DashboardLayout gates desktop header with hidden lg:flex'
  );
  assert(layoutContent.includes('<MobileHeader'), 'DashboardLayout renders MobileHeader');
  assert(layoutContent.includes('<MobileBottomNav'), 'DashboardLayout renders MobileBottomNav');
  assert(layoutContent.includes('<MobileDrawer'), 'DashboardLayout renders MobileDrawer');
  assert(layoutContent.includes('<MobileBottomSheet'), 'DashboardLayout renders MobileBottomSheet primitive');
  assert(
    layoutContent.includes('pb-24 lg:pb-8') || layoutContent.includes('pb-24'),
    'DashboardLayout includes mobile bottom-padding pb-24 to prevent bottom-nav occlusion'
  );

  const navContent = fs.readFileSync(mobileBottomNavFile, 'utf-8');
  assert(navContent.includes('isSosCenter'), 'MobileBottomNav includes special center SOS slot logic');
  assert(navContent.includes('safe-area-inset-bottom'), 'MobileBottomNav respects safe-area-inset-bottom');

  const sheetContent = fs.readFileSync(mobileBottomSheetFile, 'utf-8');
  assert(sheetContent.includes('safe-area-inset-bottom'), 'MobileBottomSheet respects safe-area-inset-bottom');
  assert(sheetContent.includes('Escape'), 'MobileBottomSheet supports Escape key dismissal');
  assert(sheetContent.includes('document.body.style.overflow = \'hidden\''), 'MobileBottomSheet manages body scroll locking');

  // --- SUITE 2: LIVE PLAYWRIGHT BROWSER AUDIT ACROSS ALL 8 VIEWPORTS ---
  console.log('\n--- SUITE 2: LIVE MULTI-VIEWPORT RESPONSIVE BEHAVIOR AUDIT ---');

  const distPath = path.resolve(process.cwd(), 'dist');
  const app = express();
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = http.createServer(app);
  const TEST_PORT = 3055;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', () => resolve()));
  console.log(`  [Server] Test server listening on http://127.0.0.1:${TEST_PORT}`);

  const browser: Browser = await chromium.launch({ channel: 'msedge', headless: true });

  const viewports = [
    { name: 'iPhone SE 1st (320x568)', width: 320, height: 568, isMobile: true },
    { name: 'iPhone SE 2nd (375x667)', width: 375, height: 667, isMobile: true },
    { name: 'iPhone 13/14 (390x844)', width: 390, height: 844, isMobile: true },
    { name: 'iPhone 14 Pro Max (430x932)', width: 430, height: 932, isMobile: true },
    { name: 'iPad Mini Portrait (768x1024)', width: 768, height: 1024, isMobile: true },
    { name: 'Desktop Baseline (1024x768)', width: 1024, height: 768, isMobile: false },
    { name: 'Laptop / MacBook (1440x900)', width: 1440, height: 900, isMobile: false },
    { name: 'Full HD Desktop (1920x1080)', width: 1920, height: 1080, isMobile: false },
  ];

  // Helper to inject mock auth state into page
  async function setupAuthState(page: Page, role: 'CITIZEN' | 'AUTHORITY' | 'RESCUER' = 'CITIZEN') {
    const user = {
      id: `user-${role.toLowerCase()}-1`,
      name: role === 'CITIZEN' ? 'Ramesh Iyer' : role === 'AUTHORITY' ? 'Commander Arjun Rao' : 'Inspector Rajesh Kumar',
      role,
      testIdentityNumber: role === 'CITIZEN' ? '5432 8901 2345' : role === 'AUTHORITY' ? 'AUTH-COMMAND-01' : 'RES-NDRF-88210',
    };
    await page.addInitScript((userData) => {
      localStorage.setItem('stride_user', JSON.stringify(userData));
      localStorage.setItem('stride_token', 'demo-valid-token-phase-1');
      localStorage.setItem(`stride_household_handled_${userData.id}`, 'true');
    }, user);
  }

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();
    await setupAuthState(page, 'CITIZEN');

    await page.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    console.log(`\n  Checking Viewport: ${vp.name} [Width: ${vp.width}px, Expected: ${vp.isMobile ? 'MOBILE' : 'DESKTOP'}]`);

    const mobileHeaderVisible = await page.locator('#mobile-header').isVisible().catch(() => false);
    const mobileNavVisible = await page.locator('#mobile-bottom-nav').isVisible().catch(() => false);
    const desktopSidebarVisible = await page.locator('aside').isVisible().catch(() => false);

    if (vp.isMobile) {
      assert(mobileHeaderVisible, `${vp.name}: MobileHeader is visible`);
      assert(mobileNavVisible, `${vp.name}: MobileBottomNav is visible`);
      assert(!desktopSidebarVisible, `${vp.name}: Desktop sidebar is hidden`);

      // Verify no horizontal overflow
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      assert(!hasHorizontalOverflow, `${vp.name}: Zero horizontal overflow detected`);

      // Verify touch target dimensions on MobileBottomNav (>= 44px)
      const navItemCount = await page.locator('#mobile-bottom-nav button').count();
      assert(navItemCount >= 4, `${vp.name}: MobileBottomNav renders at least 4 navigation tabs (found: ${navItemCount})`);

      const firstNavBox = await page.locator('#mobile-bottom-nav button').first().boundingBox();
      if (firstNavBox) {
        assert(firstNavBox.height >= 44, `${vp.name}: Bottom nav buttons meet min 44px touch height (actual: ${firstNavBox.height.toFixed(1)}px)`);
      }
    } else {
      assert(!mobileHeaderVisible, `${vp.name}: MobileHeader is hidden on desktop`);
      assert(!mobileNavVisible, `${vp.name}: MobileBottomNav is hidden on desktop`);
      assert(desktopSidebarVisible, `${vp.name}: Desktop sidebar is visible and preserved on desktop`);

      const desktopHeaderVisible = await page.locator('header.hidden.lg\\:flex').isVisible().catch(() => false);
      assert(desktopHeaderVisible, `${vp.name}: Desktop header is visible on desktop`);
    }

    await context.close();
  }

  // --- SUITE 3: MOBILE DRAWER & BOTTOM SHEET INTERACTION AUDIT ---
  console.log('\n--- SUITE 3: MOBILE DRAWER & BOTTOM SHEET INTERACTION AUDIT ---');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await setupAuthState(page, 'CITIZEN');

    await page.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // 1. Open Drawer via Hamburger button
    console.log('  Testing Mobile Drawer opening via hamburger button...');
    const hamburgerBtn = page.locator('#mobile-hamburger-btn');
    assert(await hamburgerBtn.isVisible(), 'Hamburger button is visible in MobileHeader');
    await hamburgerBtn.click();
    await page.waitForTimeout(300);

    const drawerVisible = await page.locator('#mobile-drawer-portal').isVisible();
    assert(drawerVisible, 'Mobile drawer opened after hamburger click');

    // 2. Check drawer content
    assert(await page.locator('#mobile-drawer-close-btn').isVisible(), 'Mobile drawer close button is visible');
    assert(await page.locator('#mobile-drawer-panel').isVisible(), 'Mobile drawer panel is visible');
    assert(await page.locator('#mobile-drawer-logout-btn').isVisible(), 'Mobile drawer profile logout button is visible');

    // 3. Close Drawer via Close button
    await page.locator('#mobile-drawer-close-btn').click();
    await page.waitForTimeout(300);
    const drawerClosed = !(await page.locator('#mobile-drawer-portal').isVisible().catch(() => false));
    assert(drawerClosed, 'Mobile drawer closed cleanly via close button');

    // 4. Open Drawer via "More" in Bottom Navigation
    console.log('  Testing Mobile Drawer opening via "More" in BottomNav...');
    const moreBtn = page.locator('#mobile-nav-more');
    if (await moreBtn.isVisible()) {
      await moreBtn.click();
      await page.waitForTimeout(300);
      assert(await page.locator('#mobile-drawer-portal').isVisible(), 'Mobile drawer opened via "More" nav button');

      // 5. Test Escape key close
      console.log('  Testing Escape key to close Mobile Drawer...');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const drawerEscClosed = !(await page.locator('#mobile-drawer-portal').isVisible().catch(() => false));
      assert(drawerEscClosed, 'Mobile drawer closed cleanly on Escape key press');
    }

    // 6. Test MobileBottomSheet Primitive
    console.log('  Testing MobileBottomSheet primitive lifecycle...');
    await page.evaluate(() => {
      if ((window as any).__STRIDE_TEST_OPEN_SHEET__) {
        (window as any).__STRIDE_TEST_OPEN_SHEET__();
      }
    });
    await page.waitForTimeout(300);

    const sheetVisible = await page.locator('#test-mobile-bottom-sheet').isVisible();
    assert(sheetVisible, 'MobileBottomSheet primitive mounted and became visible');

    const sheetContent = page.locator('#test-sheet-content');
    assert(await sheetContent.isVisible(), 'MobileBottomSheet rendered interior children correctly');

    // Verify body scroll lock
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    assert(bodyOverflow === 'hidden', 'MobileBottomSheet successfully locked body scroll (overflow: hidden)');

    // Dismiss sheet via Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const sheetClosed = !(await page.locator('#test-mobile-bottom-sheet').isVisible().catch(() => false));
    assert(sheetClosed, 'MobileBottomSheet closed cleanly on Escape key');

    const bodyOverflowRestored = await page.evaluate(() => document.body.style.overflow);
    assert(bodyOverflowRestored !== 'hidden', 'MobileBottomSheet restored body scroll after dismissal');

    await context.close();
  }

  // --- SUITE 4: ROLE-SPECIFIC & MODE-SPECIFIC NAVIGATION AUDIT ---
  console.log('\n--- SUITE 4: ROLE-SPECIFIC & MODE-SPECIFIC NAVIGATION AUDIT ---');
  {
    // A. Citizen in DURING mode: Verify prominent SOS center slot
    const citizenContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const citizenPage = await citizenContext.newPage();
    await setupAuthState(citizenPage, 'CITIZEN');

    await citizenPage.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
    await citizenPage.waitForTimeout(400);

    const sosSlot = citizenPage.locator('#mobile-nav-sos');
    assert(await sosSlot.isVisible(), 'Citizen in DURING mode has prominent elevated center SOS button (#mobile-nav-sos)');

    const sosClasses = (await sosSlot.getAttribute('class')) || '';
    assert(sosClasses.includes('bg-red-600') && sosClasses.includes('rounded-full'), 'SOS button features high-visibility red rounded-full styling');

    await citizenContext.close();

    // B. Authority in DURING mode: Verify Rescue Queue & Analytics tabs
    const authContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const authPage = await authContext.newPage();
    await setupAuthState(authPage, 'AUTHORITY');

    await authPage.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
    await authPage.waitForTimeout(400);

    assert(await authPage.locator('#mobile-nav-rescue').isVisible(), 'Authority DURING bottom-nav includes Rescue Operations tab');
    assert(await authPage.locator('#mobile-nav-analytics').isVisible(), 'Authority DURING bottom-nav includes Live Analytics tab');
    assert(!(await authPage.locator('#mobile-nav-sos').isVisible().catch(() => false)), 'Authority DURING bottom-nav does NOT show Citizen SOS button');

    await authContext.close();

    // C. Rescuer in DURING mode: Verify Missions & Hospitals tabs
    const rescuerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const rescuerPage = await rescuerContext.newPage();
    await setupAuthState(rescuerPage, 'RESCUER');

    await rescuerPage.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
    await rescuerPage.waitForTimeout(400);

    assert(await rescuerPage.locator('#mobile-nav-rescue').isVisible(), 'Rescuer DURING bottom-nav includes Missions (rescue) tab');
    assert(await rescuerPage.locator('#mobile-nav-buildings').isVisible(), 'Rescuer DURING bottom-nav includes Buildings tab');
    assert(await rescuerPage.locator('#mobile-nav-hospitals').isVisible(), 'Rescuer DURING bottom-nav includes Hospitals tab');

    await rescuerContext.close();
  }

  // --- SUITE 5: DESKTOP FREEZE INVARIANT AUDIT (1920x1080) ---
  console.log('\n--- SUITE 5: DESKTOP FREEZE INVARIANT AUDIT (1920x1080) ---');
  {
    const desktopContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const desktopPage = await desktopContext.newPage();
    await setupAuthState(desktopPage, 'CITIZEN');

    await desktopPage.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
    await desktopPage.waitForTimeout(400);

    // Desktop sidebar checks
    const aside = desktopPage.locator('aside');
    assert(await aside.isVisible(), 'Desktop sidebar is visible');
    const asideBox = await aside.boundingBox();
    assert(asideBox !== null && asideBox.width >= 256, `Desktop sidebar width preserved (actual: ${asideBox?.width.toFixed(1)}px >= 256px)`);

    // Desktop header checks
    const header = desktopPage.locator('header.hidden.lg\\:flex');
    assert(await header.isVisible(), 'Desktop top header bar is visible');
    const headerBox = await header.boundingBox();
    assert(headerBox !== null && headerBox.height >= 60, `Desktop top header height preserved (actual: ${headerBox?.height.toFixed(1)}px)`);

    // Mobile components strictly hidden on desktop
    const mobileHeaderHidden = await desktopPage.evaluate(() => {
      const el = document.getElementById('mobile-header');
      if (!el) return true;
      return window.getComputedStyle(el).display === 'none';
    });
    assert(mobileHeaderHidden, 'MobileHeader computed style is display: none on desktop');

    const mobileNavHidden = await desktopPage.evaluate(() => {
      const el = document.getElementById('mobile-bottom-nav');
      if (!el) return true;
      return window.getComputedStyle(el).display === 'none';
    });
    assert(mobileNavHidden, 'MobileBottomNav computed style is display: none on desktop');

    await desktopContext.close();
  }

  await browser.close();
  server.close();

  console.log('\n========================================================================');
  console.log(` FINAL SUITE RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMobileShellTestSuite().catch((err) => {
  console.error('Test suite execution failed with unhandled error:', err);
  process.exit(1);
});
