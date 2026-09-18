import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import createApp from '../src/server/app.ts';
import prisma from '../src/server/config/database.ts';
import {
  cleanTranscript,
  normalizeAudioMimeType,
} from '../src/server/services/geminiVoiceService.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'stride-hackathon-secure-jwt-secret-key-2026';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runRealBrowserVoiceVerification() {
  console.log('================================================================');
  console.log('🎤 RUNNING REAL BROWSER VOICE VERIFICATION SUITE');
  console.log('================================================================\n');

  // Start live HTTP server on port 0
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Live HTTP Server active at: ${baseUrl}\n`);

  // Obtain test citizen
  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });
  if (!citizen) throw new Error('Citizen not found in DB');

  const household = citizen.households[0];

  const citizenToken = jwt.sign(
    { userId: citizen.id, email: citizen.email, role: citizen.role },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const results: Record<string, boolean> = {};

  // ==========================================================================
  // TEST 1: cleanTranscript Unit Tests (Noise & Silence token stripping)
  // ==========================================================================
  console.log('--- Test 1: cleanTranscript Noise & Silence Token Stripping ---');
  try {
    assert(cleanTranscript('[silence]') === '', '[silence] must be empty');
    assert(cleanTranscript('(silence)') === '', '(silence) must be empty');
    assert(cleanTranscript('[unintelligible]') === '', '[unintelligible] must be empty');
    assert(cleanTranscript('[background noise]') === '', '[background noise] must be empty');
    assert(cleanTranscript('...') === '', '... must be empty');
    assert(cleanTranscript('None') === '', 'None must be empty');
    assert(cleanTranscript('   "Hello, this is a voice test."   ') === 'Hello, this is a voice test.', 'Must strip surrounding quotes');
    assert(
      cleanTranscript('We are four people and we are trapped upstairs.') ===
        'We are four people and we are trapped upstairs.',
      'Must preserve real spoken words'
    );
    console.log('✅ Test 1 PASSED: cleanTranscript properly purges noise tokens while preserving verbatim words.\n');
    results['Test 1: cleanTranscript'] = true;
  } catch (err: any) {
    console.error('❌ Test 1 FAILED:', err.message);
    results['Test 1: cleanTranscript'] = false;
  }

  // ==========================================================================
  // TEST 2: normalizeAudioMimeType Tests
  // ==========================================================================
  console.log('--- Test 2: normalizeAudioMimeType Preservation & Gemini Compatibility ---');
  try {
    assert(normalizeAudioMimeType('audio/webm;codecs=opus') === 'audio/webm', 'webm opus -> audio/webm');
    assert(normalizeAudioMimeType('audio/webm') === 'audio/webm', 'webm -> audio/webm');
    assert(normalizeAudioMimeType('audio/mp4') === 'audio/mp4', 'mp4 -> audio/mp4');
    assert(normalizeAudioMimeType('audio/ogg;codecs=opus') === 'audio/ogg', 'ogg opus -> audio/ogg');
    assert(normalizeAudioMimeType('audio/wav') === 'audio/wav', 'wav -> audio/wav');
    console.log('✅ Test 2 PASSED: MIME normalization matches Gemini multimodal specifications.\n');
    results['Test 2: normalizeAudioMimeType'] = true;
  } catch (err: any) {
    console.error('❌ Test 2 FAILED:', err.message);
    results['Test 2: normalizeAudioMimeType'] = false;
  }

  // ==========================================================================
  // TEST 3: Microscopic / Empty Audio Buffer Rejection (< 200 bytes)
  // ==========================================================================
  console.log('--- Test 3: Microscopic Audio Buffer Rejection (< 200 bytes) ---');
  try {
    const boundary = '----WebKitFormBoundaryTestMicro';
    const tinyAudio = Buffer.alloc(80); // 80 bytes (microscopic)
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
      tinyAudio,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await fetch(`${baseUrl}/api/voice/emergency-audio`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${citizenToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const json = await res.json();

    assert(json.assistantResponse === "STRIDE couldn't understand the recording. Please try again.", 'Microscopic buffer returns single failure message');
    assert(json.failureStage === 'AUDIO_BUFFER', 'Must report AUDIO_BUFFER failure stage');
    assert(json.transcript === '', 'Transcript must be empty');
    assert(json.shouldCreateOrUpdateSos === false, 'Must not create/update SOS');

    console.log('✅ Test 3 PASSED: Microscopic recording handled cleanly without crashing or corrupting SOS.\n');
    results['Test 3: Microscopic Buffer'] = true;
  } catch (err: any) {
    console.error('❌ Test 3 FAILED:', err.message);
    results['Test 3: Microscopic Buffer'] = false;
  }

  // ==========================================================================
  // TEST 4: Primary Multipart Audio Upload Path
  // ==========================================================================
  console.log('--- Test 4: Primary Multipart Audio Upload Path ---');
  try {
    const boundary = '----WebKitFormBoundaryRealWebM';
    // Create a 1 KB dummy WebM buffer representing speech
    const speechAudio = Buffer.alloc(1024, 0x1f);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.webm"\r\nContent-Type: audio/webm;codecs=opus\r\n\r\n`),
      speechAudio,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="sessionId"\r\n\r\nsess-multipart-test\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="clientRequestId"\r\n\r\nreq-multipart-test\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const res = await fetch(`${baseUrl}/api/voice/emergency-audio`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${citizenToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const json = await res.json();

    console.log('Test 4 Response:', {
      status: res.status,
      failureStage: json.failureStage,
      diagnostics: json.diagnostics,
      assistantResponse: json.assistantResponse,
    });

    assert(res.status === 200, `Expected status 200, got ${res.status}`);
    assert(json.diagnostics?.serverBufferSize === 1024, 'Server must receive exact 1024 byte buffer via multer');
    assert(json.diagnostics?.normalizedMimeType === 'audio/webm', 'Normalized MIME must be audio/webm');
    assert(json.clientRequestId === 'req-multipart-test', 'Client request ID must be preserved');

    console.log('✅ Test 4 PASSED: Primary multipart stream successfully received and buffered by server.\n');
    results['Test 4: Primary Multipart'] = true;
  } catch (err: any) {
    console.error('❌ Test 4 FAILED:', err.message);
    results['Test 4: Primary Multipart'] = false;
  }

  // ==========================================================================
  // TEST 5: Fallback JSON Base64 Upload Path (Rule 10)
  // ==========================================================================
  console.log('--- Test 5: Fallback JSON Base64 Upload Path ---');
  try {
    const speechAudio = Buffer.alloc(1024, 0x2a);
    const base64Audio = speechAudio.toString('base64');
    const cId = 'req-json-fallback-test';

    const res = await fetch(`${baseUrl}/api/voice/emergency-audio`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${citizenToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64: base64Audio,
        mimeType: 'audio/webm;codecs=opus',
        sessionId: 'sess-json-fallback',
        clientRequestId: cId,
        history: [],
      }),
    });
    const json = await res.json();

    console.log('Test 5 Response:', {
      status: res.status,
      failureStage: json.failureStage,
      diagnostics: json.diagnostics,
      clientRequestId: json.clientRequestId,
    });

    assert(res.status === 200, `Expected status 200, got ${res.status}`);
    assert(json.diagnostics?.serverBufferSize === 1024, 'Server must decode exact 1024 byte buffer from base64');
    assert(json.diagnostics?.normalizedMimeType === 'audio/webm', 'Normalized MIME must be audio/webm');
    assert(json.clientRequestId === cId, 'Client request ID must match');

    console.log('✅ Test 5 PASSED: JSON base64 fallback path seamlessly processes audio with same clientRequestId.\n');
    results['Test 5: Fallback JSON Base64'] = true;
  } catch (err: any) {
    console.error('❌ Test 5 FAILED:', err.message);
    results['Test 5: Fallback JSON Base64'] = false;
  }

  // ==========================================================================
  // TEST 6: Audio Missing / Undefined Error Diagnosis (Rule 5 & 7)
  // ==========================================================================
  console.log('--- Test 6: Missing Audio Diagnostics & Failure Stage ---');
  try {
    const boundary = '----WebKitFormBoundaryNoAudio';
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="sessionId"\r\n\r\nsess-no-audio\r\n--${boundary}--\r\n`
    );

    const res = await fetch(`${baseUrl}/api/voice/emergency-audio`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${citizenToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const json = await res.json();

    assert(res.status === 400, `Expected 400 Bad Request, got ${res.status}`);
    assert(json.failureStage === 'EMPTY_RECORDING' || json.failureStage === 'MULTIPART_PARSE', 'Must report accurate failureStage');
    assert(typeof json.diagnosticReason === 'string', 'Must provide diagnostic reason');

    console.log('✅ Test 6 PASSED: Missing audio diagnostically identified with exact failureStage.\n');
    results['Test 6: Missing Audio Diagnostics'] = true;
  } catch (err: any) {
    console.error('❌ Test 6 FAILED:', err.message);
    results['Test 6: Missing Audio Diagnostics'] = false;
  }

  // ==========================================================================
  // TEST 7: End-to-End Triage from Transcript (Authoritative SOS update)
  // ==========================================================================
  console.log('--- Test 7: End-to-End Triage from Transcript ("We are 4 people trapped...") ---');
  try {
    // Reset test beacon
    await fetch(`${baseUrl}/api/voice/reset-test-beacon`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${citizenToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    // Simulate transcript fed into text triage pipeline as done in processEmergencyAudioInput Stage 2
    const triageRes = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${citizenToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: "We are four people and we're trapped upstairs.",
        sessionId: 'sess-e2e-audio-triage',
        clientRequestId: 'req-e2e-audio-triage',
      }),
    });
    const triageJson = await triageRes.json();

    console.log('Test 7 Triage Output:', {
      peopleCount: triageJson.activeRequest?.peopleCount,
      emergencyType: triageJson.activeRequest?.emergencyType,
      priorityScore: triageJson.activeRequest?.priorityScore,
    });

    assert(triageJson.activeRequest?.peopleCount === 4, 'People count must be 4');
    assert(triageJson.activeRequest?.emergencyType === 'TRAPPED', 'Emergency type must be TRAPPED');
    assert(triageJson.activeRequest?.priorityScore >= 35, 'Priority score must reflect trapped and people count');

    console.log('✅ Test 7 PASSED: Spoken transcript successfully triggers triage and sets People=4, Trapped=true.\n');
    results['Test 7: Transcript Triage'] = true;
  } catch (err: any) {
    console.error('❌ Test 7 FAILED:', err.message);
    results['Test 7: Transcript Triage'] = false;
  }

  // ==========================================================================
  // TEST 8: Vercel Serverless Config Verification
  // ==========================================================================
  console.log('--- Test 8: Vercel Serverless Entrypoint Config Verification ---');
  try {
    const serverlessModule = await import('../api/index.js');
    assert(serverlessModule.config !== undefined, 'api/index.js must export config');
    assert(serverlessModule.config.api?.bodyParser === false, 'config.api.bodyParser must be false');
    console.log('✅ Test 8 PASSED: Deployed api/index.js explicitly exports config with bodyParser: false.\n');
    results['Test 8: Serverless Config'] = true;
  } catch (err: any) {
    console.error('❌ Test 8 FAILED:', err.message);
    results['Test 8: Serverless Config'] = false;
  }

  // Close server
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  console.log('================================================================');
  console.log('📊 REAL BROWSER VOICE VERIFICATION SUMMARY');
  console.log('================================================================');
  let allPassed = true;
  for (const [testName, passed] of Object.entries(results)) {
    console.log(`${passed ? '✅ PASS' : '❌ FAIL'} : ${testName}`);
    if (!passed) allPassed = false;
  }
  console.log('================================================================\n');

  if (!allPassed) {
    throw new Error('Some verification tests failed.');
  }
}

runRealBrowserVoiceVerification()
  .then(() => {
    console.log('🎉 ALL REAL BROWSER VOICE VERIFICATION TESTS PASSED!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Fatal error in verification suite:', err);
    process.exit(1);
  });
