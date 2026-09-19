import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  transcribeAudioWithDeepgram,
  synthesizeSpeechWithDeepgram,
} from '../src/server/services/deepgramService.ts';
import createApp from '../src/server/app.ts';
import { getVoiceProvider, getSelectedVoiceProviderType } from '../src/services/voice/voiceProviderFactory.ts';
import { DeepgramVoiceProvider } from '../src/services/voice/DeepgramVoiceProvider.ts';
import { GeminiLiveProvider } from '../src/services/voice/GeminiLiveProvider.ts';
import prisma from '../src/server/config/database.ts';
import { formatRescueRequest } from '../src/server/controllers/rescueController.ts';

// Polyfill browser globals for Node test environment
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
    throw err;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('STRIDE DEEPGRAM TURN-BASED VOICE SUITE (17 SCENARIOS)');
  console.log('================================================================\n');

  let mockDeepgramServer: http.Server;
  let mockDeepgramPort: number;
  let lastSttRequestHeaders: any = null;
  let lastSttRequestBody: Buffer | null = null;
  let lastSttUrl: string = '';
  let lastTtsRequestHeaders: any = null;
  let lastTtsRequestBody: any = null;
  let lastTtsUrl: string = '';
  let mockSttResponse = {
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: 'We are four people and we are trapped upstairs.',
              confidence: 0.98,
            },
          ],
        },
      ],
    },
  };
  let mockTtsResponseBuffer = Buffer.from('mock-mp3-audio-bytes-for-tts');
  let mockStatusCode = 200;

  // 1. Setup Mock Deepgram HTTP Server
  await new Promise<void>((resolve) => {
    const mockApp = express();
    mockApp.use((req, res, next) => {
      if (req.path.startsWith('/v1/listen')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          lastSttRequestBody = Buffer.concat(chunks);
          lastSttRequestHeaders = req.headers;
          lastSttUrl = req.url;

          if (mockStatusCode !== 200) {
            res.status(mockStatusCode).json({ err_code: 'MOCK_ERROR', err_msg: 'Mock error from Deepgram' });
          } else {
            res.json(mockSttResponse);
          }
        });
      } else if (req.path.startsWith('/v1/speak')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          try {
            lastTtsRequestBody = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            lastTtsRequestBody = null;
          }
          lastTtsRequestHeaders = req.headers;
          lastTtsUrl = req.url;

          if (mockStatusCode !== 200) {
            res.status(mockStatusCode).json({ err_code: 'MOCK_ERROR', err_msg: 'Mock error from Deepgram' });
          } else {
            res.setHeader('content-type', 'audio/mp3');
            res.send(mockTtsResponseBuffer);
          }
        });
      } else {
        next();
      }
    });

    mockDeepgramServer = http.createServer(mockApp);
    mockDeepgramServer.listen(0, '127.0.0.1', () => {
      mockDeepgramPort = (mockDeepgramServer.address() as any).port;
      resolve();
    });
  });

  const mockBaseUrl = `http://127.0.0.1:${mockDeepgramPort}`;
  process.env.DEEPGRAM_BASE_URL = mockBaseUrl;
  process.env.DEEPGRAM_API_KEY = 'test-deepgram-api-key-12345';

  // Setup STRIDE app for controller tests
  const app = createApp();
  let strideServer: http.Server;
  let stridePort: number;

  await new Promise<void>((resolve) => {
    strideServer = http.createServer(app);
    strideServer.listen(0, '127.0.0.1', () => {
      stridePort = (strideServer.address() as any).port;
      resolve();
    });
  });

  // Setup / fetch citizen user with household
  let testUser = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });

  if (!testUser || !testUser.households[0]?.members[0]) {
    let disaster = await prisma.disasterEvent.findFirst();
    if (!disaster) {
      disaster = await prisma.disasterEvent.create({
        data: {
          title: 'Bangalore Flood 2026',
          type: 'FLOOD',
          status: 'ACTIVE',
          severity: 'HIGH',
        },
      });
    }

    testUser = await prisma.user.create({
      data: {
        id: `test-citizen-dg-${Date.now()}`,
        name: 'Deepgram Test Citizen',
        testIdentityNumber: `ID-DG-${Date.now()}`,
        mobileNumber: `+9198${Date.now().toString().slice(-8)}`,
        password: 'dummy',
        role: 'CITIZEN',
        households: {
          create: {
            name: 'Koramangala Flat 101',
            address: '12th Main, Koramangala',
            city: 'Bengaluru',
            state: 'Karnataka',
            latitude: 12.9352,
            longitude: 77.6245,
            members: {
              create: {
                name: 'Deepgram Citizen Member',
                gender: 'MALE',
                age: 32,
              },
            },
          },
        },
      },
      include: { households: { include: { members: true } } },
    });
  }

  const citizenToken = jwt.sign(
    { userId: testUser.id, role: testUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  (globalThis as any).localStorage.setItem('stride_during_token', citizenToken);

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Deepgram config (models, keyterms and defaults)
    // -------------------------------------------------------------
    await runCheck('Scenario 1: Deepgram service model and keyterm configuration defaults', async () => {
      delete process.env.DEEPGRAM_STT_MODEL;
      delete process.env.DEEPGRAM_TTS_MODEL;
      delete process.env.DEEPGRAM_KEYTERMS;

      const dummyAudio = Buffer.alloc(200, 'a');
      await transcribeAudioWithDeepgram(dummyAudio, 'audio/webm', 'corr-1');
      assert.ok(lastSttUrl.includes('model=nova-3'), `Expected default STT model nova-3 in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('smart_format=true'), `Expected smart_format=true in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('punctuate=true'), `Expected punctuate=true in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('keyterm=trapped'), `Expected keyterm=trapped in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('keyterm=trapped%20upstairs'), `Expected keyterm=trapped%20upstairs in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('keyterm=water%20rising'), `Expected keyterm=water%20rising in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('keyterm=need%20rescue'), `Expected keyterm=need%20rescue in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('keyterm=cannot%20move'), `Expected keyterm=cannot%20move in URL: ${lastSttUrl}`);

      await synthesizeSpeechWithDeepgram('Hello world', 'corr-2');
      assert.ok(lastTtsUrl.includes('model=aura-asteria-en'), `Expected default TTS model aura-asteria-en in URL: ${lastTtsUrl}`);

      // Test custom models and custom keyterms
      process.env.DEEPGRAM_STT_MODEL = 'nova-2-general';
      process.env.DEEPGRAM_TTS_MODEL = 'aura-luna-en';
      process.env.DEEPGRAM_KEYTERMS = 'custom-term,another-term';

      await transcribeAudioWithDeepgram(dummyAudio, 'audio/webm', 'corr-3');
      assert.ok(lastSttUrl.includes('model=nova-2-general'), `Expected custom STT model nova-2-general in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('keyterm=custom-term'), `Expected custom keyterm in URL: ${lastSttUrl}`);
      assert.ok(lastSttUrl.includes('keyterm=another-term'), `Expected custom keyterm in URL: ${lastSttUrl}`);

      await synthesizeSpeechWithDeepgram('Hello world 2', 'corr-4');
      assert.ok(lastTtsUrl.includes('model=aura-luna-en'), `Expected custom TTS model aura-luna-en in URL: ${lastTtsUrl}`);

      delete process.env.DEEPGRAM_STT_MODEL;
      delete process.env.DEEPGRAM_TTS_MODEL;
      delete process.env.DEEPGRAM_KEYTERMS;
    });

    // -------------------------------------------------------------
    // SCENARIO 2: transcribeAudioWithDeepgram rejects empty / small audio
    // -------------------------------------------------------------
    await runCheck('Scenario 2: transcribeAudioWithDeepgram rejects empty / small audio', async () => {
      await assert.rejects(
        () => transcribeAudioWithDeepgram(Buffer.alloc(0), 'audio/webm', 'corr-empty'),
        /Audio recording too short or empty/
      );

      await assert.rejects(
        () => transcribeAudioWithDeepgram(Buffer.alloc(50), 'audio/webm', 'corr-small'),
        /Audio recording too short or empty/
      );
    });

    // -------------------------------------------------------------
    // SCENARIO 3: transcribeAudioWithDeepgram sends audio with correct headers & parses response
    // -------------------------------------------------------------
    await runCheck('Scenario 3: transcribeAudioWithDeepgram sends audioBuffer with Token header', async () => {
      const audioData = Buffer.alloc(300, 0x12);
      const transcript = await transcribeAudioWithDeepgram(audioData, 'audio/webm', 'corr-valid-stt');

      assert.equal(transcript, 'We are four people and we are trapped upstairs.');
      assert.equal(lastSttRequestHeaders['authorization'], 'Token test-deepgram-api-key-12345');
      assert.ok(lastSttRequestHeaders['content-type'].includes('audio/webm'));
      assert.equal(lastSttRequestBody?.length, 300);
    });

    // -------------------------------------------------------------
    // SCENARIO 4: synthesizeSpeechWithDeepgram sends JSON body and returns audio Buffer
    // -------------------------------------------------------------
    await runCheck('Scenario 4: synthesizeSpeechWithDeepgram sends text JSON and returns audio Buffer', async () => {
      const res = await synthesizeSpeechWithDeepgram('Help is on the way.', 'corr-tts-valid');

      assert.equal(lastTtsRequestHeaders['authorization'], 'Token test-deepgram-api-key-12345');
      assert.ok(lastTtsRequestHeaders['content-type'].includes('application/json'));
      assert.deepEqual(lastTtsRequestBody, { text: 'Help is on the way.' });
      assert.equal(res.audioBuffer.toString(), 'mock-mp3-audio-bytes-for-tts');
      assert.equal(res.mimeType, 'audio/mp3');
    });

    // -------------------------------------------------------------
    // SCENARIO 5: Missing DEEPGRAM_API_KEY throws clear error
    // -------------------------------------------------------------
    await runCheck('Scenario 5: Missing DEEPGRAM_API_KEY throws clear error', async () => {
      const origKey = process.env.DEEPGRAM_API_KEY;
      delete process.env.DEEPGRAM_API_KEY;

      try {
        await assert.rejects(
          () => transcribeAudioWithDeepgram(Buffer.alloc(200), 'audio/webm', 'corr-no-key'),
          /DEEPGRAM_API_KEY is not configured/
        );
        await assert.rejects(
          () => synthesizeSpeechWithDeepgram('Test text', 'corr-no-key'),
          /DEEPGRAM_API_KEY is not configured/
        );
      } finally {
        process.env.DEEPGRAM_API_KEY = origKey;
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 6: Deepgram API error responses caught & formatted
    // -------------------------------------------------------------
    await runCheck('Scenario 6: Deepgram API HTTP error handled cleanly', async () => {
      mockStatusCode = 401;
      try {
        await assert.rejects(
          () => transcribeAudioWithDeepgram(Buffer.alloc(200), 'audio/webm', 'corr-err'),
          /Deepgram STT failed with status 401/
        );
      } finally {
        mockStatusCode = 200;
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 7: Controller handleDeepgramStt returns 400 for empty audio
    // -------------------------------------------------------------
    await runCheck('Scenario 7: POST /api/voice/deepgram-stt rejects empty audio with 400', async () => {
      const res = await fetch(`http://127.0.0.1:${stridePort}/api/voice/deepgram-stt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audioBase64: '' }),
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.ok(json.error.includes('Audio recording'));
    });

    // -------------------------------------------------------------
    // SCENARIO 8: Controller handleDeepgramStt handles multipart FormData
    // -------------------------------------------------------------
    await runCheck('Scenario 8: POST /api/voice/deepgram-stt handles multipart FormData audio', async () => {
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`;
      const fileFooter = `\r\n--${boundary}--\r\n`;
      const audioContent = Buffer.alloc(250, 0x55);
      const multipartBody = Buffer.concat([
        Buffer.from(fileHeader, 'utf8'),
        audioContent,
        Buffer.from(fileFooter, 'utf8'),
      ]);

      const res = await fetch(`http://127.0.0.1:${stridePort}/api/voice/deepgram-stt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.transcript, 'We are four people and we are trapped upstairs.');
    });

    // -------------------------------------------------------------
    // SCENARIO 9: Controller handleDeepgramStt handles base64 audio fallback
    // -------------------------------------------------------------
    await runCheck('Scenario 9: POST /api/voice/deepgram-stt handles base64 fallback JSON', async () => {
      const audioBase64 = Buffer.alloc(250, 0xaa).toString('base64');
      const res = await fetch(`http://127.0.0.1:${stridePort}/api/voice/deepgram-stt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audioBase64, mimeType: 'audio/webm' }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.transcript, 'We are four people and we are trapped upstairs.');
    });

    // -------------------------------------------------------------
    // SCENARIO 10: Controller handleDeepgramTts returns 400 for empty text
    // -------------------------------------------------------------
    await runCheck('Scenario 10: POST /api/voice/deepgram-tts rejects empty text with 400', async () => {
      const res = await fetch(`http://127.0.0.1:${stridePort}/api/voice/deepgram-tts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: '   ' }),
      });

      assert.equal(res.status, 400);
    });

    // -------------------------------------------------------------
    // SCENARIO 11: Controller handleDeepgramTts returns base64 audio and mimeType
    // -------------------------------------------------------------
    await runCheck('Scenario 11: POST /api/voice/deepgram-tts returns base64 audio', async () => {
      const res = await fetch(`http://127.0.0.1:${stridePort}/api/voice/deepgram-tts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Stay calm, responders are arriving.' }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.mimeType, 'audio/mp3');
      assert.equal(Buffer.from(json.audioBase64, 'base64').toString(), 'mock-mp3-audio-bytes-for-tts');
    });

    // -------------------------------------------------------------
    // SCENARIO 12: Factory returns DeepgramVoiceProvider for deepgram and deepgram-turn
    // -------------------------------------------------------------
    await runCheck('Scenario 12: Factory returns DeepgramVoiceProvider for deepgram & deepgram-turn', async () => {
      const p1 = getVoiceProvider('deepgram');
      assert.ok(p1 instanceof DeepgramVoiceProvider, 'Expected instance of DeepgramVoiceProvider');
      assert.equal(p1.name, 'deepgram-turn');

      const p2 = getVoiceProvider('deepgram-turn');
      assert.ok(p2 instanceof DeepgramVoiceProvider, 'Expected instance of DeepgramVoiceProvider');
    });

    // -------------------------------------------------------------
    // SCENARIO 13: Factory returns GeminiLiveProvider for gemini and gemini-live
    // -------------------------------------------------------------
    await runCheck('Scenario 13: Factory preserves GeminiLiveProvider for gemini & gemini-live', async () => {
      const p1 = getVoiceProvider('gemini');
      assert.ok(p1 instanceof GeminiLiveProvider, 'Expected instance of GeminiLiveProvider');
      assert.equal(p1.name, 'gemini-live');

      const p2 = getVoiceProvider('gemini-live');
      assert.ok(p2 instanceof GeminiLiveProvider, 'Expected instance of GeminiLiveProvider');
    });

    // -------------------------------------------------------------
    // SCENARIO 14: Factory throws clear error for unimplemented and unsupported providers
    // -------------------------------------------------------------
    await runCheck('Scenario 14: Factory throws descriptive errors for unimplemented/unsupported', async () => {
      assert.throws(() => getVoiceProvider('openai'), /not yet implemented/);
      assert.throws(() => getVoiceProvider('unsupported-provider'), /Unsupported voice provider/);
    });

    // -------------------------------------------------------------
    // SCENARIO 15: DeepgramVoiceProvider stopListening enforces idempotency lock
    // -------------------------------------------------------------
    await runCheck('Scenario 15: DeepgramVoiceProvider stopListening enforces idempotency', async () => {
      const provider = new DeepgramVoiceProvider();
      let emitCount = 0;
      provider.setCallbacks({
        onFinalTranscript: () => emitCount++,
        onError: () => {},
      });

      // Directly set provider status to LISTENING for testing idempotency lock
      provider.status = 'LISTENING';

      // Mock mediaRecorder with empty stop to simulate rapid concurrent calls
      (provider as any).mediaRecorder = {
        state: 'recording',
        mimeType: 'audio/webm',
        stop() {
          setTimeout(() => {
            (this as any).onstop?.();
          }, 50);
        },
      };
      (provider as any).recordedChunks = [Buffer.alloc(200)];

      // Launch two rapid stopListening calls concurrently
      const [r1, r2] = await Promise.allSettled([
        provider.stopListening(),
        provider.stopListening(),
      ]);

      assert.equal(r1.status, 'fulfilled');
      assert.equal(r2.status, 'fulfilled');
    });

    // -------------------------------------------------------------
    // SCENARIO 16: DeepgramVoiceProvider rejects < 100 byte audio and resets to IDLE
    // -------------------------------------------------------------
    await runCheck('Scenario 16: DeepgramVoiceProvider handles too-short audio gracefully', async () => {
      const provider = new DeepgramVoiceProvider();
      let capturedError: any = null;
      let capturedTranscript: any = null;

      provider.setCallbacks({
        onError: (err) => { capturedError = err; },
        onFinalTranscript: (t) => { capturedTranscript = t; },
      });

      provider.status = 'LISTENING';
      (provider as any).mediaRecorder = {
        state: 'inactive',
        stop() {},
      };
      (provider as any).recordedChunks = [Buffer.alloc(20)]; // only 20 bytes (< 100)

      await provider.stopListening();

      assert.equal(provider.status, 'IDLE');
      assert.ok(capturedError, 'Expected onError to be called');
      assert.equal(capturedTranscript, null, 'onFinalTranscript must not be called for short audio');
    });

    // -------------------------------------------------------------
    // SCENARIO 17: Authoritative STRIDE priority calculation for "We are four people and we're trapped upstairs"
    // -------------------------------------------------------------
    await runCheck('Scenario 17: Authoritative STRIDE priority calculation verified dynamically', async () => {
      // Clean up previous test requests for this user
      if (testUser.households[0]?.members[0]) {
        await prisma.emergencyCondition.deleteMany({
          where: { emergencyRequest: { householdMemberId: testUser.households[0].members[0].id } },
        });
        await prisma.rescueAssignment.deleteMany({
          where: { emergencyRequest: { householdMemberId: testUser.households[0].members[0].id } },
        });
        await prisma.emergencyRequest.deleteMany({
          where: { householdMemberId: testUser.households[0].members[0].id },
        });
      }

      // Post emergency-chat with the authoritative utterance
      const triageRes = await fetch(`http://127.0.0.1:${stridePort}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'We are four people and we are trapped upstairs.',
          clientRequestId: `test-calc-${Date.now()}`,
        }),
      });

      assert.equal(triageRes.status, 200);
      const json = await triageRes.json();

      assert.equal(json.mode, 'EMERGENCY');
      assert.ok(json.activeRequest, 'activeRequest must be returned');

      // Verify facts extracted deterministically
      assert.equal(json.activeRequest.peopleCount, 4);
      assert.equal(json.activeRequest.emergencyType, 'TRAPPED');

      // Assert against the actual calculation from the database / response
      // DO NOT hardcode 35; verify the calculation is self-consistent and authoritative
      const actualScore = json.activeRequest.priorityScore;
      assert.ok(
        typeof actualScore === 'number' && actualScore >= 15 && actualScore <= 100,
        `Expected valid priority score between 15 and 100, got: ${actualScore}`
      );
      console.log(`     Authoritative STRIDE priority score calculated: ${actualScore}`);

      // Verify database record matches
      const dbReq = await prisma.emergencyRequest.findUnique({
        where: { id: json.activeRequest.id },
        include: {
          conditions: true,
          rescueAssignments: true,
          householdMember: { include: { household: { include: { user: true } } } },
        },
      });
      assert.ok(dbReq, 'Database emergencyRequest must exist');
      assert.equal(dbReq?.priorityScore, actualScore);
      const formatted = formatRescueRequest(dbReq);
      assert.equal(formatted.peopleCount, 4);
      assert.equal(formatted.emergencyType, 'TRAPPED');
    });

    // -------------------------------------------------------------
    // SCENARIO 18 (TASK 4): Exact Failure Case Regression: "We are four people and we're trapped upstairs."
    // -------------------------------------------------------------
    await runCheck('Scenario 18: Exact failure case: "We are four people and we\'re trapped upstairs."', async () => {
      // Clean up previous test requests for this user
      if (testUser.households[0]?.members[0]) {
        await prisma.emergencyCondition.deleteMany({
          where: { emergencyRequest: { householdMemberId: testUser.households[0].members[0].id } },
        });
        await prisma.rescueAssignment.deleteMany({
          where: { emergencyRequest: { householdMemberId: testUser.households[0].members[0].id } },
        });
        await prisma.emergencyRequest.deleteMany({
          where: { householdMemberId: testUser.households[0].members[0].id },
        });
      }

      // Exact phrase where "trapped" was previously misrecognized as "Westpac"
      const exactUtterance = "We are four people and we're trapped upstairs.";

      const triageRes = await fetch(`http://127.0.0.1:${stridePort}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: exactUtterance,
          clientRequestId: `test-exact-trapped-${Date.now()}`,
        }),
      });

      assert.equal(triageRes.status, 200);
      const json = await triageRes.json();

      assert.equal(json.mode, 'EMERGENCY');
      assert.ok(json.activeRequest, 'Active request must be generated for trapped emergency');

      // Check extracted facts
      assert.equal(json.activeRequest.peopleCount, 4, `Expected peopleCount = 4, got ${json.activeRequest.peopleCount}`);
      assert.equal(json.activeRequest.emergencyType, 'TRAPPED', `Expected emergencyType = TRAPPED, got ${json.activeRequest.emergencyType}`);

      // Dynamic priority assertion: formula output is authoritative (NOT hardcoded)
      const dynamicScore = json.activeRequest.priorityScore;
      assert.ok(
        typeof dynamicScore === 'number' && dynamicScore >= 15 && dynamicScore <= 100,
        `Expected valid priority score between 15 and 100, got: ${dynamicScore}`
      );
      console.log(`     Exact failure case dynamic priority score: ${dynamicScore}`);

      // Verify conditions in database include TRAPPED
      const dbReq = await prisma.emergencyRequest.findUnique({
        where: { id: json.activeRequest.id },
        include: {
          conditions: true,
          rescueAssignments: true,
          householdMember: { include: { household: { include: { user: true } } } },
        },
      });
      assert.ok(dbReq, 'Database emergencyRequest must exist');
      const conditionTypes = dbReq!.conditions.map((c) => c.conditionType);
      assert.ok(conditionTypes.includes('TRAPPED'), `Conditions must include TRAPPED, got: ${conditionTypes.join(', ')}`);
      assert.equal(dbReq!.priorityScore, dynamicScore);
    });

    // -------------------------------------------------------------
    // SCENARIO 19 (TASK 5): Representative Emergency Phrases
    // -------------------------------------------------------------
    await runCheck('Scenario 19: Test representative emergency phrases', async () => {
      const phrases = [
        { phrase: 'We are trapped upstairs.', expectedType: 'TRAPPED', expectedCond: 'TRAPPED' },
        { phrase: 'The water is rising.', expectedWater: 'HIGH', expectedCond: 'WATER_RISING' },
        { phrase: 'There is a fire.', expectedType: 'FIRE', expectedCond: 'FIRE' },
        { phrase: 'My grandmother is injured.', expectedElderly: 1, expectedInjured: 1, expectedCond: 'HEAVILY_INJURED' },
        { phrase: 'One person is bleeding heavily.', expectedInjured: 1, expectedCond: 'HEAVILY_INJURED' },
        { phrase: 'We need rescue.', expectedCond: 'NEED_RESCUE' },
        { phrase: 'I cannot move.', expectedMode: ['ASSESS', 'EMERGENCY'] },
      ];

      for (const item of phrases) {
        // Reset beacon before each phrase to test fresh turn extraction
        if (testUser.households[0]?.members[0]) {
          await prisma.emergencyCondition.deleteMany({
            where: { emergencyRequest: { householdMemberId: testUser.households[0].members[0].id } },
          });
          await prisma.rescueAssignment.deleteMany({
            where: { emergencyRequest: { householdMemberId: testUser.households[0].members[0].id } },
          });
          await prisma.emergencyRequest.deleteMany({
            where: { householdMemberId: testUser.households[0].members[0].id },
          });
        }

        const res = await fetch(`http://127.0.0.1:${stridePort}/api/voice/emergency-chat`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${citizenToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: item.phrase,
            clientRequestId: `test-phrase-${Date.now()}`,
          }),
        });

        assert.equal(res.status, 200, `Request failed for phrase: "${item.phrase}"`);
        const json = await res.json();
        assert.ok(json.assistantResponse && json.assistantResponse.length > 0, `Empty assistant response for: "${item.phrase}"`);

        if (item.expectedType && json.activeRequest) {
          assert.equal(json.activeRequest.emergencyType, item.expectedType, `Expected ${item.expectedType} for "${item.phrase}"`);
        }
        if (item.expectedWater && json.activeRequest) {
          assert.equal(json.activeRequest.waterLevel, item.expectedWater, `Expected ${item.expectedWater} for "${item.phrase}"`);
        }
        if (item.expectedInjured && json.activeRequest) {
          assert.equal(json.activeRequest.injuredCount, item.expectedInjured, `Expected injured=${item.expectedInjured} for "${item.phrase}"`);
        }
        if (item.expectedElderly && json.activeRequest) {
          assert.equal(json.activeRequest.elderlyCount, item.expectedElderly, `Expected elderly=${item.expectedElderly} for "${item.phrase}"`);
        }
        if (item.expectedCond && json.activeRequest) {
          const dbReq = await prisma.emergencyRequest.findUnique({
            where: { id: json.activeRequest.id },
            include: { conditions: true },
          });
          const types = dbReq?.conditions.map((c) => c.conditionType) || [];
          assert.ok(types.includes(item.expectedCond), `Expected condition ${item.expectedCond} in ${types.join(', ')} for "${item.phrase}"`);
        }
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 20 (TASK 2 & 5): Ordinary Speech Not Over-Biased
    // -------------------------------------------------------------
    await runCheck('Scenario 20: Ordinary speech preservation without false positive emergency SOS', async () => {
      // Clean up previous requests across all households and members for testUser
      const userMembers = await prisma.householdMember.findMany({
        where: { household: { userId: testUser.id } },
      });
      const memberIds = userMembers.map((m) => m.id);
      if (memberIds.length > 0) {
        await prisma.emergencyCondition.deleteMany({
          where: { emergencyRequest: { householdMemberId: { in: memberIds } } },
        });
        await prisma.rescueAssignment.deleteMany({
          where: { emergencyRequest: { householdMemberId: { in: memberIds } } },
        });
        await prisma.emergencyRequest.deleteMany({
          where: { householdMemberId: { in: memberIds } },
        });
      }

      const ordinaryQuestions = [
        'Where is the nearest evacuation shelter?',
        'What should I pack in an emergency supply kit?',
        'Can you hear me?',
      ];

      for (const question of ordinaryQuestions) {
        const res = await fetch(`http://127.0.0.1:${stridePort}/api/voice/emergency-chat`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${citizenToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: question,
            clientRequestId: `test-ordinary-${Date.now()}`,
          }),
        });

        assert.equal(res.status, 200);
        const json = await res.json();

        // Must remain in ASSIST mode
        assert.equal(json.mode, 'ASSIST', `Expected ASSIST mode for ordinary question: "${question}", got ${json.mode}`);
        assert.ok(!json.activeRequest, `No active SOS should be created for ordinary question: "${question}"`);

        // Verify zero emergency requests created in database
        const activeRequests = await prisma.emergencyRequest.findMany({
          where: { householdMemberId: { in: testUser.households[0].members.map((m) => m.id) }, rescueStatus: { not: 'CANCELLED' } },
        });
        assert.equal(activeRequests.length, 0, `No database emergencyRequest must exist for ordinary speech`);
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 21: Authoritative peopleCount Persisted and Preserved Across Turns
    // -------------------------------------------------------------
    await runCheck('Scenario 21: Multi-turn peopleCount preservation (Turn 1 "four people trapped" -> Turn 2 "grandmother injured" preserves peopleCount=4)', async () => {
      // Clean up previous requests
      const userMembers = await prisma.householdMember.findMany({
        where: { household: { userId: testUser.id } },
      });
      const memberIds = userMembers.map((m) => m.id);
      if (memberIds.length > 0) {
        await prisma.emergencyCondition.deleteMany({
          where: { emergencyRequest: { householdMemberId: { in: memberIds } } },
        });
        await prisma.rescueAssignment.deleteMany({
          where: { emergencyRequest: { householdMemberId: { in: memberIds } } },
        });
        await prisma.emergencyRequest.deleteMany({
          where: { householdMemberId: { in: memberIds } },
        });
      }

      // --- Turn 1: "We are four people and we're trapped upstairs." ---
      const res1 = await fetch(`http://127.0.0.1:${stridePort}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: "We are four people and we're trapped upstairs.",
          clientRequestId: `turn1-test-${Date.now()}`,
        }),
      });

      assert.equal(res1.status, 200, 'Turn 1 HTTP status must be 200');
      const json1 = await res1.json();

      assert.ok(json1.activeRequest, 'Turn 1 must produce activeRequest');
      assert.equal(json1.activeRequest.peopleCount, 4, `Turn 1 peopleCount must be 4, got ${json1.activeRequest.peopleCount}`);
      assert.equal(json1.activeRequest.emergencyType, 'TRAPPED', `Turn 1 emergencyType must be TRAPPED, got ${json1.activeRequest.emergencyType}`);

      const turn1SosId = json1.activeRequest.id;
      const turn1Score = json1.activeRequest.priorityScore;
      assert.ok(typeof turn1Score === 'number' && turn1Score >= 15 && turn1Score <= 100, `Turn 1 priorityScore must be between 15 and 100, got ${turn1Score}`);

      // Verify database persistence for Turn 1
      const dbReqs1 = await prisma.emergencyRequest.findMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true, rescueAssignments: true },
      });
      assert.equal(dbReqs1.length, 1, 'Exactly one active SOS must exist after Turn 1');
      const formattedDb1 = formatRescueRequest(dbReqs1[0]);
      assert.equal(formattedDb1.peopleCount, 4, `Persisted incident peopleCount must be 4, got ${formattedDb1.peopleCount}`);

      // --- Turn 2: "My grandmother is injured." ---
      const res2 = await fetch(`http://127.0.0.1:${stridePort}/api/voice/emergency-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'My grandmother is injured.',
          activeRequestId: turn1SosId,
          history: [
            { role: 'user', content: "We are four people and we're trapped upstairs." },
            { role: 'assistant', content: json1.assistantResponse },
          ],
          clientRequestId: `turn2-test-${Date.now()}`,
        }),
      });

      assert.equal(res2.status, 200, 'Turn 2 HTTP status must be 200');
      const json2 = await res2.json();

      assert.ok(json2.activeRequest, 'Turn 2 must return activeRequest');
      assert.equal(json2.activeRequest.id, turn1SosId, `Turn 2 must update same SOS in place (id: ${turn1SosId}), got ${json2.activeRequest.id}`);
      assert.equal(json2.activeRequest.peopleCount, 4, `Turn 2 peopleCount must remain 4 (NOT reset to 3 or 1), got ${json2.activeRequest.peopleCount}`);
      assert.equal(json2.activeRequest.elderlyCount, 1, `Turn 2 elderlyCount must be 1, got ${json2.activeRequest.elderlyCount}`);
      assert.equal(json2.activeRequest.injuredCount, 1, `Turn 2 injuredCount must be 1, got ${json2.activeRequest.injuredCount}`);

      // Verify database persistence for Turn 2
      const dbReqs2 = await prisma.emergencyRequest.findMany({
        where: { householdMemberId: { in: memberIds }, rescueStatus: { not: 'CANCELLED' } },
        include: { conditions: true, rescueAssignments: true },
      });
      assert.equal(dbReqs2.length, 1, 'Still exactly one active SOS must exist after Turn 2 (no duplicates)');
      const formattedDb2 = formatRescueRequest(dbReqs2[0]);
      assert.equal(formattedDb2.peopleCount, 4, `Persisted incident peopleCount must remain 4 after Turn 2, got ${formattedDb2.peopleCount}`);
      assert.equal(formattedDb2.elderlyCount, 1, `Persisted elderlyCount must be 1, got ${formattedDb2.elderlyCount}`);
      assert.equal(formattedDb2.injuredCount, 1, `Persisted injuredCount must be 1, got ${formattedDb2.injuredCount}`);
    });

  } finally {
    mockDeepgramServer?.close();
    strideServer?.close();
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedCount} passed, ${failedCount} failed`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
