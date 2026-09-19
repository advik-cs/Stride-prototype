import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import createApp from '../src/server/app.ts';
import prisma from '../src/server/config/database.ts';
import { getVoiceProvider, getSelectedVoiceProviderType } from '../src/services/voice/voiceProviderFactory.ts';
import { GeminiLiveProvider } from '../src/services/voice/GeminiLiveProvider.ts';
import {
  float32ToInt16PCM,
  pcmToBase64,
  base64ToPCM,
  downsampleTo16k,
} from '../src/services/voice/pcmAudioProcessor.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'stride-hackathon-secure-jwt-secret-key-2026';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runGeminiLiveVoiceTestSuite() {
  console.log('================================================================');
  console.log('🎙️ STRIDE GEMINI LIVE VOICE & MODULAR VOICE PROVIDER TEST SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return (async () => {
      try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passedTests++;
      } catch (err: any) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     ${err?.message || err}`);
        failedTests++;
      }
    })();
  }

  // Spin up ephemeral test server on port 0
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Ephemeral test server active at: ${baseUrl}\n`);

  // Ensure test citizen exists
  let citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });

  if (!citizen) {
    citizen = await prisma.user.create({
      data: {
        email: 'live_voice_test_citizen@stride.org',
        passwordHash: 'dummy',
        name: 'Live Voice Citizen',
        mobileNumber: '9988776655',
        role: 'CITIZEN',
      },
      include: { households: { include: { members: true } } },
    });
  }

  const citizenToken = jwt.sign(
    { userId: citizen.id, email: citizen.email, role: citizen.role },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${citizenToken}`,
  };

  try {
    // -------------------------------------------------------------------------
    // SUITE 1: Modular VoiceProvider Interface & Factory
    // -------------------------------------------------------------------------
    console.log('--- SUITE 1: Modular VoiceProvider Interface & Factory ---');

    await test('Default provider selection resolves to "gemini"', () => {
      const defaultType = getSelectedVoiceProviderType();
      assert(defaultType === 'gemini', `Expected 'gemini', got '${defaultType}'`);
    });

    await test('Factory instantiates GeminiLiveProvider for "gemini"', () => {
      const provider = getVoiceProvider('gemini');
      assert(provider instanceof GeminiLiveProvider, 'Must be instance of GeminiLiveProvider');
      assert(provider.name === 'gemini-live', `Expected name 'gemini-live', got '${provider.name}'`);
      assert(provider.status === 'IDLE', `Expected initial status 'IDLE', got '${provider.status}'`);
    });

    await test('Factory throws user-friendly error for future unimplemented provider ("openai")', () => {
      let threw = false;
      try {
        getVoiceProvider('openai');
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('not yet implemented'), `Error must mention not yet implemented: ${err.message}`);
      }
      assert(threw, 'Must throw for unimplemented provider');
    });

    await test('Factory throws user-friendly error for unsupported provider', () => {
      let threw = false;
      try {
        getVoiceProvider('unknown-speech-engine');
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('Unsupported voice provider'), `Error must mention unsupported: ${err.message}`);
      }
      assert(threw, 'Must throw for unsupported provider');
    });

    // -------------------------------------------------------------------------
    // SUITE 2: PCM Audio Math & Web Audio Processing
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 2: PCM Audio Math & Format Integrity ---');

    await test('float32ToInt16PCM correctly converts and clamps samples', () => {
      const samples = new Float32Array([0.0, 1.0, -1.0, 0.5, -0.5, 2.0, -2.0]);
      const pcm16 = float32ToInt16PCM(samples);
      assert(pcm16.length === 7, 'Length must match');
      assert(pcm16[0] === 0, '0.0 must be 0');
      assert(pcm16[1] === 32767, '1.0 must be 32767');
      assert(pcm16[2] === -32768, '-1.0 must be -32768');
      assert(pcm16[5] === 32767, '2.0 clamped to 32767');
      assert(pcm16[6] === -32768, '-2.0 clamped to -32768');
    });

    await test('pcmToBase64 and base64ToPCM round-trip is lossless', () => {
      const original = new Int16Array([100, -200, 3000, -4000, 32767, -32768, 0]);
      const b64 = pcmToBase64(original);
      const decoded = base64ToPCM(b64);
      assert(decoded.length === original.length, 'Length mismatch');
      for (let i = 0; i < original.length; i++) {
        assert(decoded[i] === original[i], `Sample mismatch at ${i}: expected ${original[i]}, got ${decoded[i]}`);
      }
    });

    await test('downsampleTo16k resamples 48kHz audio to 16kHz (3:1 ratio)', () => {
      const samples48k = new Float32Array(480);
      for (let i = 0; i < samples48k.length; i++) samples48k[i] = 0.5;
      const resampled = downsampleTo16k(samples48k, 48000, 16000);
      assert(resampled.length === 160, `Expected 160 samples, got ${resampled.length}`);
      assert(Math.abs(resampled[0] - 0.5) < 0.001, 'Sample value preserved');
    });

    // -------------------------------------------------------------------------
    // SUITE 3: Ephemeral Token Endpoint Security
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 3: Ephemeral Token Endpoint Security ---');

    await test('POST /api/voice/session-token rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/voice/session-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      assert(res.status === 401, `Expected 401 Unauthorized, got ${res.status}`);
    });

    await test('POST /api/voice/session-token returns structured session info without exposing secret key', async () => {
      const res = await fetch(`${baseUrl}/api/voice/session-token`, {
        method: 'POST',
        headers: authHeaders,
      });
      assert(res.ok, `Expected 200 OK, got ${res.status}`);
      const data: any = await res.json();
      assert(typeof data.liveEnabled === 'boolean', 'liveEnabled must be boolean');
      assert(typeof data.model === 'string', 'model must be string');
      assert(typeof data.webSocketUrl === 'string', 'webSocketUrl must be string');
      // Verify raw GEMINI_API_KEY is NEVER exposed directly
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
        assert(!JSON.stringify(data).includes(process.env.GEMINI_API_KEY), 'Permanent GEMINI_API_KEY must NEVER be leaked in response');
      }
    });

    // -------------------------------------------------------------------------
    // SUITE 4: Final Transcript Integration with Deterministic Triage
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 4: Final Transcript Triage & Deterministic Priority ---');

    let activeSosId: string | null = null;

    await test('Final transcript: "There are four people with me and we are trapped upstairs."', async () => {
      const transcript = 'There are four people with me and we are trapped upstairs.';
      const res = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          message: transcript,
          history: [],
          currentLocation: { latitude: 12.9716, longitude: 77.5946 },
        }),
      });

      assert(res.ok, `Expected 200, got ${res.status}`);
      const data: any = await res.json();

      assert(data.mode === 'EMERGENCY', `Expected mode EMERGENCY, got ${data.mode}`);
      assert(data.shouldCreateOrUpdateSos === true, 'shouldCreateOrUpdateSos must be true');
      assert(data.extractedInformation?.peopleCount === 4, `Expected peopleCount=4, got ${data.extractedInformation?.peopleCount}`);
      assert(data.extractedInformation?.emergencyType === 'TRAPPED', `Expected emergencyType=TRAPPED, got ${data.extractedInformation?.emergencyType}`);

      const sos = data.activeRequest;
      assert(sos, 'Active SOS record must be returned');
      assert(sos.peopleCount === 4, `SOS peopleCount must be 4, got ${sos.peopleCount}`);
      activeSosId = sos.id;

      // Deterministic priority breakdown: trappedOrStructural (20) + waterLevel HIGH (15) = 35
      assert(sos.priorityScore === 35, `Deterministic priority score must be 35, got ${sos.priorityScore}`);
      assert(sos.priorityLevel === 'MEDIUM', `Priority level must be MEDIUM, got ${sos.priorityLevel}`);
    });

    await test('Second conversational turn: "What should I do while waiting?"', async () => {
      assert(activeSosId !== null, 'activeSosId must exist');
      const res = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          message: 'What should I do while waiting?',
          history: [
            { role: 'user', content: 'There are four people with me and we are trapped upstairs.' },
            { role: 'assistant', content: 'I have logged your distress call.' },
          ],
          activeRequestId: activeSosId,
          currentLocation: { latitude: 12.9716, longitude: 77.5946 },
        }),
      });

      assert(res.ok, `Expected 200, got ${res.status}`);
      const data: any = await res.json();
      assert(data.mode === 'ASSIST', `Expected mode ASSIST, got ${data.mode}`);
      assert(data.shouldCreateOrUpdateSos === false, 'shouldCreateOrUpdateSos must be false for inquiry');
      assert(typeof data.assistantResponse === 'string' && data.assistantResponse.length > 20, 'Grounded response returned');
      assert(data.activeRequest?.id === activeSosId, 'Must preserve existing active SOS ID in place');
      assert(data.activeRequest?.peopleCount === 4, 'People count must remain 4');
    });

    await test('Current-turn fact update: "My grandmother is injured."', async () => {
      assert(activeSosId !== null, 'activeSosId must exist');
      const res = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          message: 'My grandmother is injured.',
          history: [],
          activeRequestId: activeSosId,
          currentLocation: { latitude: 12.9716, longitude: 77.5946 },
        }),
      });

      assert(res.ok, `Expected 200, got ${res.status}`);
      const data: any = await res.json();
      assert(data.activeRequest?.id === activeSosId, 'SOS ID must match existing request in place (no duplicate)');
      assert(data.activeRequest?.peopleCount === 4, 'People count must remain 4');
      assert(data.activeRequest?.injuredCount === 1, `Injured count must update to 1, got ${data.activeRequest?.injuredCount}`);
      // Priority updates: elderly(8) + injured(15) + water(15) = 38 (emergencyType MEDICAL)
      assert(data.activeRequest?.priorityScore === 38, `Priority score must update to 38, got ${data.activeRequest?.priorityScore}`);
    });

    await test('Speculative statement does NOT confirm child count: "There might be another child upstairs."', async () => {
      assert(activeSosId !== null, 'activeSosId must exist');
      const res = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          message: 'There might be another child upstairs.',
          history: [],
          activeRequestId: activeSosId,
          currentLocation: { latitude: 12.9716, longitude: 77.5946 },
        }),
      });

      assert(res.ok, `Expected 200, got ${res.status}`);
      const data: any = await res.json();
      assert(data.extractedInformation?.childrenCount === undefined, 'Speculative child count must NOT be confirmed');
      assert(data.activeRequest?.childrenCount === 0, 'SOS childrenCount must remain 0');
    });

    await test('Vague query ("Can you help me?") does NOT fabricate SOS facts', async () => {
      const res = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          message: 'Can you help me?',
          history: [],
        }),
      });

      assert(res.ok, `Expected 200, got ${res.status}`);
      const data: any = await res.json();
      assert(data.mode === 'ASSIST', `Expected mode ASSIST, got ${data.mode}`);
      assert(data.shouldCreateOrUpdateSos === false, 'shouldCreateOrUpdateSos must be false');
      assert(Object.keys(data.extractedInformation || {}).length === 0, 'Extracted information must be empty');
    });

    // -------------------------------------------------------------------------
    // SUITE 5: Safe Beacon Cleanup
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 5: Safe Beacon Cleanup ---');

    await test('POST /api/voice/reset-test-beacon cancels active beacon cleanly', async () => {
      const res = await fetch(`${baseUrl}/api/voice/reset-test-beacon`, {
        method: 'POST',
        headers: authHeaders,
      });

      assert(res.ok, `Expected 200, got ${res.status}`);
      const data: any = await res.json();
      assert(data.success === true, 'Reset beacon must succeed');
    });

  } finally {
    server.close();
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runGeminiLiveVoiceTestSuite().catch((err) => {
  console.error('Fatal error running Gemini Live voice test suite:', err);
  process.exit(1);
});
