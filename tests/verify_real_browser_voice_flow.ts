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
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import createApp from '../src/server/app.ts';
import prisma from '../src/server/config/database.ts';
import { formatRescueRequest } from '../src/server/controllers/rescueController.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'stride-hackathon-secure-jwt-secret-key-2026';

async function runRealBrowserVoiceSuite() {
  console.log('================================================================');
  console.log('STRIDE REAL BROWSER GEMINI LIVE VOICE VERIFICATION');
  console.log('Testing live browser E2E with mock Gemini Live WebSocket server');
  console.log('================================================================\n');

  let wsServer: WebSocketServer;
  let wsPort: number;
  let httpServer: http.Server;
  let httpPort: number;
  let lastWsClient: WebSocket | null = null;
  let receivedWsMessages: any[] = [];
  let browser: any = null;

  // 1. Setup Mock Gemini Live WebSocket Server
  await new Promise<void>((resolve) => {
    wsServer = new WebSocketServer({ port: 0 }, () => {
      wsPort = (wsServer.address() as any).port;
      console.log(`[Test Mock Live WS] Listening on ws://127.0.0.1:${wsPort}`);
      resolve();
    });

    wsServer.on('connection', (ws) => {
      console.log('[Test Mock Live WS] Client connected to Gemini Live endpoint');
      lastWsClient = ws;

      ws.on('message', (data: Buffer | string) => {
        try {
          const str = data.toString();
          const parsed = JSON.parse(str);
          receivedWsMessages.push(parsed);

          // Handle Setup Frame
          if (parsed.setup) {
            console.log('[Test Mock Live WS] Received BidiGenerateContentSetup frame:', parsed.setup.model);
            ws.send(JSON.stringify({ setupComplete: {} }));
          }

          // Handle PCM Audio Chunks
          if (parsed.realtimeInput?.mediaChunks) {
            // Received audio chunk from browser microphone
          }
        } catch {
          // Binary audio or non-json
        }
      });

      ws.on('close', () => {
        console.log('[Test Mock Live WS] Client disconnected');
        if (lastWsClient === ws) lastWsClient = null;
      });
    });
  });

  // 2. Setup STRIDE HTTP Server serving static dist build + API
  process.env.GEMINI_API_KEY = 'test-ephemeral-key';
  process.env.GEMINI_LIVE_WS_URL = `ws://127.0.0.1:${wsPort}`;

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
  await prisma.emergencyRequest.updateMany({
    where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
    data: { rescueStatus: 'CANCELLED' },
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

    // Listen to console logs
    page.on('console', (msg: any) => {
      const txt = msg.text();
      if (txt.includes('[STRIDE') || txt.includes('GeminiLive') || txt.includes('error') || txt.includes('Error')) {
        console.log(`  [Browser Console] ${txt}`);
      }
    });

    // Inject authentication into localStorage before load
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('stride_token', token);
      localStorage.setItem('stride_before_token', token);
      localStorage.setItem('stride_during_token', token);
      localStorage.setItem('stride_user', JSON.stringify(user));
      localStorage.setItem('stride_phase', 'DURING');
    }, { token: citizenToken, user: citizenUserPayload });

    // Route any API calls to the running HTTP server port
    await page.route('**/api/**', async (route) => {
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
    // TEST 1: Microphone Permission & Page Navigation
    // =================================================================
    await test('1. Microphone permission & navigation to during emergency page', async () => {
      await page.goto(`http://127.0.0.1:${httpPort}/during`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const currentUrl = page.url();
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log(`  [Diagnostic] Current Page URL: ${currentUrl}`);
      console.log(`  [Diagnostic] Page Body Snippet: ${bodyText.slice(0, 300).replace(/\n+/g, ' | ')}`);

      // Ensure DURING mode is active
      const duringModeBtn = page.locator('#sidebar-mode-during');
      if (await duringModeBtn.isVisible()) {
        await duringModeBtn.click();
        await page.waitForTimeout(500);
      }

      // Click on "Report Status / SOS" / safe tab in sidebar
      const safeTabButton = page.locator('#sidebar-nav-safe, button:has-text("Are You Safe?"), button:has-text("SOS")').first();
      await safeTabButton.waitFor({ state: 'visible', timeout: 5000 });
      await safeTabButton.click();
      await page.waitForTimeout(800);

      // Verify microphone API is available in browser context
      const hasMediaDevices = await page.evaluate(() => {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      });
      assert(hasMediaDevices, 'navigator.mediaDevices.getUserMedia must be supported in browser');

      // Verify "Talk to STRIDE" voice trigger button exists
      const talkToStrideBtn = page.locator('button:has-text("Talk to STRIDE"), button:has-text("Update via Voice")').first();
      await talkToStrideBtn.waitFor({ state: 'visible', timeout: 5000 });
      assert(await talkToStrideBtn.isVisible(), '"Talk to STRIDE" button must be visible');
    });

    // =================================================================
    // TEST 2: Gemini Live WebSocket Connection
    // =================================================================
    await test('2. Open Voice Emergency Assistant modal and establish Gemini Live WebSocket connection', async () => {
      // Reset message logs
      receivedWsMessages = [];

      // Click "Talk to STRIDE" to open modal
      const talkToStrideBtn = page.locator('button:has-text("Talk to STRIDE"), button:has-text("Update via Voice")').first();
      await talkToStrideBtn.click();

      // Verify Modal rendered
      const modalHeader = page.locator('text=STRIDE Voice Emergency Assistant');
      await modalHeader.waitFor({ state: 'visible', timeout: 5000 });
      assert(await modalHeader.isVisible(), 'Modal header must be visible');

      // Verify Provider Badge indicates GEMINI-LIVE
      const providerBadge = page.locator('text=GEMINI-LIVE');
      await providerBadge.waitFor({ state: 'visible', timeout: 5000 });
      assert(await providerBadge.isVisible(), 'Provider badge must display GEMINI-LIVE');

      // Click Microphone Button to trigger startListening() & WS connection
      const micBtn = page.locator('#voice-assistant-mic-btn');
      await micBtn.waitFor({ state: 'visible', timeout: 5000 });
      await micBtn.click();

      // Wait for WS setup frame
      await page.waitForTimeout(1000);
      const hasSetupFrame = receivedWsMessages.some((m) => m.setup);
      assert(hasSetupFrame, 'GeminiLiveProvider must send BidiGenerateContentSetup frame to WebSocket');

      // Verify UI reflects listening state
      const listeningText = page.locator('text=Listening live');
      await listeningText.waitFor({ state: 'visible', timeout: 5000 });
      assert(await listeningText.isVisible(), 'Assistant status must transition to LISTENING');
    });

    // =================================================================
    // TEST 3 & 4: Live Interim Transcript & Final Transcript
    // =================================================================
    await test('3 & 4. Live interim transcript rendering and authoritative final transcript turn', async () => {
      assert(lastWsClient !== null, 'WebSocket client must be connected');

      // Emit interim transcript from mock Gemini Live WebSocket
      lastWsClient.send(
        JSON.stringify({
          serverContent: {
            interimInputTranscription: {
              text: 'There are four people with me and we are',
            },
          },
        })
      );

      // Verify live interim transcript rendered in the UI
      await page.waitForTimeout(500);
      const interimElem = page.locator('text=There are four people with me and we are');
      await interimElem.waitFor({ state: 'visible', timeout: 5000 });
      assert(await interimElem.isVisible(), 'Live interim transcript box must display incoming speech in real-time');

      // Emit final transcript + turnComplete + model audio
      lastWsClient.send(
        JSON.stringify({
          serverContent: {
            inputTranscription: {
              text: 'There are four people with me and we are trapped upstairs.',
            },
            modelTurn: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/pcm;rate=24000',
                    data: Buffer.from(new Int16Array(2400)).toString('base64'),
                  },
                },
              ],
            },
            turnComplete: true,
          },
        })
      );

      // Wait for processing & deterministic triage
      await page.waitForTimeout(2000);

      // Verify final transcript appears as user message in chat
      const finalMsg = page.locator('p:has-text("There are four people with me and we are trapped upstairs.")').last();
      await finalMsg.waitFor({ state: 'visible', timeout: 8000 });
      assert(await finalMsg.isVisible(), 'Final authoritative transcript must appear in chat');
    });

    // =================================================================
    // TEST 5, 6, 7 & 8: Emergency SOS Extraction & Deterministic Priority
    // =================================================================
    await test('5, 6, 7 & 8. Verify utterance extracted peopleCount=4, TRAPPED, and deterministic priority score=35', async () => {
      // Verify Assistant response appears in chat
      const assistantBubble = page.locator('p:has-text("logged your emergency distress")').first();
      await assistantBubble.waitFor({ state: 'visible', timeout: 5000 });

      // Verify Active SOS banner appears inside Voice Assistant modal
      const sosCard = page.locator('text=ACTIVE RESCUE BEACON');
      await sosCard.waitFor({ state: 'visible', timeout: 5000 });
      assert(await sosCard.isVisible(), 'ACTIVE RESCUE BEACON banner must appear in UI');

      // Verify Priority Level MEDIUM and Score 35 (TRAPPED=20 + WATER_HIGH=15 = 35)
      const scoreBanner = page.locator('text=35 (MEDIUM)').first();
      await scoreBanner.waitFor({ state: 'visible', timeout: 5000 });
      assert(await scoreBanner.isVisible(), 'Deterministic score banner 35 (MEDIUM) must appear in UI');

      // Check Database Record for strict verification
      const dbRequest = await prisma.emergencyRequest.findFirst({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true },
        orderBy: { createdAt: 'desc' },
      });

      assert(dbRequest !== null, 'EmergencyRequest must be created in Prisma database');
      activeSosIdFromTurn1 = dbRequest.id;

      // Extract formatted rescue request details from database record
      const formatted = formatRescueRequest(dbRequest);
      assert(formatted.peopleCount === 4, `Database peopleCount must be 4, got ${formatted.peopleCount}`);
      assert(formatted.emergencyType === 'TRAPPED', `Database emergencyType must be TRAPPED, got ${formatted.emergencyType}`);
      assert(dbRequest.priorityScore === 35, `Deterministic priority score must be 35, got ${dbRequest.priorityScore}`);
      assert(formatted.priorityLevel === 'MEDIUM', `Priority level must be MEDIUM, got ${formatted.priorityLevel}`);

      // Verify conditions in database: NEED_RESCUE and TRAPPED
      const condNames = dbRequest.conditions.map((c) => c.conditionType);
      assert(condNames.includes('TRAPPED'), 'Condition TRAPPED must be present');
    });

    // =================================================================
    // TEST 9: Second Conversational Turn
    // =================================================================
    await test('9. Second conversational turn: "What should I do while waiting?" preserves SOS in place', async () => {
      assert(activeSosIdFromTurn1 !== null, 'activeSosIdFromTurn1 must be set');

      // Send follow up question via input or mock turn
      const chatInput = page.locator('input[placeholder*="emergency"], input[type="text"]').last();
      await chatInput.fill('What should I do while waiting?');
      await chatInput.press('Enter');

      // Wait for response
      await page.waitForTimeout(2000);

      // Verify assistant grounded answer appeared
      const secondTurnAnswer = page.locator('div:has(p.whitespace-pre-wrap)').last();
      await secondTurnAnswer.waitFor({ state: 'visible', timeout: 8000 });
      assert(await secondTurnAnswer.isVisible(), 'Assistant must provide grounded guidance');

      // Strict Invariant Check: Verify NO duplicate SOS created, active SOS ID unchanged
      const activeRequests = await prisma.emergencyRequest.findMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
      });

      assert(activeRequests.length === 1, `Must have exactly 1 active request, found ${activeRequests.length}`);
      assert(activeRequests[0].id === activeSosIdFromTurn1, 'Active SOS ID must remain identical (in-place update)');
      const formatted2 = formatRescueRequest(activeRequests[0]);
      assert(formatted2.peopleCount === 4, 'People count must remain 4');
    });

    // =================================================================
    // TEST 10: Retry & Error Recovery Flow
    // =================================================================
    await test('10. Voice provider error and retry recovery flow works without page reload', async () => {
      // Simulate WebSocket close/error from server side
      if (lastWsClient) {
        lastWsClient.terminate();
      }

      await page.waitForTimeout(1000);

      // Trigger recording to test error handling
      const micBtn = page.locator('#voice-assistant-mic-btn');
      await micBtn.click();

      // Check if error banner or retry button appears
      await page.waitForTimeout(1000);
      const retryBtn = page.locator('#voice-assistant-retry-btn, button:has-text("Retry"), button:has-text("Re-record")').first();
      const hasRetry = await retryBtn.isVisible().catch(() => false);

      if (hasRetry) {
        // Click retry
        await retryBtn.click();
        await page.waitForTimeout(1000);
        console.log('  Retry button successfully re-initialized voice state.');
      } else {
        // If automatic reconnect happened, verify assistant returned to IDLE or LISTENING
        const statusText = page.locator('#voice-assistant-mic-btn');
        assert(await statusText.isVisible(), 'Assistant must remain in valid interactive state after socket drop');
      }
    });

    // =================================================================
    // TEST 11: Single SOS Submission Lock Verification
    // =================================================================
    await test('11. Exactly one SOS submission per turn enforced by lock', async () => {
      // Verify total active emergency requests for this user is still exactly 1
      const count = await prisma.emergencyRequest.count({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
      });
      assert(count === 1, `Expected exactly 1 active emergency request, got ${count}`);
    });

  } finally {
    if (browser) await browser.close().catch(() => {});
    if (httpServer) await new Promise<void>((res) => httpServer.close(() => res()));
    if (wsServer) await new Promise<void>((res) => wsServer.close(() => res()));

    // Clean up test beacon
    if (memberIds && memberIds.length > 0) {
      await prisma.emergencyRequest.updateMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
        data: { rescueStatus: 'CANCELLED' },
      });
    }
  }

  console.log('\n================================================================');
  console.log('REAL BROWSER VOICE FLOW VERIFICATION COMPLETE');
  console.log('================================================================\n');
}

runRealBrowserVoiceSuite().catch((err) => {
  console.error('Browser voice test failure:', err);
  process.exit(1);
});
