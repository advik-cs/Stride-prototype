function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

let passedTests = 0;
let failedTests = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err?.message || err}`);
    failedTests++;
    throw err;
  }
}

import { chromium } from 'playwright';
import http from 'http';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import createApp from '../src/server/app.ts';
import prisma from '../src/server/config/database.ts';
import { formatRescueRequest } from '../src/server/controllers/rescueController.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'stride-hackathon-secure-jwt-secret-key-2026';

async function runRealBrowserDeepgramSuite() {
  console.log('================================================================');
  console.log('STRIDE REAL BROWSER DEEPGRAM VOICE VERIFICATION');
  console.log('Testing browser E2E with mock Deepgram STT & TTS backend');
  console.log('================================================================\n');

  let mockDeepgramServer: http.Server;
  let mockDeepgramPort: number;
  let httpServer: http.Server;
  let httpPort: number;
  let browser: any = null;
  let sttCallCount = 0;
  let ttsCallCount = 0;
  let lastReceivedSttUrl = '';
  let currentTurnTranscript = "We are four people and we're trapped upstairs.";

  // 1. Setup Mock Deepgram HTTP Server
  await new Promise<void>((resolve) => {
    const mockApp = express();
    mockApp.use((req, res, next) => {
      if (req.path.startsWith('/v1/listen')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          sttCallCount++;
          lastReceivedSttUrl = req.url;
          console.log(`  [Mock Deepgram STT] Received audio stream (${chunks.reduce((a, c) => a + c.length, 0)} bytes). Transcribing: "${currentTurnTranscript}"`);
          res.json({
            results: {
              channels: [
                {
                  alternatives: [
                    {
                      transcript: currentTurnTranscript,
                      confidence: 0.99,
                    },
                  ],
                },
              ],
            },
          });
        });
      } else if (req.path.startsWith('/v1/speak')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          ttsCallCount++;
          console.log(`  [Mock Deepgram TTS] Synthesizing speech...`);
          res.setHeader('content-type', 'audio/mp3');
          // Return small valid MP3/audio dummy buffer
          res.send(Buffer.alloc(512, 0x55));
        });
      } else {
        next();
      }
    });

    mockDeepgramServer = http.createServer(mockApp);
    mockDeepgramServer.listen(0, '127.0.0.1', () => {
      mockDeepgramPort = (mockDeepgramServer.address() as any).port;
      console.log(`[Test Mock Deepgram Server] Listening on http://127.0.0.1:${mockDeepgramPort}`);
      resolve();
    });
  });

  process.env.DEEPGRAM_BASE_URL = `http://127.0.0.1:${mockDeepgramPort}`;
  process.env.DEEPGRAM_API_KEY = 'test-deepgram-browser-key';

  // 2. Setup STRIDE HTTP Server serving static dist build + API
  const app = createApp();
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  await new Promise<void>((resolve) => {
    httpServer = http.createServer(app);
    httpServer.listen(0, '127.0.0.1', () => {
      httpPort = (httpServer.address() as any).port;
      console.log(`[Test STRIDE Server] Running on http://127.0.0.1:${httpPort}\n`);
      resolve();
    });
  });

  // 3. Prepare Test Citizen & Household in Database
  let citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });

  if (!citizen) {
    citizen = await prisma.user.create({
      data: {
        name: 'Browser Test Citizen',
        mobileNumber: '9988776655',
        testIdentityNumber: '5432 8901 2345',
        role: 'CITIZEN',
        password: 'dummy',
      },
      include: { households: { include: { members: true } } },
    });
  }

  let household = citizen.households?.[0];
  if (!household) {
    household = await prisma.household.create({
      data: {
        userId: citizen.id,
        name: 'Sharma Residence',
        address: '14 Saidapet Bazaar Road, Near Metro Station',
        city: 'Bengaluru',
        state: 'Karnataka',
        latitude: 12.9716,
        longitude: 77.5946,
        onboardingCompleted: true,
      },
      include: { members: true },
    });
  } else {
    await prisma.household.update({
      where: { id: household.id },
      data: { onboardingCompleted: true },
    });
  }

  if (household.members.length === 0) {
    await prisma.householdMember.createMany({
      data: [
        { householdId: household.id, name: 'Priya Sharma', age: 34, relationship: 'Self', category: 'ADULT' },
        { householdId: household.id, name: 'Rajesh Sharma', age: 36, relationship: 'Spouse', category: 'ADULT' },
        { householdId: household.id, name: 'Aarav Sharma', age: 8, relationship: 'Child', category: 'CHILD' },
        { householdId: household.id, name: 'Kaveri Devi', age: 70, relationship: 'Parent', category: 'ELDERLY' },
      ],
    });
  }

  const memberIds = (await prisma.householdMember.findMany({ where: { householdId: household.id } })).map((m) => m.id);

  // Clean up existing emergency requests for this user
  await prisma.emergencyCondition.deleteMany({
    where: { emergencyRequest: { householdMemberId: { in: memberIds } } },
  });
  await prisma.rescueAssignment.deleteMany({
    where: { emergencyRequest: { householdMemberId: { in: memberIds } } },
  });
  await prisma.emergencyRequest.deleteMany({
    where: { householdMemberId: { in: memberIds } },
  });

  const citizenToken = jwt.sign(
    { userId: citizen.id, mobileNumber: citizen.mobileNumber, role: citizen.role },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const citizenUserPayload = {
    id: citizen.id,
    name: citizen.name,
    mobileNumber: citizen.mobileNumber,
    testIdentityNumber: citizen.testIdentityNumber,
    role: 'CITIZEN',
  };

  let page: any = null;
  let activeSosIdFromTurn1: string | null = null;
  let turn1PriorityScore: number = 0;

  try {
    // 4. Launch Playwright Browser with Audio/Mic Emulation
    console.log('Launching Playwright Chromium/Edge with audio emulation...');
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    }).catch(() => chromium.launch({
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    }));

    const context = await browser.newContext({
      permissions: ['microphone'],
    });

    page = await context.newPage();

    // Listen to browser console logs
    page.on('console', (msg: any) => {
      const txt = msg.text();
      if (txt.includes('[STRIDE') || txt.includes('Deepgram') || txt.includes('error') || txt.includes('Error')) {
        console.log(`  [Browser Console] ${txt}`);
      }
    });

    // Inject authentication and configure Deepgram provider in localStorage before load
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('stride_token', token);
      localStorage.setItem('stride_before_token', token);
      localStorage.setItem('stride_during_token', token);
      localStorage.setItem('stride_user', JSON.stringify(user));
      localStorage.setItem('stride_phase', 'DURING');
      localStorage.setItem('stride_voice_provider', 'deepgram');
    }, { token: citizenToken, user: citizenUserPayload });

    // Route any API calls to the running HTTP server port
    await page.route('**/api/**', async (route: any) => {
      const originalUrl = route.request().url();
      const parsed = new URL(originalUrl);
      const targetUrl = `http://127.0.0.1:${httpPort}${parsed.pathname}${parsed.search}`;
      try {
        const response = await page.request.fetch(route.request(), { url: targetUrl });
        await route.fulfill({ response });
      } catch {
        await route.continue({ url: targetUrl });
      }
    });

    // =================================================================
    // TEST 1: Navigation & Microphone API Readiness
    // =================================================================
    await test('1. Navigation to during emergency page & microphone API ready', async () => {
      await page.goto(`http://127.0.0.1:${httpPort}/during`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // Verify microphone API is available in browser context
      const hasMediaDevices = await page.evaluate(() => {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      });
      assert(hasMediaDevices, 'navigator.mediaDevices.getUserMedia must be supported in browser');

      // Click on "Report Status / SOS" / safe tab in sidebar
      const safeTabButton = page.locator('#sidebar-nav-safe, button:has-text("Are You Safe?"), button:has-text("SOS")').first();
      await safeTabButton.waitFor({ state: 'visible', timeout: 5000 });
      await safeTabButton.click();
      await page.waitForTimeout(800);

      // Verify "Talk to STRIDE" voice trigger button exists
      const talkToStrideBtn = page.locator('button:has-text("Talk to STRIDE"), button:has-text("Update via Voice")').first();
      await talkToStrideBtn.waitFor({ state: 'visible', timeout: 5000 });
      assert(await talkToStrideBtn.isVisible(), '"Talk to STRIDE" button must be visible');
    });

    // =================================================================
    // TEST 2: Open Voice Emergency Assistant & Verify DEEPGRAM Provider
    // =================================================================
    await test('2. Open Voice Emergency Assistant modal with DEEPGRAM-TURN provider active', async () => {
      // Click "Talk to STRIDE" to open modal
      const talkToStrideBtn = page.locator('button:has-text("Talk to STRIDE"), button:has-text("Update via Voice")').first();
      await talkToStrideBtn.click();

      // Verify Modal rendered
      const modalHeader = page.locator('text=STRIDE Voice Emergency Assistant');
      await modalHeader.waitFor({ state: 'visible', timeout: 5000 });
      assert(await modalHeader.isVisible(), 'Modal header must be visible');

      // Verify Provider Badge indicates DEEPGRAM-TURN
      const providerBadge = page.locator('text=DEEPGRAM-TURN');
      await providerBadge.waitFor({ state: 'visible', timeout: 5000 });
      assert(await providerBadge.isVisible(), 'Provider badge must display DEEPGRAM-TURN');

      // Verify Subtitle displays provider-neutral copy
      const subtitle = page.locator('text=Voice emergency reporting & deterministic priority triage powered by STRIDE');
      await subtitle.waitFor({ state: 'visible', timeout: 5000 });
      assert(await subtitle.isVisible(), 'Provider-neutral subtitle must be visible');
    });

    // =================================================================
    // TEST 3: Microphone Permission & Recording Activation
    // =================================================================
    await test('3. Microphone activation transitions status to LISTENING with recording timer', async () => {
      const micBtn = page.locator('#voice-assistant-mic-btn');
      await micBtn.waitFor({ state: 'visible', timeout: 5000 });
      await micBtn.click();

      // Verify UI reflects listening state
      const listeningText = page.locator('text=Listening live').first();
      await listeningText.waitFor({ state: 'visible', timeout: 5000 });
      assert(await listeningText.isVisible(), 'Assistant status must transition to LISTENING');

      // Wait 1.5 seconds to let audio data accumulate
      await page.waitForTimeout(1500);
    });

    // =================================================================
    // TEST 4: Stop Recording -> STT -> STRIDE Triage -> Priority Calculation -> TTS Playback
    // =================================================================
    await test('4. Stop recording triggers Deepgram STT, STRIDE triage, priority calculation & TTS', async () => {
      // Click mic button again to stop recording
      const micBtn = page.locator('#voice-assistant-mic-btn');
      await micBtn.click();

      // Wait for user bubble with transcribed text to appear in chat
      const userBubble = page.locator('p:has-text("We are four people and we\'re trapped upstairs.")').last();
      await userBubble.waitFor({ state: 'visible', timeout: 10000 });
      assert(await userBubble.isVisible(), 'Transcribed user message must appear in chat');

      // Wait for Active SOS banner inside Voice Assistant modal
      const sosBanner = page.locator('text=ACTIVE RESCUE BEACON');
      await sosBanner.waitFor({ state: 'visible', timeout: 10000 });
      assert(await sosBanner.isVisible(), 'ACTIVE RESCUE BEACON banner must appear');

      // Assert active rescue beacon displays authoritative People: 4
      const beaconPeople = page.locator('text=People: 4').first();
      await beaconPeople.waitFor({ state: 'visible', timeout: 5000 });
      assert(await beaconPeople.isVisible(), 'Active rescue beacon must display People: 4');

      // Verify STT was called with Nova-3 keyterms
      assert(sttCallCount >= 1, `Deepgram STT should have been called at least once (got ${sttCallCount})`);
      assert(lastReceivedSttUrl.includes('keyterm=trapped'), 'Deepgram STT request URL must include keyterm=trapped');
      assert(lastReceivedSttUrl.includes('keyterm=trapped%20upstairs'), 'Deepgram STT request URL must include keyterm=trapped%20upstairs');

      // Verify TTS was called
      assert(ttsCallCount >= 1, `Deepgram TTS should have been called at least once (got ${ttsCallCount})`);

      // Verify database record: peopleCount = 4, emergencyType = TRAPPED, priority calculated
      const activeRequests = await prisma.emergencyRequest.findMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true, rescueAssignments: true, householdMember: { include: { household: { include: { user: true } } } } },
      });

      assert(activeRequests.length === 1, `Exactly one active emergency request must exist (got ${activeRequests.length})`);
      const req = activeRequests[0];
      activeSosIdFromTurn1 = req.id;
      turn1PriorityScore = req.priorityScore;

      const formatted = formatRescueRequest(req);
      assert(formatted.peopleCount === 4, `Expected peopleCount = 4, got ${formatted.peopleCount}`);
      assert(formatted.emergencyType === 'TRAPPED', `Expected emergencyType = TRAPPED, got ${formatted.emergencyType}`);

      // Dynamic assertion: priority score calculated by STRIDE formula
      assert(typeof turn1PriorityScore === 'number' && turn1PriorityScore >= 15 && turn1PriorityScore <= 100,
        `Expected valid priority score between 15 and 100, got: ${turn1PriorityScore}`);
      console.log(`     Turn 1 authoritative priority score: ${turn1PriorityScore}`);
    });

    // =================================================================
    // TEST 5: Second Conversational Turn Updates Active SOS In-Place
    // =================================================================
    await test('5. Second conversational turn ("My grandmother is injured.") updates active SOS in-place and preserves People: 4', async () => {
      // Set mock STT transcript for turn 2: "My grandmother is injured."
      currentTurnTranscript = 'My grandmother is injured.';

      // Start recording turn 2
      const micBtn = page.locator('#voice-assistant-mic-btn');
      await micBtn.click();
      await page.waitForTimeout(1500);

      // Stop recording turn 2
      await micBtn.click();

      // Wait for turn 2 user message in chat
      const userBubble2 = page.locator('p:has-text("My grandmother is injured.")').last();
      await userBubble2.waitFor({ state: 'visible', timeout: 10000 });
      assert(await userBubble2.isVisible(), 'Turn 2 transcribed utterance must appear in chat');

      await page.waitForTimeout(2000);

      // Verify active rescue beacon banner in browser still displays People: 4 (not reset to 3 or 1)
      const beaconPeople2 = page.locator('text=People: 4').first();
      await beaconPeople2.waitFor({ state: 'visible', timeout: 5000 });
      assert(await beaconPeople2.isVisible(), 'Active rescue beacon must maintain People: 4 after Turn 2');

      // Verify active SOS updated in database
      const activeRequests = await prisma.emergencyRequest.findMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true, rescueAssignments: true, householdMember: { include: { household: { include: { user: true } } } } },
      });

      assert(activeRequests.length === 1, `Still exactly one active SOS must exist (got ${activeRequests.length})`);
      const req2 = activeRequests[0];
      assert(req2.id === activeSosIdFromTurn1, `SOS ID must remain identical (updated in-place). Expected ${activeSosIdFromTurn1}, got ${req2.id}`);

      const formatted2 = formatRescueRequest(req2);
      assert(formatted2.peopleCount === 4, `peopleCount should remain 4 from turn 1, got ${formatted2.peopleCount}`);
      assert(formatted2.elderlyCount === 1, `elderlyCount should now be 1, got ${formatted2.elderlyCount}`);
      assert(formatted2.injuredCount === 1, `injuredCount should now be 1, got ${formatted2.injuredCount}`);

      // Dynamic assertion: priority score calculated by authoritative STRIDE formula
      assert(
        typeof req2.priorityScore === 'number' && req2.priorityScore >= 15 && req2.priorityScore <= 100,
        `Expected valid priority score between 15 and 100, got: ${req2.priorityScore}`
      );
      console.log(`     Turn 2 updated authoritative priority score: ${req2.priorityScore}`);
    });

    // =================================================================
    // TEST 6: Third Turn with Informational Speech Preserves Active SOS
    // =================================================================
    await test('6. Third turn with informational query preserves active SOS and receives assistant guidance', async () => {
      // Set mock STT transcript for turn 3
      currentTurnTranscript = 'Where is the nearest evacuation shelter?';

      // Start recording turn 3
      const micBtn = page.locator('#voice-assistant-mic-btn');
      await micBtn.click();
      await page.waitForTimeout(1500);

      // Stop recording turn 3
      await micBtn.click();

      // Wait for turn 3 user message in chat
      const userBubble3 = page.locator('p:has-text("Where is the nearest evacuation shelter?")').last();
      await userBubble3.waitFor({ state: 'visible', timeout: 10000 });
      assert(await userBubble3.isVisible(), 'Turn 3 transcribed utterance must appear in chat');

      await page.waitForTimeout(2000);

      // Active SOS must remain active in database with unchanged SOS id
      const activeRequests = await prisma.emergencyRequest.findMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
      });
      assert(activeRequests.length === 1, 'Active SOS must still exist');
      assert(activeRequests[0].id === activeSosIdFromTurn1, 'Active SOS ID must remain unchanged');

      // Banner must still be visible
      const sosBanner = page.locator('text=ACTIVE RESCUE BEACON');
      assert(await sosBanner.isVisible(), 'ACTIVE RESCUE BEACON banner must remain visible');
    });

    // =================================================================
    // TEST 7: Fourth Turn with People Count Correction ("Actually, there are five people with me.")
    // =================================================================
    await test('7. Fourth turn updates peopleCount to 5 in browser beacon and database', async () => {
      currentTurnTranscript = 'Actually, there are five people with me.';

      const micBtn = page.locator('#voice-assistant-mic-btn');
      await micBtn.click();
      await page.waitForTimeout(1500);
      await micBtn.click();

      const userBubble4 = page.locator('p:has-text("Actually, there are five people with me.")').last();
      await userBubble4.waitFor({ state: 'visible', timeout: 10000 });
      assert(await userBubble4.isVisible(), 'Turn 4 transcribed utterance must appear in chat');

      await page.waitForTimeout(2000);

      // Verify active rescue beacon banner in browser displays People: 5
      const beaconPeople5 = page.locator('text=People: 5').first();
      await beaconPeople5.waitFor({ state: 'visible', timeout: 5000 });
      assert(await beaconPeople5.isVisible(), 'Active rescue beacon must update to People: 5');

      // Database must have peopleCount = 5, injuredCount = 1
      const activeRequests = await prisma.emergencyRequest.findMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true },
      });
      assert(activeRequests.length === 1, 'Still exactly one active SOS');
      assert(activeRequests[0].id === activeSosIdFromTurn1, 'SOS ID must remain unchanged');
      const formatted = formatRescueRequest(activeRequests[0]);
      assert(formatted.peopleCount === 5, `peopleCount should be 5, got ${formatted.peopleCount}`);
      assert(formatted.injuredCount === 1, `injuredCount should remain 1, got ${formatted.injuredCount}`);
    });

    // =================================================================
    // TEST 8: Fifth Turn with Negative Statement ("Not the five people are injured.")
    // =================================================================
    await test('8. Fifth turn with negative statement clears injuredCount to 0 while preserving People: 5', async () => {
      currentTurnTranscript = 'Not the five people are injured.';

      const micBtn = page.locator('#voice-assistant-mic-btn');
      await micBtn.click();
      await page.waitForTimeout(1500);
      await micBtn.click();

      const userBubble5 = page.locator('p:has-text("Not the five people are injured.")').last();
      await userBubble5.waitFor({ state: 'visible', timeout: 10000 });
      assert(await userBubble5.isVisible(), 'Turn 5 transcribed utterance must appear in chat');

      await page.waitForTimeout(2500);

      // Verify active rescue beacon banner in browser still displays People: 5
      const beaconPeople5 = page.locator('text=People: 5').first();
      assert(await beaconPeople5.isVisible(), 'Active rescue beacon must maintain People: 5');

      // Verify Injured badge is NOT present in the banner
      const bannerInjuredBadge = page.locator('text=• Injured:');
      assert(!(await bannerInjuredBadge.isVisible()), 'Injured badge must disappear from beacon banner when injuredCount=0');

      // Database verification
      const activeRequests = await prisma.emergencyRequest.findMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true },
      });
      assert(activeRequests.length === 1, 'Still exactly one active SOS');
      assert(activeRequests[0].id === activeSosIdFromTurn1, 'SOS ID must remain unchanged');
      const formatted = formatRescueRequest(activeRequests[0]);
      assert(formatted.peopleCount === 5, `peopleCount should remain 5, got ${formatted.peopleCount}`);
      assert(formatted.injuredCount === 0, `injuredCount should be cleared to 0, got ${formatted.injuredCount}`);
      assert(formatted.elderlyCount === 1, `elderlyCount should remain 1, got ${formatted.elderlyCount}`);

      const condTypes = activeRequests[0].conditions.map((c) => c.conditionType);
      assert(!condTypes.includes('HEAVILY_INJURED'), `HEAVILY_INJURED must be deleted from database conditions`);
    });

  } finally {
    if (browser) await browser.close();
    mockDeepgramServer?.close();
    httpServer?.close();
  }

  console.log('\n================================================================');
  console.log(`REAL BROWSER VERIFICATION: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRealBrowserDeepgramSuite().catch((err) => {
  console.error('Fatal browser test failure:', err);
  process.exit(1);
});
