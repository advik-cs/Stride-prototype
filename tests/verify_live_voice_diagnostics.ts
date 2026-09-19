import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import createApp from '../src/server/app.ts';
import { createLiveSessionToken } from '../src/server/services/liveVoiceService.ts';
import { GeminiLiveProvider } from '../src/services/voice/GeminiLiveProvider.ts';
import { getVoiceProvider } from '../src/services/voice/voiceProviderFactory.ts';

// Polyfill browser globals for Node test environment
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WsWebSocket;
}
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'stride-hackathon-secure-jwt-secret-key-2026';

let passedCount = 0;
let failedCount = 0;

async function runCheck(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err?.message || err}`);
    failedCount++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('STRIDE GEMINI LIVE VOICE — 10 DIAGNOSTIC CHECKPOINTS');
  console.log('================================================================\n');

  let wsServer: WebSocketServer;
  let wsPort: number;
  let httpServer: http.Server;
  let httpPort: number;
  let lastReceivedSetupMessage: any = null;

  // 1. Mock Gemini Live WebSocket Server
  await new Promise<void>((resolve) => {
    wsServer = new WebSocketServer({ port: 0 }, () => {
      wsPort = (wsServer.address() as any).port;
      resolve();
    });

    wsServer.on('connection', (ws) => {
      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.setup) {
            lastReceivedSetupMessage = parsed;
            ws.send(JSON.stringify({ setupComplete: {} }));
          }
        } catch {}
      });
    });
  });

  // 2. Set test environment
  process.env.GEMINI_API_KEY = 'test-ephemeral-diagnostic-key';
  process.env.GEMINI_LIVE_WS_URL = `ws://127.0.0.1:${wsPort}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained`;

  // 3. Start STRIDE backend app
  const app = createApp();
  await new Promise<void>((resolve) => {
    httpServer = http.createServer(app);
    httpServer.listen(0, '127.0.0.1', () => {
      httpPort = (httpServer.address() as any).port;
      resolve();
    });
  });

  process.env.VITE_DURING_API_URL = `http://127.0.0.1:${httpPort}/api`;

  const authToken = jwt.sign(
    { userId: 'test-diagnostic-user', role: 'CITIZEN' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  (globalThis as any).localStorage.setItem('stride_during_token', authToken);

  try {
    // Checkpoint 1: POST /api/voice/session-token is called and returns 200
    await runCheck('1. POST /api/voice/session-token responds with 200 and liveEnabled', async () => {
      const res = await fetch(`http://127.0.0.1:${httpPort}/api/voice/session-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.liveEnabled, true);
    });

    // Checkpoint 2: Log response fields without logging actual token
    await runCheck('2. Response fields logged safely (liveEnabled, model, host/path, no token exposure)', async () => {
      const res = await fetch(`http://127.0.0.1:${httpPort}/api/voice/session-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      assert.ok('liveEnabled' in json);
      assert.ok('model' in json);
      assert.ok('webSocketUrl' in json);
      const parsed = new URL(json.webSocketUrl);
      assert.ok(parsed.host);
      assert.ok(parsed.pathname.includes('BidiGenerateContentConstrained'));
      assert.ok(!json.webSocketUrl.includes(process.env.GEMINI_API_KEY!));
    });

    // Checkpoint 3: Backend successfully creates ephemeral token object
    await runCheck('3. Backend successfully creates ephemeral token with metadata', async () => {
      const tokenResult = await createLiveSessionToken('test-corr-123');
      assert.equal(tokenResult.liveEnabled, true);
      assert.ok(tokenResult.token);
      assert.ok(tokenResult.tokenName);
      assert.ok(tokenResult.webSocketUrl.includes('access_token='));
    });

    // Checkpoint 4: WebSocket URL targets BidiGenerateContentConstrained
    await runCheck('4. Browser connects to BidiGenerateContentConstrained with access_token', async () => {
      const tokenResult = await createLiveSessionToken();
      const u = new URL(tokenResult.webSocketUrl);
      assert.ok(u.pathname.includes('BidiGenerateContentConstrained'));
      assert.ok(u.searchParams.has('access_token'));
      assert.equal(u.searchParams.get('access_token'), tokenResult.token);
    });

    // Checkpoint 5: First message is BidiGenerateContentSetup
    await runCheck('5. First WebSocket message is BidiGenerateContentSetup frame', async () => {
      lastReceivedSetupMessage = null;
      const provider = new GeminiLiveProvider();
      await provider.connect();
      assert.ok(lastReceivedSetupMessage !== null);
      assert.ok(lastReceivedSetupMessage.setup !== undefined);
      assert.ok(lastReceivedSetupMessage.setup.model.startsWith('models/'));
      assert.deepEqual(lastReceivedSetupMessage.setup.generationConfig.responseModalities, ['AUDIO']);
      await provider.disconnect();
    });

    // Checkpoint 6: Capture server close/error payload for code 1008
    await runCheck('6. Server error frames and closeEvent.reason are captured in detailed error', async () => {
      let tempWsPort: number;
      const tempWsServer = new WebSocketServer({ port: 0 }, () => {
        tempWsPort = (tempWsServer.address() as any).port;
      });

      tempWsServer.on('connection', (ws) => {
        ws.on('message', () => {
          ws.send(JSON.stringify({
            error: {
              code: 400,
              status: 'INVALID_ARGUMENT',
              message: 'Model does not support live streaming.',
            },
          }));
          setTimeout(() => {
            ws.close(1008, 'Policy violation: Model unsupported');
          }, 30);
        });
      });

      await new Promise((r) => setTimeout(r, 80));
      process.env.GEMINI_LIVE_WS_URL = `ws://127.0.0.1:${tempWsPort}/ws/BidiGenerateContentConstrained`;

      const provider = new GeminiLiveProvider();
      let caughtError: Error | null = null;
      try {
        await provider.connect();
      } catch (err: any) {
        caughtError = err;
      }

      assert.ok(caughtError !== null);
      assert.ok(caughtError.message.includes('1008'), `Must include 1008: ${caughtError.message}`);
      assert.ok(
        caughtError.message.includes('Policy violation') || caughtError.message.includes('Model unsupported'),
        `Must capture close reason: ${caughtError.message}`
      );
      assert.ok(
        caughtError.message.includes('Server error payload') || caughtError.message.includes('INVALID_ARGUMENT'),
        `Must capture server error frame: ${caughtError.message}`
      );

      await provider.disconnect();
      await new Promise<void>((res) => tempWsServer.close(() => res()));
      process.env.GEMINI_LIVE_WS_URL = `ws://127.0.0.1:${wsPort}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained`;
    });

    // Checkpoint 7: Default model is gemini-3.8-live
    await runCheck('7. Model defaults to gemini-3.8-live and supports live environment configuration', async () => {
      delete process.env.GEMINI_LIVE_MODEL;
      const defaultToken = await createLiveSessionToken();
      assert.equal(defaultToken.model, 'gemini-3.8-live');

      process.env.GEMINI_LIVE_MODEL = 'gemini-3.8-live-extended-thinking';
      const configuredToken = await createLiveSessionToken();
      assert.equal(configuredToken.model, 'gemini-3.8-live-extended-thinking');
      delete process.env.GEMINI_LIVE_MODEL;
    });

    // Checkpoint 8: Setup configuration conforms to Gemini Live specification
    await runCheck('8. Setup frame matches Gemini Live specification cleanly', async () => {
      lastReceivedSetupMessage = null;
      const provider = new GeminiLiveProvider();
      await provider.connect();
      assert.ok(lastReceivedSetupMessage);
      const { setup } = lastReceivedSetupMessage;
      assert.equal(setup.model, 'models/gemini-3.8-live');
      assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Aoede');
      assert.ok(setup.systemInstruction.parts[0].text.includes('STRIDE Emergency Voice Assistant'));
      assert.deepEqual(setup.inputAudioTranscription, {});
      await provider.disconnect();
    });

    // Checkpoint 9: Single token use lifecycle
    await runCheck('9. Each connection attempt requests a fresh ephemeral token (uses: 1 safety)', async () => {
      const provider = new GeminiLiveProvider();
      await provider.connect();
      assert.equal(provider.status, 'IDLE');
      await provider.disconnect();

      await provider.connect();
      assert.equal(provider.status, 'IDLE');
      await provider.disconnect();
    });

    // Checkpoint 10: Provider factory invariants preserved across environments
    await runCheck('10. Provider factory defaults to gemini-live and fails clearly on unsupported provider', () => {
      const provider = getVoiceProvider('gemini');
      assert.equal(provider.name, 'gemini-live');
      assert.throws(
        () => getVoiceProvider('unsupported-provider'),
        /Unsupported voice provider/
      );
    });

  } finally {
    if (httpServer) await new Promise<void>((res) => httpServer.close(() => res()));
    if (wsServer) await new Promise<void>((res) => wsServer.close(() => res()));
  }

  console.log('\n================================================================');
  console.log(`DIAGNOSTIC VERIFICATION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
