import 'dotenv/config';
import prisma from '../src/server/config/database.ts';
import { processEmergencyVoiceInput, ChatMessage } from '../src/server/services/geminiVoiceService.ts';
import { getStrideContext } from '../src/server/services/strideContextService.ts';

async function runFiveMessageTest() {
  console.log('===============================================================');
  console.log(' STRIDE VOICE EMERGENCY — 5-MESSAGE PROGRESSION TEST');
  console.log('===============================================================');

  // Find a test citizen or existing user
  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } }
  });
  if (!citizen) throw new Error('No citizen found in database.');

  const userId = citizen.id;
  const conversationHistory: ChatMessage[] = [];
  let activeSosId: string | undefined = undefined;

  const testTurns = [
    { text: 'i am stuck i need help', label: 'Turn 1: Initial distress statement' },
    { text: 'What should i do now', label: 'Turn 2: Informational follow-up' },
    { text: 'ok', label: 'Turn 3: Ambiguous affirmation #1' },
    { text: 'ok', label: 'Turn 4: Ambiguous affirmation #2' },
    { text: 'No cant describe', label: 'Turn 5: Inability to describe' }
  ];

  const assistantResponses: string[] = [];

  for (let i = 0; i < testTurns.length; i++) {
    const turn = testTurns[i];
    console.log(`\n--- [${turn.label}] ---`);
    console.log(`User: "${turn.text}"`);

    const context = await getStrideContext(userId, activeSosId);
    const existingIncidentFacts = context.activeSos ? {
      emergencyType: context.activeSos.type,
      peopleCount: context.activeSos.peopleCount,
      waterLevel: context.activeSos.waterLevel,
    } : undefined;

    const result = await processEmergencyVoiceInput(
      turn.text,
      conversationHistory,
      context,
      existingIncidentFacts,
      `test-req-turn-${i + 1}`
    );

    console.log(`Assistant: "${result.assistantResponse}"`);
    console.log(`Mode: ${result.mode} | Intent: ${result.intent} | Target: ${result.questionTarget}`);
    console.log(`Extracted (Current User Facts):`, JSON.stringify(result.extractedInformation));
    console.log(`Uncertain:`, JSON.stringify(result.uncertainInformation));
    console.log(`Existing Incident Facts:`, JSON.stringify(result.existingIncidentFacts));

    if (result.shouldCreateOrUpdateSos && result.mode === 'EMERGENCY') {
      activeSosId = context.activeSos?.id || 'mock-sos-123';
    }

    // Check for identical consecutive responses
    if (i > 0 && result.assistantResponse === assistantResponses[i - 1]) {
      throw new Error(`REPETITION DETECTED at Turn ${i + 1}! Exact same response as Turn ${i}: "${result.assistantResponse}"`);
    }

    // Check if Turn 5 repeated the description request
    if (i === 4 && result.assistantResponse.toLowerCase().includes('describe the situation')) {
      throw new Error(`Turn 5 repeated the request to describe the situation despite user saying "No cant describe"!`);
    }

    assistantResponses.push(result.assistantResponse);
    conversationHistory.push({ role: 'user', content: turn.text });
    conversationHistory.push({ role: 'assistant', content: result.assistantResponse });
  }

  console.log('\n===============================================================');
  console.log(' ✅ SUCCESS: ALL 5 TURNS PROGRESSED WITHOUT ANY REPETITION!');
  console.log('===============================================================');
}

runFiveMessageTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
