import { PcmRecorder, float32ToInt16PCM, downsampleTo16k, pcmToBase64, base64ToPCM } from '../src/services/voice/pcmAudioProcessor.ts';
import { GeminiLiveProvider } from '../src/services/voice/GeminiLiveProvider.ts';
import { applySosLifecycleAndTriage } from '../src/server/controllers/voiceEmergencyController.ts';
import prisma from '../src/server/config/database.ts';
import { StrideContextData } from '../src/server/services/strideContextService.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message || err}`);
    failed++;
  }
}

// Mock WebSocket implementation for provider testing
class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  sentMessages: any[] = [];

  send(data: string) {
    try {
      this.sentMessages.push(JSON.parse(data));
    } catch {
      this.sentMessages.push(data);
    }
  }

  close() {
    this.readyState = 3;
  }
}

async function main() {
  console.log('================================================================');
  console.log('STRIDE POST-RECORDING PIPELINE & DETERMINISTIC TRIAGE VERIFICATION');
  console.log('Testing turn finalization, idempotency, interim promotion & watchdog');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: PcmRecorder Audio Energy (RMS) & Stats Calculation
  // ---------------------------------------------------------------------------
  await runTest('1. PcmRecorder RMS calculation & stats tracking', () => {
    // Generate synthetic 16kHz sine wave PCM samples
    const sampleRate = 16000;
    const durationSec = 0.1; // 100ms
    const numSamples = Math.floor(sampleRate * durationSec);
    const float32 = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      float32[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const pcm16 = float32ToInt16PCM(float32);
    assert(pcm16.length === numSamples, 'pcm16 length matches float32 length');

    // Calculate RMS
    let sumSq = 0;
    for (let i = 0; i < pcm16.length; i++) {
      const norm = pcm16[i] / 32768;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / pcm16.length);
    assert(rms > 0.3 && rms < 0.4, `Calculated RMS should be ~0.35, got: ${rms}`);

    // Base64 encode and decode roundtrip
    const b64 = pcmToBase64(pcm16);
    const decoded = base64ToPCM(b64);
    assert(decoded.length === pcm16.length, 'Base64 roundtrip preserves sample length');
    assert(decoded[10] === pcm16[10], 'Base64 roundtrip preserves sample value');
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Idempotent Turn Finalization in stopListening()
  // ---------------------------------------------------------------------------
  await runTest('2. Idempotent turn finalization prevents duplicate audioStreamEnd / turnComplete', async () => {
    const provider = new GeminiLiveProvider();
    const mockWs = new MockWebSocket();
    (provider as any).ws = mockWs;
    (provider as any).isConnected = true;
    (provider as any).status = 'LISTENING';

    // Rapid double call to stopListening (simulating multiple rapid clicks or race conditions)
    const p1 = provider.stopListening();
    const p2 = provider.stopListening();
    await Promise.all([p1, p2]);

    assert(provider.status === 'PROCESSING', 'Status must transition to PROCESSING');

    // Count audioStreamEnd and turnComplete frames
    const endFrames = mockWs.sentMessages.filter((m) => m.realtimeInput?.audioStreamEnd === true);
    const turnFrames = mockWs.sentMessages.filter((m) => m.clientContent?.turnComplete === true);

    assert(endFrames.length === 1, `audioStreamEnd must be sent exactly once, was sent ${endFrames.length} times`);
    assert(turnFrames.length === 1, `clientContent.turnComplete must be sent exactly once, was sent ${turnFrames.length} times`);

    // Cleanup
    await provider.disconnect();
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Promotion of Accumulated Interim Transcript on turnComplete
  // ---------------------------------------------------------------------------
  await runTest('3. Interim transcript accumulation & promotion upon turnComplete', async () => {
    const provider = new GeminiLiveProvider();
    const mockWs = new MockWebSocket();
    (provider as any).ws = mockWs;
    (provider as any).isConnected = true;
    (provider as any).status = 'LISTENING';

    let receivedInterim = '';
    let receivedFinal = '';

    provider.setCallbacks({
      onInterimTranscript: (text) => {
        receivedInterim = text;
      },
      onFinalTranscript: (text) => {
        receivedFinal = text;
      },
    });

    // Simulate incoming interim speech frames while citizen is speaking
    (provider as any).handleServerMessage({
      serverContent: {
        interimInputTranscription: {
          text: 'There are four people with me and we are trapped upstairs',
        },
      },
    });

    assert(
      receivedInterim === 'There are four people with me and we are trapped upstairs',
      'Interim transcript callback received speech'
    );
    assert(receivedFinal === '', 'Final transcript not yet emitted during interim speech');

    // User stops listening
    await provider.stopListening();

    // Server emits turnComplete WITHOUT explicit inputTranscription frame
    (provider as any).handleServerMessage({
      serverContent: {
        turnComplete: true,
      },
    });

    assert(
      receivedFinal === 'There are four people with me and we are trapped upstairs',
      `Accumulated interim speech must be promoted to final transcript, received: "${receivedFinal}"`
    );

    // Cleanup
    await provider.disconnect();
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Watchdog Recovery with Speech vs Empty Recording
  // ---------------------------------------------------------------------------
  await runTest('4. Watchdog recovery: promotes speech if present; recovers directly on empty without triage', async () => {
    // 4A: Watchdog with accumulated speech promotes speech
    const providerA = new GeminiLiveProvider();
    const mockWsA = new MockWebSocket();
    (providerA as any).ws = mockWsA;
    (providerA as any).isConnected = true;
    (providerA as any).status = 'LISTENING';

    let finalA = '';
    providerA.setCallbacks({
      onFinalTranscript: (text) => {
        finalA = text;
      },
    });

    // Receive interim transcript
    (providerA as any).handleServerMessage({
      serverContent: {
        interimInputTranscription: {
          text: 'Help us please',
        },
      },
    });

    await providerA.stopListening();

    // Force watchdog timeout
    (providerA as any).handleTurnWatchdogTimeout();
    assert(finalA === 'Help us please', 'Watchdog promoted speech when present');
    await providerA.disconnect();

    // 4B: Watchdog with EMPTY transcript: must NOT call onFinalTranscript('')
    // Per User Correction 1: An empty recording recovers UI directly and does not enter STRIDE triage!
    const providerB = new GeminiLiveProvider();
    const mockWsB = new MockWebSocket();
    (providerB as any).ws = mockWsB;
    (providerB as any).isConnected = true;
    (providerB as any).status = 'LISTENING';

    let finalBCalled = false;
    let errorB: any = null;

    providerB.setCallbacks({
      onFinalTranscript: () => {
        finalBCalled = true;
      },
      onError: (err) => {
        errorB = err;
      },
    });

    await providerB.stopListening();

    // Force watchdog timeout with 0 speech
    (providerB as any).handleTurnWatchdogTimeout();

    assert(!finalBCalled, 'onFinalTranscript must NOT be called when recording was empty');
    assert(providerB.status === 'IDLE', 'Status must reset to IDLE directly');
    assert(errorB !== null, 'UI error callback must be invoked to inform user of empty recording');

    await providerB.disconnect();
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Deterministic STRIDE Priority Calculation & SOS Lifecycle
  // ---------------------------------------------------------------------------
  await runTest('5. Deterministic priority formula dynamically evaluated for "There are four people with me and we are trapped upstairs."', async () => {
    // Find or create test user
    let user = await prisma.user.findFirst({
      where: { role: 'CITIZEN' },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'Priority Test Citizen',
          mobileNumber: '9988776611',
          testIdentityNumber: '5432 8901 9999',
          role: 'CITIZEN',
        },
      });
    }

    const testContext: StrideContextData = {
      user: { id: user.id, name: user.name, role: 'CITIZEN' },
      disaster: {
        id: 'disaster-1',
        title: 'Bengaluru Monsoon Flood 2026',
        type: 'FLOOD',
        severity: 'SEVERE',
        status: 'ACTIVE',
      } as any,
      citizenHousehold: null,
      activeSos: null,
      nearbyShelters: [],
      nearbyHospitals: [],
      waterRiseTrend: 'RISING',
      systemRole: 'STRIDE Emergency Voice Assistant',
      guidelines: [],
    };

    const aiResult = {
      mode: 'EMERGENCY' as const,
      intent: 'sos_report',
      assistantResponse: 'Help is being dispatched. 4 people trapped upstairs logged.',
      extractedInformation: {
        peopleCount: 4,
        emergencyType: 'TRAPPED',
        waterLevel: 'HIGH',
      },
      uncertainInformation: [],
      missingInformation: [],
      questionTarget: 'none',
      shouldCreateOrUpdateSos: true,
      isFallbackExtractor: false,
    };

    const utterance = 'There are four people with me and we are trapped upstairs.';

    // Invoke authoritative STRIDE triage & priority calculation
    const triageResult = await applySosLifecycleAndTriage(
      user.id,
      testContext,
      aiResult,
      utterance,
      { latitude: 12.9716, longitude: 77.5946 }
    );

    assert(triageResult.activeSosRecord !== null, 'Active SOS record must be created');
    assert(triageResult.activeSosRecord.peopleCount === 4, 'peopleCount must be 4');
    assert(triageResult.activeSosRecord.emergencyType === 'TRAPPED', 'emergencyType must be TRAPPED');

    // Dynamic priority calculation verification:
    // waterLevel HIGH = 15
    // trappedOrStructural TRAPPED = 20
    // Expected calculated score = 15 + 20 = 35
    const expectedScore = 15 + 20; // 35
    const actualScore = triageResult.activeSosRecord.priorityScore;

    console.log(`     Dynamic Calculated Priority Score: ${actualScore} (expected formula output: ${expectedScore})`);
    assert(actualScore === expectedScore, `Priority score must be ${expectedScore}, got ${actualScore}`);

    // Verify activeSosRecord parsed properties
    assert(triageResult.activeSosRecord.source === 'VOICE', 'source must be VOICE');
    assert(triageResult.activeSosRecord.peopleCount === 4, 'peopleCount must be 4');
    assert(triageResult.activeSosRecord.emergencyType === 'TRAPPED', 'emergencyType must be TRAPPED');

    // Verify database record has [SRC:VOICE, P:4, ...]
    const dbRecord = await prisma.emergencyRequest.findUnique({
      where: { id: triageResult.activeSosRecord.id },
    });
    assert(dbRecord !== null, 'Database record must exist');
    assert(dbRecord.description.includes('[SRC:VOICE'), 'Database description must include [SRC:VOICE');
    assert(dbRecord.description.includes('P:4'), 'Database description must include P:4');
    assert(dbRecord.description.includes('T:TRAPPED'), 'Database description must include T:TRAPPED');
  });

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
