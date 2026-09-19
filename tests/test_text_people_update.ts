import 'dotenv/config';
import prisma from '../src/server/config/database.ts';
import { handleVoiceEmergencyChat } from '../src/server/controllers/voiceEmergencyController.ts';
import { formatRescueRequest } from '../src/server/controllers/rescueController.ts';

async function testTextPeopleUpdate() {
  console.log('Testing Existing SOS People=1 -> Text: "There are 4 people with me."');

  // Find a citizen
  const citizen = await prisma.user.findFirst({
    where: { role: 'CITIZEN' },
    include: { households: { include: { members: true } } }
  });
  if (!citizen) throw new Error('Citizen not found');

  const household = citizen.households[0];
  const member = household.members[0];

  // Find active disaster
  const disaster = await prisma.disasterEvent.findFirst({
    where: { status: 'ACTIVE' }
  });
  if (!disaster) throw new Error('Active disaster not found');

  // Create an existing SOS with People = 1
  const existingSos = await prisma.emergencyRequest.create({
    data: {
      disasterId: disaster.id,
      householdMemberId: member.id,
      latitude: household.latitude,
      longitude: household.longitude,
      address: household.address,
      description: '[SRC:VOICE, P:1, C:0, E:0, D:0, I:0, W:MEDIUM, T:FLOOD] Trapped citizen',
      priorityScore: 25,
      rescueStatus: 'PENDING',
      conditions: {
        create: [{ conditionType: 'NEED_RESCUE' }]
      }
    },
    include: { conditions: true }
  });

  console.log('Created initial SOS:', {
    id: existingSos.id,
    desc: existingSos.description,
    formatted: formatRescueRequest(existingSos)
  });

  // Mock req / res
  let responseData: any = null;
  const mockReq: any = {
    user: { userId: citizen.id, role: 'CITIZEN' },
    body: {
      message: 'There are 4 people with me.',
      history: [],
      activeRequestId: existingSos.id,
      sessionId: 'test-session-p4'
    },
    headers: {}
  };

  const mockRes: any = {
    status: (code: number) => ({
      json: (data: any) => { responseData = { code, data }; }
    }),
    json: (data: any) => { responseData = { code: 200, data }; }
  };

  await handleVoiceEmergencyChat(mockReq, mockRes);

  console.log('Response Status:', responseData?.code);
  console.log('Response Mode:', responseData?.data?.mode);
  console.log('Extracted Facts:', responseData?.data?.extractedInformation);
  console.log('Response ActiveRequest:', responseData?.data?.activeRequest);

  // Check database after update
  const afterSos = await prisma.emergencyRequest.findUnique({
    where: { id: existingSos.id },
    include: { conditions: true }
  });

  const formattedAfter = formatRescueRequest(afterSos);
  console.log('Database SOS after update:', {
    id: afterSos?.id,
    description: afterSos?.description,
    peopleCount: formattedAfter.peopleCount,
    priorityScore: afterSos?.priorityScore
  });

  // Clean up
  await prisma.emergencyCondition.deleteMany({ where: { emergencyRequestId: existingSos.id } });
  await prisma.emergencyRequest.delete({ where: { id: existingSos.id } });

  if (formattedAfter.peopleCount !== 4) {
    console.error(`❌ FAILED: Expected peopleCount = 4, got ${formattedAfter.peopleCount}`);
    process.exit(1);
  } else {
    console.log(`✅ SUCCESS: peopleCount was updated to 4!`);
  }
}

testTextPeopleUpdate().catch(e => {
  console.error('Error:', e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
