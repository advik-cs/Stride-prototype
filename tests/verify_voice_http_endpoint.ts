import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import createApp from '../src/server/app.ts';
import prisma from '../src/server/config/database.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'stride-hackathon-secure-jwt-secret-key-2026';

async function runHttpIntegrationTest() {
  console.log('\n--- STARTING LIVE HTTP ENDPOINT VERIFICATION ---');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Ephemeral test server running at ${baseUrl}`);

  // Find or create citizen user
  let citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } },
  });

  if (!citizen) {
    citizen = await prisma.user.create({
      data: {
        email: 'http_citizen@stride.org',
        passwordHash: 'dummy',
        name: 'HTTP Citizen',
        mobileNumber: '9888877777',
        role: 'CITIZEN',
      },
      include: { households: { include: { members: true } } },
    });
  }

  const token = jwt.sign(
    { userId: citizen.id, email: citizen.email, role: citizen.role },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    console.log('1. Health check status:', healthData.status);

    // 2. ASSIST inquiry
    const assistRes = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message: 'Where is the nearest shelter?',
        history: [],
      }),
    });
    const assistData = await assistRes.json();
    console.log('2. Assist endpoint test:');
    console.log('   Mode:', assistData.mode);
    console.log('   Should SOS:', assistData.shouldCreateOrUpdateSos);
    console.log('   Response:', assistData.assistantResponse.slice(0, 80) + '...');

    if (assistData.mode !== 'ASSIST' || assistData.shouldCreateOrUpdateSos !== false) {
      throw new Error(`Expected mode ASSIST, got ${assistData.mode}`);
    }

    // 3. Clear EMERGENCY call
    const emergencyRes = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message:
          'Please help us! We are trapped inside our home in Koramangala. Water is rising fast. 4 people here and grandfather cannot walk.',
        history: [{ role: 'user', content: 'Where is the nearest shelter?' }, { role: 'assistant', content: assistData.assistantResponse }],
        currentLocation: { latitude: 12.9352, longitude: 77.6245 },
      }),
    });
    const emergencyData = await emergencyRes.json();
    console.log('3. Emergency endpoint test:');
    console.log('   Mode:', emergencyData.mode);
    console.log('   Should SOS:', emergencyData.shouldCreateOrUpdateSos);
    console.log('   Created SOS ID:', emergencyData.activeRequest?.id);
    console.log('   Priority Score:', emergencyData.activeRequest?.priorityScore);
    console.log('   Priority Level:', emergencyData.activeRequest?.priorityLevel);
    console.log('   Source:', emergencyData.activeRequest?.source);

    if (emergencyData.mode !== 'EMERGENCY' || !emergencyData.activeRequest) {
      throw new Error(`Expected EMERGENCY mode and activeRequest, got ${JSON.stringify(emergencyData)}`);
    }

    const firstSosId = emergencyData.activeRequest.id;

    // 4. Update existing SOS in-place (no duplicate)
    const updateRes = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message: 'The water is chest level now and one person has heavy bleeding from an injury.',
        history: [
          { role: 'user', content: 'We are trapped' },
          { role: 'assistant', content: emergencyData.assistantResponse },
        ],
        currentLocation: { latitude: 12.9352, longitude: 77.6245 },
        activeRequestId: firstSosId,
      }),
    });
    const updateData = await updateRes.json();
    console.log('4. Update existing SOS test:');
    console.log('   Updated SOS ID:', updateData.activeRequest?.id);
    console.log('   Matches first SOS ID:', updateData.activeRequest?.id === firstSosId);
    console.log('   New Priority Score:', updateData.activeRequest?.priorityScore);
    console.log('   Source:', updateData.activeRequest?.source);

    if (updateData.activeRequest?.id !== firstSosId) {
      throw new Error(`Duplicate SOS created! Expected ${firstSosId}, got ${updateData.activeRequest?.id}`);
    }

    // 5. Location Conflict test
    const conflictRes = await fetch(`${baseUrl}/api/voice/emergency-chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message: 'We are marooned at Indiranagar 100ft Road, water rising quickly',
        history: [],
        currentLocation: { latitude: 12.9352, longitude: 77.6245 }, // Koramangala GPS vs Indiranagar spoken
      }),
    });
    const conflictData = await conflictRes.json();
    console.log('5. Location Conflict test:');
    console.log('   Location conflict detected:', conflictData.locationConflict);
    console.log('   Spoken location:', conflictData.extractedInformation?.spokenLocation);

    if (!conflictData.locationConflict) {
      throw new Error('Expected locationConflict to be true when GPS is Koramangala and spoken is Indiranagar');
    }

    console.log('\n✅ ALL LIVE HTTP ENDPOINT INTEGRATION TESTS PASSED!\n');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runHttpIntegrationTest().catch((err) => {
  console.error('HTTP integration test failed:', err);
  process.exit(1);
});
