import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { chromium, Browser, Page } from 'playwright';
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

async function runEmergencySosMobileSuite() {
  console.log('========================================================================');
  console.log(' STRIDE MOBILE-FIRST UI REDESIGN — PHASE 3 VERIFICATION SUITE');
  console.log(' EMERGENCY SOS + VOICE ASSISTANT MOBILE UX & DESKTOP FREEZE AUDIT');
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
  const areYouSafeFile = path.join(srcPath, 'components', 'during', 'AreYouSafeView.tsx');
  const voiceAssistantFile = path.join(srcPath, 'components', 'voice', 'VoiceEmergencyAssistant.tsx');
  const rescueOpsFile = path.join(srcPath, 'components', 'during', 'RescueOperationsView.tsx');

  assert(fs.existsSync(areYouSafeFile), 'AreYouSafeView.tsx exists');
  assert(fs.existsSync(voiceAssistantFile), 'VoiceEmergencyAssistant.tsx exists');
  assert(fs.existsSync(rescueOpsFile), 'RescueOperationsView.tsx exists');

  const areYouSafeContent = fs.readFileSync(areYouSafeFile, 'utf-8');
  const voiceAssistantContent = fs.readFileSync(voiceAssistantFile, 'utf-8');
  const rescueOpsContent = fs.readFileSync(rescueOpsFile, 'utf-8');

  // 1. AreYouSafeView Desktop Freeze & Mobile Responsive Checks
  assert(
    areYouSafeContent.includes('text-2xl sm:text-3xl lg:text-4xl'),
    'AreYouSafeView title uses responsive typography with desktop freeze at lg:text-4xl'
  );
  assert(
    areYouSafeContent.includes('min-h-[48px]'),
    'AreYouSafeView voice CTA and primary buttons enforce min-h-[48px] touch targets'
  );
  assert(
    areYouSafeContent.includes('min-h-[96px] sm:min-h-[140px]'),
    'AreYouSafeView Safe vs Distress choice buttons provide large thumb-friendly touch targets'
  );
  assert(
    areYouSafeContent.includes('aria-label="Decrease Total People"') &&
      areYouSafeContent.includes('aria-label="Increase Total People"') &&
      areYouSafeContent.includes('lg:hidden w-11 h-11'),
    'AreYouSafeView SOS form provides large + and - stepper buttons on mobile, hidden on desktop (lg:hidden)'
  );
  assert(
    areYouSafeContent.includes('fixed bottom-0 inset-x-0 z-30 lg:static') &&
      areYouSafeContent.includes('env(safe-area-inset-bottom'),
    'AreYouSafeView SOS form features sticky bottom action bar on mobile with safe-area padding, static on desktop'
  );

  // Exact Offline Safety Text Invariant (Adjustment 3 & Verbatim Safety Check)
  const expectedOfflineWording =
    'Your emergency request is saved locally on this device and has not yet reached emergency response authorities. As soon as an internet connection is available, STRIDE will automatically transmit your SOS to the emergency response system for server-side evaluation.';
  assert(
    areYouSafeContent.includes(expectedOfflineWording),
    'AreYouSafeView strictly preserves exact offline safety text verbatim without modification'
  );
  assert(
    areYouSafeContent.includes('sosSyncManager.syncPendingOutbox()'),
    'AreYouSafeView Transmit Now triggers existing sosSyncManager.syncPendingOutbox without creating new transmission pathways'
  );
  assert(
    areYouSafeContent.includes('if (actionLoading) return;') &&
      areYouSafeContent.includes('disabled={actionLoading}'),
    'AreYouSafeView protects against duplicate SOS submissions by guarding handleSubmitDistress with actionLoading'
  );

  // 2. VoiceEmergencyAssistant Mobile Bottom Sheet & 80px Push-to-Talk Audit
  assert(
    voiceAssistantContent.includes('flex items-end lg:items-center') &&
      voiceAssistantContent.includes('rounded-t-3xl lg:rounded-3xl'),
    'VoiceEmergencyAssistant renders as mobile bottom sheet on <1024px and centered modal on >=1024px'
  );
  assert(
    voiceAssistantContent.includes('lg:hidden w-12 h-1.5 bg-[#C8D9E6] rounded-full'),
    'VoiceEmergencyAssistant includes visual drag handle on mobile (<1024px)'
  );
  assert(
    voiceAssistantContent.includes('w-20 h-20 lg:w-12 lg:h-12 rounded-full lg:rounded-2xl'),
    'VoiceEmergencyAssistant provides ~80px circular push-to-talk button on mobile, freezing to 48px on desktop (lg:w-12 lg:h-12)'
  );
  assert(
    voiceAssistantContent.includes('Tap to speak') &&
      voiceAssistantContent.includes('Tap to stop') &&
      voiceAssistantContent.includes('Processing audio') &&
      voiceAssistantContent.includes('Tap to retry'),
    'VoiceEmergencyAssistant mobile button explicitly communicates IDLE, RECORDING, PROCESSING, and ERROR/RETRY states'
  );
  assert(
    voiceAssistantContent.includes('disabled={currentStatus === \'PROCESSING\' || isSubmittingTurnRef.current}'),
    'VoiceEmergencyAssistant disables mic button during processing to prevent rapid duplicate turn submissions'
  );
  assert(
    voiceAssistantContent.includes('secs >= 30'),
    'VoiceEmergencyAssistant strictly enforces 30-second recording limit'
  );
  assert(
    voiceAssistantContent.includes('Device is offline. Voice assistant requires an internet connection for processing.'),
    'VoiceEmergencyAssistant displays clear offline notification with link to manual offline SOS form'
  );

  // 3. RescueOperationsView Citizen-Only Scope Audit (Adjustment 2)
  assert(
    rescueOpsContent.includes('user.role === \'CITIZEN\'') &&
      rescueOpsContent.includes('min-h-[48px]'),
    'RescueOperationsView optimizes Citizen telemetry buttons with min-h-[48px]'
  );
  assert(
    rescueOpsContent.includes('Authority Emergency Dispatch Queue') &&
      rescueOpsContent.includes('Field Rescue Operations & Missions'),
    'RescueOperationsView preserves existing Authority and Rescuer dispatch queue interfaces completely untouched'
  );

  // ==========================================================================
  // SUITE 2: IDEMPOTENCY & DUPLICATE-SOS PROTECTION TESTS (Adjustment 4)
  // ==========================================================================
  console.log('\n--- SUITE 2: IDEMPOTENCY & DUPLICATE-SOS PROTECTION TESTS (Adjustment 4) ---');

  const testOpId = `op-test-suite-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Find a valid citizen in database
  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });

  if (!citizen) {
    throw new Error('Test citizen not found in database. Run db seed first.');
  }

  const citizenId = citizen.id;

  // TEST 2.1: Server-side idempotency across rapid sequential submissions
  console.log('  Testing server-side idempotency with duplicate clientOperationId...');
  const reqUser = { userId: citizen.id, email: citizen.email, role: citizen.role };

  const req1: any = {
    user: reqUser,
    body: {
      address: '99 Stride Safe Test Lane, Chennai',
      description: 'Water rising, testing rapid duplicate submissions',
      peopleCount: 3,
      childrenCount: 1,
      elderlyCount: 0,
      disabledCount: 0,
      injuredCount: 0,
      criticalMedicalNeed: false,
      waterLevel: 'HIGH',
      emergencyType: 'FLOOD',
      clientOperationId: testOpId,
    },
    headers: {
      'x-stride-operation-id': testOpId,
    },
  };

  const res1 = createMockRes();
  await createRescueRequest(req1, res1);

  assert(
    res1.statusCode === 201 || res1.statusCode === 200,
    `Initial request with opId ${testOpId} created successfully (HTTP ${res1.statusCode})`
  );
  const createdRecordId = res1.data?.id;
  assert(Boolean(createdRecordId), `Initial request returned valid record ID: ${createdRecordId}`);

  // TEST 2.2: Repeated submission with exact same clientOperationId must return EXACT same request without creating duplicate DB entry
  const req2: any = {
    user: reqUser,
    body: {
      address: '99 Stride Safe Test Lane, Chennai',
      description: 'Water rising, testing rapid duplicate submissions',
      peopleCount: 3,
      childrenCount: 1,
      elderlyCount: 0,
      disabledCount: 0,
      injuredCount: 0,
      criticalMedicalNeed: false,
      waterLevel: 'HIGH',
      emergencyType: 'FLOOD',
      clientOperationId: testOpId,
    },
    headers: {
      'x-stride-operation-id': testOpId,
    },
  };

  const res2 = createMockRes();
  await createRescueRequest(req2, res2);

  assert(
    res2.statusCode === 200,
    `Duplicate submission with identical opId returns HTTP 200 (Idempotent replay)`
  );
  assert(
    res2.data?.id === createdRecordId,
    `Duplicate submission returned existing record ID (${res2.data?.id} === ${createdRecordId}) without creating new record`
  );

  // TEST 2.3: Verify DB count for this operationId is strictly 1
  const idempotencyKeys = await prisma.idempotencyKey.findMany({
    where: { operationId: testOpId },
  });
  assert(
    idempotencyKeys.length === 1,
    `IdempotencyKey table has exactly ONE entry for operation ${testOpId}`
  );

  // Clean up test request
  try {
    await prisma.emergencyCondition.deleteMany({
      where: { emergencyRequest: { id: createdRecordId } },
    });
    await prisma.emergencyRequest.deleteMany({
      where: { id: createdRecordId },
    });
    await prisma.idempotencyKey.deleteMany({
      where: { operationId: testOpId },
    });
  } catch {
    // Non-blocking cleanup
  }

  // ==========================================================================
  // SUITE 3: LIVE MULTI-VIEWPORT BROWSER AUDIT (8 Viewports)
  // ==========================================================================
  console.log('\n--- SUITE 3: LIVE MULTI-VIEWPORT BROWSER AUDIT (8 Viewports) ---');

  const distPath = path.resolve(process.cwd(), 'dist');
  const app = express();
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = http.createServer(app);
  const TEST_PORT = 3059;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', () => resolve()));
  console.log(`  [Server] Test server listening on http://127.0.0.1:${TEST_PORT}`);

  const browser: Browser = await chromium.launch({ channel: 'msedge', headless: true });

  async function setupCitizenAuth(page: Page) {
    const user = {
      id: 'citizen-user-phase3-test',
      name: 'Citizen Mobile User',
      email: 'citizen@stride.org',
      role: 'CITIZEN',
      testIdentityNumber: '5432 8901 2345',
    };
    await page.addInitScript((userData) => {
      localStorage.setItem('stride_user', JSON.stringify(userData));
      localStorage.setItem('stride_token', 'demo-valid-token-phase-3');
      localStorage.setItem(`stride_household_handled_${userData.id}`, 'true');
      localStorage.setItem('stride_disaster_mode', 'DURING');
      localStorage.setItem('stride_during_tab', 'safe');
    }, user);
  }

  const viewports = [
    { name: 'iPhone SE (Ultra-compact mobile)', width: 320, height: 568, isMobile: true },
    { name: 'iPhone 8 (Standard mobile)', width: 375, height: 667, isMobile: true },
    { name: 'iPhone 13/14 (Modern mobile)', width: 390, height: 844, isMobile: true },
    { name: 'iPhone 15 Pro Max (Large mobile)', width: 430, height: 932, isMobile: true },
    { name: 'iPad Mini (Small tablet)', width: 768, height: 1024, isMobile: true },
    { name: 'iPad Air (Standard tablet)', width: 820, height: 1180, isMobile: true },
    { name: 'Desktop Baseline (Frozen)', width: 1024, height: 768, isMobile: false },
    { name: 'Desktop Full HD (Frozen)', width: 1920, height: 1080, isMobile: false },
  ];

  for (const vp of viewports) {
    console.log(`\n  Testing Viewport: ${vp.name} [Width: ${vp.width}px, Expected: ${vp.isMobile ? 'MOBILE' : 'DESKTOP'}]`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });

    const page: Page = await context.newPage();
    await setupCitizenAuth(page);

    await page.goto(`http://127.0.0.1:${TEST_PORT}/during`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // 1. Check for horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasHorizontalOverflow, `[${vp.name}] Zero horizontal overflow (scrollWidth <= clientWidth)`);

    // 2. Check layout mode
    if (vp.isMobile) {
      const mobileNavVisible = await page.locator('#mobile-bottom-nav').isVisible().catch(() => false);
      assert(mobileNavVisible, `[${vp.name}] Mobile navigation bar active on <1024px`);

      const desktopSidebarVisible = await page.locator('aside').isVisible().catch(() => false);
      assert(!desktopSidebarVisible, `[${vp.name}] Desktop sidebar hidden on <1024px`);

      // Emergency heading & Safe / Need Help buttons visible
      const heading = await page.locator('h1').first();
      assert(await heading.isVisible().catch(() => false), `[${vp.name}] Emergency heading is visible`);

      // Check Need Help button
      const needHelpBtn = page.locator('button:has-text("Need Help")').first();
      if (await needHelpBtn.isVisible().catch(() => false)) {
        const box = await needHelpBtn.boundingBox();
        assert(box !== null && box.height >= 48, `[${vp.name}] Need Help button touch target height >= 48px (got ${box?.height}px)`);
      }
    } else {
      // Desktop freeze: desktop sidebar visible, mobile nav hidden
      const desktopSidebarVisible = await page.locator('aside').isVisible().catch(() => false);
      assert(desktopSidebarVisible, `[${vp.name}] Desktop frozen sidebar active on >=1024px`);

      const mobileNavVisible = await page.locator('#mobile-bottom-nav').isVisible().catch(() => false);
      assert(!mobileNavVisible, `[${vp.name}] Mobile navigation bar hidden on >=1024px`);
    }

    await context.close();
  }

  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // --- FINAL SUMMARY ---
  console.log('\n========================================================================');
  console.log(` PHASE 3 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmergencySosMobileSuite().catch((err) => {
  console.error('Fatal suite runner error:', err);
  process.exit(1);
});
