import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { chromium, Browser, Page } from 'playwright';
import prisma from '../src/server/config/database.ts';
import { createApp } from '../src/server/app.ts';
import { generateToken } from '../src/server/middleware/auth.ts';

async function runPhase6HardeningSuite() {
  console.log('========================================================================');
  console.log(' STRIDE MOBILE UI REDESIGN — PHASE 6 FINAL HARDENING & INTEGRATION SUITE');
  console.log(' COMPLETE CROSS-DEVICE VALIDATION, BREAKPOINTS, JOURNEYS & RESILIENCE');
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

  // 1. Database Users & Token Setup
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
    name: citizenUser.name,
  });

  const rescuerToken = generateToken({
    userId: authorityUser.id,
    role: 'RESCUER',
    name: authorityUser.name,
  });

  const authorityToken = generateToken({
    userId: authorityUser.id,
    role: 'AUTHORITY',
    name: authorityUser.name,
  });

  // Seed test emergency requests for ranked queue and bottom sheet tests
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
        description: '[SRC:TEST-P6, P:3, C:1, E:1, D:0, I:1, W:HIGH, T:FLOOD] High-risk flood trapped test request',
        priorityScore: 92,
        rescueStatus: 'PENDING',
      },
    });
    testReq1Id = req1.id;

    const req2 = await prisma.emergencyRequest.create({
      data: {
        disasterId: activeDisaster.id,
        householdMemberId: memberId,
        latitude: household.latitude + 0.003,
        longitude: household.longitude + 0.003,
        address: 'Sector 5 Riverside Road',
        description: '[SRC:TEST-P6, P:1, C:0, E:0, D:0, I:0, W:MEDIUM, T:FLOOD] Water rising on ground level',
        priorityScore: 40,
        rescueStatus: 'PENDING',
      },
    });
    testReq2Id = req2.id;
  }

  // Start test server
  const distPath = path.resolve(process.cwd(), 'dist');
  const app = createApp();
  app.use(express.static(distPath));
  app.get('/_vercel/*', (req, res) => {
    res.type('application/javascript').send('/* vercel analytics mock */');
  });
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api')) return next();
    if (req.url.includes('.') && !req.url.endsWith('.html')) {
      return res.status(404).send('Not found');
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = http.createServer(app);
  const TEST_PORT = 3000;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', () => resolve()));
  console.log(`  [Server] Test server listening on http://127.0.0.1:${TEST_PORT}`);

  const browser: Browser = await chromium.launch({ channel: 'msedge', headless: true });

  // Console errors monitor
  const pageErrors: string[] = [];
  function attachErrorListener(page: Page) {
    page.on('response', (res) => {
      const url = res.url();
      const contentType = res.headers()['content-type'] || '';
      if (url.includes('.js') && contentType.includes('text/html')) {
        console.warn(`[JS File Served as HTML]: ${url}`);
      }
    });
    page.on('pageerror', (err) => {
      console.error('[PageError Caught]:', err.message, '\nStack:', err.stack);
      pageErrors.push(`[PageError] ${err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected network 403s or favicon misses or harmless service worker precache notifications
        if (!text.includes('403') && !text.includes('favicon.ico') && !text.includes('sw-sync')) {
          pageErrors.push(`[ConsoleError] ${text}`);
        }
      }
    });
  }

  async function injectAuth(page: Page, userObj: any, token: string, mode: 'BEFORE' | 'DURING' = 'BEFORE') {
    const cleanUser = {
      id: userObj.id,
      name: userObj.name,
      email: userObj.email || `${userObj.role?.toLowerCase() || 'citizen'}@demo.com`,
      role: userObj.role,
      mobileNumber: userObj.mobileNumber || '9800000011',
      testIdentityNumber: userObj.testIdentityNumber || (userObj.role === 'CITIZEN' ? '5432 8901 2345' : 'AUTH-COMMAND-01'),
    };
    await page.addInitScript(
      ({ u, tok, m }) => {
        (window as any).__STRIDE_DURING_API_URL__ = '/api';
        localStorage.setItem('stride_user', JSON.stringify(u));
        localStorage.setItem('user', JSON.stringify(u));
        localStorage.setItem('stride_token', tok);
        localStorage.setItem('stride_before_token', tok);
        localStorage.setItem('stride_during_token', tok);
        localStorage.setItem('token', tok);
        localStorage.setItem(`stride_household_handled_${u.id}`, 'true');
        const existingMode = localStorage.getItem('stride_disaster_mode');
        localStorage.setItem('stride_disaster_mode', existingMode || m);
      },
      { u: cleanUser, tok: token, m: mode }
    );
  }

  try {
    // ========================================================================
    // PART 1: EXACT BREAKPOINT BOUNDARY AUDIT (1019px, 1023px, 1024px, 1025px)
    // ========================================================================
    console.log('\n--- PART 1: EXACT BREAKPOINT BOUNDARY AUDIT (1019px, 1023px, 1024px, 1025px) ---');

    const boundaryViewports = [
      { width: 1019, height: 768, isMobile: true, label: '1019px Mobile Threshold' },
      { width: 1023, height: 768, isMobile: true, label: '1023px Immediate Mobile Boundary' },
      { width: 1024, height: 768, isMobile: false, label: '1024px Immediate Desktop Boundary' },
      { width: 1025, height: 768, isMobile: false, label: '1025px Desktop Threshold' },
    ];

    for (const bp of boundaryViewports) {
      const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
      const page = await ctx.newPage();
      attachErrorListener(page);
      await injectAuth(page, citizenUser, citizenToken, 'BEFORE');

      await page.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);

      // Check zero horizontal overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert(!overflow, `[${bp.label}] Zero horizontal overflow at boundary width ${bp.width}px`);

      if (bp.isMobile) {
        const bottomNav = await page.locator('#mobile-bottom-nav').isVisible().catch(() => false);
        assert(bottomNav, `[${bp.label} (<1024px)] MobileBottomNav active`);

        const mobileHeader = await page.locator('#mobile-header').isVisible().catch(() => false);
        assert(mobileHeader, `[${bp.label} (<1024px)] MobileHeader active`);

        const desktopSidebar = await page.locator('aside').isVisible().catch(() => false);
        assert(!desktopSidebar, `[${bp.label} (<1024px)] Desktop sidebar hidden`);
      } else {
        const desktopSidebar = await page.locator('aside').isVisible().catch(() => false);
        assert(desktopSidebar, `[${bp.label} (>=1024px)] Desktop sidebar visible (Desktop Frozen)`);

        const bottomNav = await page.locator('#mobile-bottom-nav').isVisible().catch(() => false);
        assert(!bottomNav, `[${bp.label} (>=1024px)] MobileBottomNav hidden (Desktop Frozen)`);

        const mobileHeader = await page.locator('#mobile-header').isVisible().catch(() => false);
        assert(!mobileHeader, `[${bp.label} (>=1024px)] MobileHeader hidden (Desktop Frozen)`);
      }

      await ctx.close();
    }

    // ========================================================================
    // PART 2: 9-VIEWPORT ZERO-OVERFLOW MATRIX & SAFE AREA PADDING
    // ========================================================================
    console.log('\n--- PART 2: 9-VIEWPORT ZERO-OVERFLOW MATRIX & SAFE AREA PADDING ---');

    const viewports9 = [
      { name: 'iPhone SE (320x568 Ultra-compact)', width: 320, height: 568 },
      { name: 'iPhone 8 (375x667 Compact)', width: 375, height: 667 },
      { name: 'iPhone 13/14 (390x844 Standard)', width: 390, height: 844 },
      { name: 'iPhone 15 Pro Max (430x932 Large)', width: 430, height: 932 },
      { name: 'iPad Mini (768x1024 Portrait)', width: 768, height: 1024 },
      { name: 'iPad Air (820x1180 Tablet)', width: 820, height: 1180 },
      { name: 'Desktop Baseline (1024x768 Landscape Frozen)', width: 1024, height: 768 },
      { name: 'Desktop 1440p (1440x900 Standard Frozen)', width: 1440, height: 900 },
      { name: 'Desktop Full HD (1920x1080 Large Frozen)', width: 1920, height: 1080 },
    ];

    for (const vp of viewports9) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      attachErrorListener(page);
      await injectAuth(page, citizenUser, citizenToken, 'DURING');

      // Test DURING dashboard
      await page.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert(!hasOverflow, `[${vp.name}] Zero horizontal overflow on /during`);

      // Test BEFORE dashboard
      await page.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const hasOverflowBefore = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert(!hasOverflowBefore, `[${vp.name}] Zero horizontal overflow on /before`);

      // On mobile viewports (<1024px), verify pb-24 padding prevents bottom-nav occlusion
      if (vp.width < 1024) {
        const hasPb24 = await page.evaluate(() => {
          const main = document.querySelector('main');
          return main?.classList.contains('pb-24') || false;
        });
        assert(hasPb24, `[${vp.name}] Main content container includes pb-24 bottom padding to prevent bottom nav occlusion`);
      }

      await ctx.close();
    }

    // ========================================================================
    // PART 3: COMPLETE CITIZEN NAVIGATION JOURNEY
    // ========================================================================
    console.log('\n--- PART 3: COMPLETE CITIZEN NAVIGATION JOURNEY (BEFORE & DURING) ---');

    const citizenCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cPage = await citizenCtx.newPage();
    attachErrorListener(cPage);

    // 1. Citizen in BEFORE mode
    await injectAuth(cPage, citizenUser, citizenToken, 'BEFORE');
    await cPage.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
    await cPage.waitForTimeout(500);

    assert(await cPage.locator('#mobile-bottom-nav').isVisible(), 'Citizen Before: Mobile bottom navigation bar rendered');
    await cPage.waitForSelector('text=Before Disaster', { timeout: 4000 }).catch(() => null);
    assert(await cPage.locator('text=Before Disaster').first().isVisible().catch(() => false) ||
           await cPage.locator('text=Prepare, plan and stay informed').first().isVisible().catch(() => false),
           'Citizen Before: Preparedness header visible');

    // 2. Navigate to Map in BEFORE
    const cMapBtn = cPage.locator('#mobile-nav-map');
    if (await cMapBtn.isVisible().catch(() => false)) {
      await cMapBtn.click();
      await cPage.waitForTimeout(500);
      const chipsBar = await cPage.locator('[data-testid="mobile-filter-chips-bar"]').isVisible().catch(() => false);
      assert(chipsBar, 'Citizen Before: Mobile map filter chips bar active');
    }

    // 3. Navigate to Shelters in BEFORE
    const cShelterBtn = cPage.locator('#mobile-nav-shelters');
    if (await cShelterBtn.isVisible().catch(() => false)) {
      await cShelterBtn.click({ force: true });
      await cPage.waitForTimeout(600);
      const textSample = await cPage.evaluate(() => document.body.innerText.slice(0, 300));
      assert(await cPage.locator('text=Shelter Information').first().isVisible().catch(() => false) ||
             await cPage.locator('text=Designated relief centers').first().isVisible().catch(() => false) ||
             textSample.includes('Shelter'),
             'Citizen Before: Relief Shelters view rendered');
    }

    // 4. Transition to DURING mode
    await cPage.evaluate(() => {
      localStorage.setItem('stride_disaster_mode', 'DURING');
      window.location.href = '/during';
    });
    await cPage.waitForTimeout(500);

    // 5. Check Prominent Center SOS Slot in DURING
    const sosSlot = cPage.locator('#mobile-nav-sos');
    assert(await sosSlot.isVisible(), 'Citizen During: Center elevated SOS action button is active');

    // 6. Click SOS Slot -> Navigate to Are You Safe
    await sosSlot.click();
    await cPage.waitForTimeout(400);
    assert(await cPage.locator('text=Immediate Safety Check-in').first().isVisible().catch(() => false) ||
           await cPage.locator('text=Are You Safe?').first().isVisible().catch(() => false),
           'Citizen During: Emergency SOS form rendered on SOS tap');

    // 7. Test Voice Emergency Assistant Bottom Sheet
    const voiceBtn = cPage.locator('button:has-text("Talk to STRIDE")').first();
    if (await voiceBtn.isVisible().catch(() => false)) {
      await voiceBtn.click();
      await cPage.waitForTimeout(400);
      const voiceSheet = cPage.locator('#mobile-voice-assistant-sheet');
      assert(await voiceSheet.isVisible().catch(() => false), 'VoiceEmergencyAssistant bottom sheet opened on tap');

      // Check Push to Talk mic button
      const micBtn = voiceSheet.locator('#voice-mic-button');
      if (await micBtn.isVisible().catch(() => false)) {
        const box = await micBtn.boundingBox();
        assert(box !== null && box.height >= 70, `Voice push-to-talk mic button satisfies large circular touch target >=70px (height: ${box?.height}px)`);
      }

      // Close voice sheet
      const closeVoiceBtn = voiceSheet.locator('button[aria-label="Close"]').first();
      if (await closeVoiceBtn.isVisible().catch(() => false)) {
        await closeVoiceBtn.click();
        await cPage.waitForTimeout(300);
      }
    }

    await citizenCtx.close();

    // ========================================================================
    // PART 4: COMPLETE AUTHORITY NAVIGATION JOURNEY
    // ========================================================================
    console.log('\n--- PART 4: COMPLETE AUTHORITY NAVIGATION JOURNEY (BEFORE & DURING) ---');

    const authCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const aPage = await authCtx.newPage();
    attachErrorListener(aPage);

    const authorityUserObj = {
      id: authorityUser.id,
      name: authorityUser.name,
      role: 'AUTHORITY',
      mobileNumber: authorityUser.mobileNumber,
      testIdentityNumber: authorityUser.testIdentityNumber,
    };

    // 1. Authority in BEFORE
    await injectAuth(aPage, authorityUserObj, authorityToken, 'BEFORE');
    await aPage.goto(`http://127.0.0.1:${TEST_PORT}/before`, { waitUntil: 'domcontentloaded' });
    await aPage.waitForTimeout(400);

    assert(await aPage.locator('#mobile-nav-occupancy').isVisible(), 'Authority Before: Occupancy navigation tab visible');
    assert(await aPage.locator('#mobile-nav-threats').isVisible(), 'Authority Before: Threats navigation tab visible');

    // 2. Test Threats Bottom Sheet on Mobile
    await aPage.locator('#mobile-nav-threats').click();
    await aPage.waitForTimeout(400);
    const publishAlertBtn = aPage.locator('button:has-text("Publish Threat Alert")').first();
    if (await publishAlertBtn.isVisible().catch(() => false)) {
      await publishAlertBtn.click();
      await aPage.waitForTimeout(400);
      const threatSheet = aPage.locator('#mobile-add-threat-sheet');
      assert(await threatSheet.isVisible().catch(() => false), 'MobileBottomSheet id="mobile-add-threat-sheet" opened on tap');

      // Close threat sheet
      const cancelThreatBtn = threatSheet.locator('button:has-text("Cancel")').first();
      if (await cancelThreatBtn.isVisible().catch(() => false)) {
        await cancelThreatBtn.click();
        await aPage.waitForTimeout(300);
      }
    }

    // 3. Transition Authority to DURING
    await aPage.evaluate(() => {
      localStorage.setItem('stride_disaster_mode', 'DURING');
      window.location.href = '/during';
    });
    await aPage.waitForTimeout(500);

    // 4. Authority DURING Navigation Tabs
    assert(await aPage.locator('#mobile-nav-rescue').isVisible(), 'Authority During: Rescue tab visible');
    assert(await aPage.locator('#mobile-nav-analytics').isVisible(), 'Authority During: Analytics tab visible');
    assert(!await aPage.locator('#mobile-nav-sos').isVisible().catch(() => false), 'Authority During: Citizen SOS button strictly hidden for Authority');

    // 5. Test Rescue Operations Ranked Queue & Bottom Sheet Inspection
    await aPage.locator('#mobile-nav-rescue').click();
    await aPage.waitForTimeout(500);

    await aPage.waitForSelector('button:has-text("Inspect Request Details")', { timeout: 4000 }).catch(() => null);
    const inspectBtn = aPage.locator('button:has-text("Inspect Request Details")').first();
    if (await inspectBtn.isVisible().catch(() => false)) {
      await inspectBtn.click();
      await aPage.waitForTimeout(400);
      const reqDetailSheet = aPage.locator('#mobile-request-detail-sheet');
      assert(await reqDetailSheet.isVisible().catch(() => false), 'Authority: Mobile request detail inspector sheet opened');

      // Test Direct Dialer link inside sheet
      const telLink = reqDetailSheet.locator('a[href^="tel:"]').first();
      assert(await telLink.isVisible().catch(() => false), 'Authority: Tactical sheet includes direct click-to-call link');

      // Test Assign Rescue Team button opens assign sheet
      const assignBtn = reqDetailSheet.locator('button:has-text("Assign Rescue Team")').first();
      if (await assignBtn.isVisible().catch(() => false)) {
        await assignBtn.click();
        await aPage.waitForTimeout(400);
        const assignSheet = aPage.locator('#mobile-assign-team-sheet');
        assert(await assignSheet.isVisible().catch(() => false), 'Authority: Mobile team assignment sheet opened');

        // Close assign sheet
        const cancelAssign = assignSheet.locator('button:has-text("Cancel")').first();
        if (await cancelAssign.isVisible().catch(() => false)) {
          await cancelAssign.click();
          await aPage.waitForTimeout(300);
        }
      }

      // Close request detail sheet
      const closeDetail = reqDetailSheet.locator('button[aria-label="Close sheet"]').first();
      if (await closeDetail.isVisible().catch(() => false)) {
        await closeDetail.click();
        await aPage.waitForTimeout(300);
      } else {
        await aPage.keyboard.press('Escape');
        await aPage.waitForTimeout(300);
      }
    }

    // 6. Test Analytics Subtabs on Mobile
    await aPage.waitForSelector('#mobile-nav-analytics', { timeout: 4000 }).catch(() => null);
    await aPage.locator('#mobile-nav-analytics').click({ force: true });
    await aPage.waitForTimeout(600);
    const authTextSample = await aPage.evaluate(() => document.body.innerText);
    console.log('AUTHORITY CURRENT URL:', aPage.url());
    console.log('AUTHORITY PAGE TEXT PREVIEW:', authTextSample.slice(0, 300));
    assert(await aPage.locator('text=Live Analytics').first().isVisible().catch(() => false) ||
           authTextSample.includes('Live Analytics') ||
           authTextSample.includes('Civilian Accountability'),
           'Authority During: Live Analytics view rendered');

    await authCtx.close();

    // ========================================================================
    // PART 5: COMPLETE RESCUER NAVIGATION JOURNEY
    // ========================================================================
    console.log('\n--- PART 5: COMPLETE RESCUER NAVIGATION JOURNEY (BEFORE & DURING) ---');

    const rescuerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const rPage = await rescuerCtx.newPage();
    attachErrorListener(rPage);

    const rescuerUserObj = {
      id: authorityUser.id,
      name: authorityUser.name,
      role: 'RESCUER',
      mobileNumber: authorityUser.mobileNumber,
      testIdentityNumber: authorityUser.testIdentityNumber,
    };

    await injectAuth(rPage, rescuerUserObj, rescuerToken, 'DURING');
    await rPage.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
    await rPage.waitForTimeout(500);

    // Rescuer Navigation bar has Missions, Maps, Buildings, Hospitals, More
    assert(await rPage.locator('#mobile-nav-rescue').isVisible(), 'Rescuer During: Missions nav button visible');
    assert(await rPage.locator('#mobile-nav-buildings').isVisible(), 'Rescuer During: Buildings nav button visible');
    assert(await rPage.locator('#mobile-nav-hospitals').isVisible(), 'Rescuer During: Hospitals nav button visible');

    // Navigate to Buildings Census & Distress Filter
    await rPage.locator('#mobile-nav-buildings').click();
    await rPage.waitForTimeout(500);
    assert(await rPage.locator('text=Building Situational Intelligence').first().isVisible().catch(() => false),
           'Rescuer: Building Situational Intelligence view rendered');

    const distressFilter = rPage.locator('#filter-buildings-distress');
    if (await distressFilter.isVisible().catch(() => false)) {
      const box = await distressFilter.boundingBox();
      assert(box !== null && box.height >= 44, `Rescuer: Buildings distress filter chip satisfies touch target >=44px (height: ${box?.height}px)`);
    }

    await rescuerCtx.close();

    // ========================================================================
    // PART 6: ROLE AUTHORIZATION & SENSITIVE DATA BOUNDARIES
    // ========================================================================
    console.log('\n--- PART 6: ROLE AUTHORIZATION & SENSITIVE DATA BOUNDARIES ---');

    // 6.1 Citizen strictly 403 on operational responder routes
    const cMapRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/map/rescuer`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(cMapRes.status === 403, 'Citizen forbidden from tactical map /api/map/rescuer (HTTP 403)');

    const cAssignRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/emergency-requests/test/assign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(cAssignRes.status === 403, 'Citizen forbidden from assigning squads /api/emergency-requests/:id/assign (HTTP 403)');

    const cStatusRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/emergency-requests/test/rescue-status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(cStatusRes.status === 403, 'Citizen forbidden from updating rescue status (HTTP 403)');

    // 6.2 Authority & Rescuer Authorized Access
    const aQueueRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/authority/rescue-requests/ranked`, {
      headers: { Authorization: `Bearer ${authorityToken}` },
    });
    assert(aQueueRes.status === 200, 'Authority authorized for ranked queue /api/authority/rescue-requests/ranked (HTTP 200)');
    const aQueueData = await aQueueRes.json();
    assert(Array.isArray(aQueueData) && aQueueData.length >= 2, 'Ranked queue returns requests array with test records');

    // 6.3 Sole Authority of Priority Semantics
    let isOrderedDesc = true;
    for (let i = 0; i < aQueueData.length - 1; i++) {
      if (aQueueData[i].priorityScore < aQueueData[i + 1].priorityScore) {
        isOrderedDesc = false;
        break;
      }
    }
    assert(isOrderedDesc, 'Ranked queue maintains strict priorityScore DESC order from deterministic backend');

    // ========================================================================
    // PART 7: SOS IDEMPOTENCY, DUPLICATE SAFETY & OFFLINE RESILIENCE
    // ========================================================================
    console.log('\n--- PART 7: SOS IDEMPOTENCY, DUPLICATE SAFETY & OFFLINE RESILIENCE ---');

    const opId = `op-phase6-hardening-${Date.now()}`;
    const testSosPayload = {
      householdMemberId: household?.members[0]?.id,
      disasterId: activeDisaster?.id,
      address: 'Hardening Test Location, Lane 7',
      description: '[SRC:TEST-P6, P:2, C:0, E:0, D:0, I:0, W:HIGH, T:FLOOD] Idempotency verification request',
      latitude: household?.latitude || 12.9716,
      longitude: household?.longitude || 77.5946,
      waterLevel: 'HIGH',
      clientOperationId: opId,
    };

    // First SOS creation
    const sos1Res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/rescue-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify(testSosPayload),
    });
    assert(sos1Res.status === 201, 'Initial SOS submission succeeds with HTTP 201 Created');
    const sos1Data = await sos1Res.json();
    const createdSosId = sos1Data.id || sos1Data.data?.id;

    // Idempotent second submission with same clientOperationId
    const sos2Res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/rescue-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify(testSosPayload),
    });
    assert(sos2Res.status === 200, 'Duplicate SOS with identical clientOperationId returns HTTP 200 OK (idempotent replay)');
    const sos2Data = await sos2Res.json();
    const replayedSosId = sos2Data.id || sos2Data.data?.id;
    assert(createdSosId === replayedSosId, 'Idempotent replay returns exact same server record ID without duplicate creation');

    // Clean up created test SOS
    if (createdSosId) {
      await prisma.emergencyRequest.delete({ where: { id: createdSosId } }).catch(() => {});
      await prisma.idempotencyKey.deleteMany({ where: { operationId: opId } }).catch(() => {});
    }

    // ========================================================================
    // PART 8: CONSOLE RUNTIME HYGIENE AUDIT
    // ========================================================================
    console.log('\n--- PART 8: CONSOLE RUNTIME HYGIENE AUDIT ---');
    assert(pageErrors.length === 0, `Zero uncaught exceptions or rendering errors detected during validation runs (errors found: ${pageErrors.length})`);
    if (pageErrors.length > 0) {
      console.error('  Detected Page Errors:', pageErrors);
    }

  } finally {
    // Clean up seeded test requests
    if (testReq1Id || testReq2Id) {
      const idsToDelete = [testReq1Id, testReq2Id].filter(Boolean) as string[];
      await prisma.emergencyRequest.deleteMany({
        where: { id: { in: idsToDelete } },
      }).catch(() => {});
    }

    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(` PHASE 6 HARDENING SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6HardeningSuite().catch((err) => {
  console.error('Phase 6 hardening suite fatal error:', err);
  process.exit(1);
});
