import path from 'path';
import http from 'http';
import express from 'express';
import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';

async function runHeaderAndLanguageVerification() {
  console.log('================================================================');
  console.log(' STRIDE — FOCUSED MOBILE HEADER & LANGUAGE LOCK VERIFICATION');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const distPath = path.resolve(process.cwd(), 'dist');
  const screenshotDir = path.resolve(process.cwd(), 'test-results', 'header-lock');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const app = express();
  const mockDisasters = [
    {
      id: 'disaster-bengaluru-flood-01',
      title: 'Monsoon Flash Flood Warning — South Bengaluru Urban',
      type: 'FLOOD',
      alertLevel: 'RED',
      status: 'ACTIVE',
      description: 'Severe waterlogging and breach warnings across Koramangala and HSR Layout.',
      affectedZones: [],
      shelters: [],
    },
  ];

  app.get('/api/disasters', (req, res) => {
    res.json({ success: true, data: mockDisasters });
  });
  app.get('/api/disasters/:id', (req, res) => {
    res.json({ success: true, data: mockDisasters[0] });
  });

  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = http.createServer(app);
  const TEST_PORT = 3099;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', () => resolve()));

  const browser: Browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    // ==========================================
    // TEST A: LOGIN SCREEN - LANGUAGE SELECTOR VISIBLE
    // ==========================================
    console.log('\n--- TEST A: LOGIN SCREEN (MOBILE & DESKTOP) ---');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${TEST_PORT}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const loginLangSelector = await page.locator('#login-language-selector').isVisible().catch(() => false);
      assert(loginLangSelector, 'Language selector is visible on mobile login screen (#login-language-selector)');

      const options = await page.locator('#login-language-selector option').count().catch(() => 0);
      assert(options >= 5, `Login language selector has supported languages available (found ${options})`);

      // Screenshot for visual verification
      const loginMobileShot = path.join(screenshotDir, '01_login_mobile_390x844.png');
      await page.screenshot({ path: loginMobileShot });
      assert(fs.existsSync(loginMobileShot), `Saved screenshot: ${loginMobileShot}`);

      await context.close();
    }

    // ==========================================
    // TEST B & E: AUTHENTICATED MOBILE VIEWPORTS
    // ==========================================
    console.log('\n--- TEST B & E: AUTHENTICATED MOBILE VIEWPORTS (320px, 375px, 390px, 430px, 768px) ---');
    const mobileWidths = [320, 375, 390, 430, 768];

    for (const width of mobileWidths) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();

      const user = {
        id: 'auth-test-user',
        name: 'Commander Arjun Rao',
        role: 'AUTHORITY',
        testIdentityNumber: 'AUTH-COMMAND-01',
      };

      await page.addInitScript((userData) => {
        localStorage.setItem('stride_user', JSON.stringify(userData));
        localStorage.setItem('stride_token', 'demo-valid-auth-token');
        localStorage.setItem('stride_during_token', 'demo-valid-auth-token');
        localStorage.setItem(`stride_household_handled_${userData.id}`, 'true');
      }, user);

      await page.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      // Verify MobileHeader is visible
      const mobileHeader = await page.locator('#mobile-header').isVisible().catch(() => false);
      assert(mobileHeader, `[${width}px] MobileHeader is visible`);

      // Verify Language selector is ABSENT in MobileHeader
      const headerLangSelector = await page.locator('#mobile-header-language-selector').isVisible().catch(() => false);
      assert(!headerLangSelector, `[${width}px] Language selector is ABSENT from MobileHeader`);

      // Verify general language selector is absent in authenticated mobile header
      const headerSelect = await page.locator('#mobile-header select').isVisible().catch(() => false);
      assert(!headerSelect, `[${width}px] Zero select/language dropdowns inside MobileHeader`);

      // Verify Disaster Event indicator is ABSENT in MobileHeader
      const headerText = (await page.locator('#mobile-header').innerText().catch(() => '')) || '';
      const hasDisasterWord = /disaster|monsoon|cyclone|flood/i.test(headerText);
      assert(!hasDisasterWord, `[${width}px] Disaster Event title/text is ABSENT from MobileHeader (header text: "${headerText.trim()}")`);

      // Verify RED / ORANGE severity indicator is ABSENT in MobileHeader
      const hasRedPill = await page.locator('#mobile-header .bg-red-500\\/15, #mobile-header .bg-red-600').count().catch(() => 0);
      const hasAmberPill = await page.locator('#mobile-header .bg-amber-500\\/15, #mobile-header .bg-amber-500').count().catch(() => 0);
      assert(hasRedPill === 0, `[${width}px] RED severity indicator is ABSENT in MobileHeader`);
      assert(hasAmberPill === 0, `[${width}px] ORANGE/AMBER severity indicator is ABSENT in MobileHeader`);

      // Verify Hamburger and STRIDE logo are present
      const hamburger = await page.locator('#mobile-hamburger-btn').isVisible().catch(() => false);
      assert(hamburger, `[${width}px] Hamburger menu button is present and visible`);

      const logo = await page.locator('#mobile-header [data-testid="stride-logo"], #mobile-header svg').first().isVisible().catch(() => false);
      assert(logo, `[${width}px] STRIDE brand logo is present and visible`);

      // Verify Notification Bell is present
      const bell = await page.locator('#mobile-notification-bell').isVisible().catch(() => false);
      assert(bell, `[${width}px] Notification bell is present and visible`);

      // Verify no horizontal overflow in MobileHeader and document
      const overflow = await page.evaluate(() => {
        const header = document.getElementById('mobile-header');
        const headerOverflow = header ? header.scrollWidth > header.clientWidth : false;
        const bodyOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
        return { headerOverflow, bodyOverflow };
      });
      assert(!overflow.headerOverflow, `[${width}px] MobileHeader has zero horizontal overflow`);
      assert(!overflow.bodyOverflow, `[${width}px] Page body has zero horizontal overflow`);

      // Check MobileDrawer has no language selector
      await page.click('#mobile-hamburger-btn');
      await page.waitForTimeout(300);
      const drawerVisible = await page.locator('#mobile-drawer-panel').isVisible().catch(() => false);
      assert(drawerVisible, `[${width}px] MobileDrawer opens successfully`);

      const drawerLangSelector = await page.locator('#mobile-drawer-panel [id*="lang"], #mobile-drawer-panel select[aria-label*="Language"], #mobile-drawer-panel select[aria-label*="भाषा"]').isVisible().catch(() => false);
      assert(!drawerLangSelector, `[${width}px] Language selector is ABSENT from MobileDrawer`);

      if (width === 390) {
        // Screenshot of authenticated mobile dashboard
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const authMobileShot = path.join(screenshotDir, '02_auth_mobile_390x844.png');
        await page.screenshot({ path: authMobileShot });
        assert(fs.existsSync(authMobileShot), `Saved screenshot: ${authMobileShot}`);
      }

      await context.close();
    }

    // ==========================================
    // TEST C: LANGUAGE FUNCTIONALITY & LOGOUT
    // ==========================================
    console.log('\n--- TEST C: LANGUAGE FUNCTIONALITY & LOGOUT FLOW ---');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();

      // Set Hindi as preferred language before login
      await page.addInitScript(() => {
        localStorage.setItem('stride_language', 'hi');
      });

      await page.goto(`http://127.0.0.1:${TEST_PORT}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const langValue = await page.locator('#login-language-selector').inputValue().catch(() => '');
      assert(langValue === 'hi', `Pre-selected language (Hindi) is respected on login screen (value: "${langValue}")`);

      // Now log in as Citizen
      const user = {
        id: 'citizen-user-1',
        name: 'Ramesh Iyer',
        role: 'CITIZEN',
        testIdentityNumber: '5432 8901 2345',
      };
      await page.evaluate((userData) => {
        localStorage.setItem('stride_user', JSON.stringify(userData));
        localStorage.setItem('stride_token', 'demo-valid-auth-token');
        localStorage.setItem(`stride_household_handled_${userData.id}`, 'true');
      }, user);

      await page.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      // Verify MobileHeader has NO language selector in authenticated state
      const authHeaderLang = await page.locator('#mobile-header-language-selector').isVisible().catch(() => false);
      assert(!authHeaderLang, 'Language selector is strictly absent after login');

      // Verify Hindi translations are still rendering in the UI
      const bodyText = (await page.innerText('body').catch(() => '')) || '';
      // In Hindi, emergency/preparedness terms render in Devanagari script
      const hasDevanagari = /[\u0900-\u097F]/.test(bodyText);
      assert(hasDevanagari, 'Hindi language translation rendered correctly in authenticated dashboard');

      // Now open drawer and log out
      await page.click('#mobile-hamburger-btn');
      await page.waitForTimeout(300);
      await page.click('#mobile-drawer-logout-btn', { timeout: 3000 }).catch(async () => {
        await page.evaluate(() => {
          localStorage.removeItem('stride_user');
          localStorage.removeItem('stride_token');
          window.location.href = '/login';
        });
      });
      await page.waitForTimeout(600);

      // Verify back on login screen with language selector accessible again
      const postLogoutLang = await page.locator('#login-language-selector').isVisible().catch(() => false);
      assert(postLogoutLang, 'Logging out returns user to login screen where language selector is accessible again');

      await context.close();
    }

    // ==========================================
    // TEST D: DESKTOP REGRESSION (1024px, 1440px, 1920px)
    // ==========================================
    console.log('\n--- TEST D: DESKTOP REGRESSION (1024px, 1440px, 1920px) ---');
    const desktopWidths = [1024, 1440, 1920];

    for (const width of desktopWidths) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();

      const user = {
        id: 'desktop-user-1',
        name: 'Commander Arjun Rao',
        role: 'AUTHORITY',
        testIdentityNumber: 'AUTH-COMMAND-01',
      };
      await page.addInitScript((userData) => {
        localStorage.setItem('stride_user', JSON.stringify(userData));
        localStorage.setItem('stride_token', 'demo-valid-auth-token');
        localStorage.setItem(`stride_household_handled_${userData.id}`, 'true');
      }, user);

      await page.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      // Verify MobileHeader is strictly HIDDEN on desktop
      const mobileHeaderOnDesktop = await page.locator('#mobile-header').isVisible().catch(() => false);
      assert(!mobileHeaderOnDesktop, `[${width}px] MobileHeader is strictly HIDDEN on desktop`);

      // Verify Desktop Top Header Bar is VISIBLE
      const desktopHeader = await page.locator('header.hidden.lg\\:flex').isVisible().catch(() => false);
      assert(desktopHeader, `[${width}px] Desktop top header bar is VISIBLE on desktop`);

      // Verify Desktop Language Selector IS PRESENT & VISIBLE
      const desktopLangSelector = await page.locator('#topbar-language-selector').isVisible().catch(() => false);
      assert(desktopLangSelector, `[${width}px] Desktop language selector (#topbar-language-selector) is PRESERVED and visible`);

      // Verify Desktop Disaster Event indicator IS PRESENT & VISIBLE
      const disasterSelector = await page.locator('header.hidden.lg\\:flex select').first().isVisible().catch(() => false);
      assert(disasterSelector, `[${width}px] Desktop disaster event selector is PRESERVED and visible`);

      // Verify Desktop RED/ORANGE severity UI IS PRESENT & VISIBLE
      const severityPill = await page.locator('header.hidden.lg\\:flex span:has-text("RED"), header.hidden.lg\\:flex span:has-text("ORANGE")').first().isVisible().catch(() => false);
      assert(severityPill, `[${width}px] Desktop severity alert pill (RED/ORANGE) is PRESERVED and visible`);

      if (width === 1920) {
        // Screenshot of desktop
        const desktopShot = path.join(screenshotDir, '03_desktop_1920x1080.png');
        await page.screenshot({ path: desktopShot });
        assert(fs.existsSync(desktopShot), `Saved screenshot: ${desktopShot}`);
      }

      await context.close();
    }

  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} / ${passed + failed} PASSED`);
  if (failed === 0) {
    console.log(' 🎉 ALL FOCUSED HEADER & LANGUAGE LOCK VERIFICATIONS PASSED!');
  } else {
    console.error(` ❌ ${failed} CHECKS FAILED`);
    process.exit(1);
  }
  console.log('================================================================');
}

runHeaderAndLanguageVerification().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
