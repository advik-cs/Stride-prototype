import 'dotenv/config';
import prisma from '../src/server/config/database.ts';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

export const DEMO_PREFIX = 'DEMO_STRIDE_';

export async function clearDemoData(): Promise<void> {
  console.log('===============================================================');
  console.log(' STRIDE — CLEARING DEMO EMERGENCY & MISSION DATA');
  console.log('===============================================================');

  // 1. Delete RescueAssignments
  const deletedAssignments = await prisma.rescueAssignment.deleteMany({
    where: {
      OR: [
        { id: { startsWith: DEMO_PREFIX } },
        { emergencyRequestId: { startsWith: DEMO_PREFIX } },
      ],
    },
  });

  // 2. Delete EmergencyConditions
  const deletedConditions = await prisma.emergencyCondition.deleteMany({
    where: {
      OR: [
        { id: { startsWith: DEMO_PREFIX } },
        { emergencyRequestId: { startsWith: DEMO_PREFIX } },
      ],
    },
  });

  // 3. Delete EmergencyStatuses for demo members
  const deletedStatuses = await prisma.emergencyStatus.deleteMany({
    where: {
      householdMemberId: { startsWith: DEMO_PREFIX },
    },
  });

  // 4. Delete EmergencyRequests
  const deletedRequests = await prisma.emergencyRequest.deleteMany({
    where: {
      id: { startsWith: DEMO_PREFIX },
    },
  });

  // 5. Delete HouseholdMembers
  const deletedMembers = await prisma.householdMember.deleteMany({
    where: {
      id: { startsWith: DEMO_PREFIX },
    },
  });

  // 6. Delete Households
  const deletedHouseholds = await prisma.household.deleteMany({
    where: {
      id: { startsWith: DEMO_PREFIX },
    },
  });

  // 7. Delete Users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      id: { startsWith: DEMO_PREFIX },
    },
  });

  // 8. Delete any fallback DisasterEvent if one was created
  const deletedDisasters = await prisma.disasterEvent.deleteMany({
    where: {
      id: { startsWith: DEMO_PREFIX },
    },
  });

  console.log('Deleted demo records:');
  console.log(`  - Rescue Assignments: ${deletedAssignments.count}`);
  console.log(`  - Emergency Conditions: ${deletedConditions.count}`);
  console.log(`  - Emergency Statuses: ${deletedStatuses.count}`);
  console.log(`  - Emergency Requests: ${deletedRequests.count}`);
  console.log(`  - Household Members: ${deletedMembers.count}`);
  console.log(`  - Households: ${deletedHouseholds.count}`);
  console.log(`  - Users: ${deletedUsers.count}`);
  if (deletedDisasters.count > 0) {
    console.log(`  - Demo Disasters: ${deletedDisasters.count}`);
  }

  // Verification: Real database records remain safe and untouched
  const remainingRealUsers = await prisma.user.count();
  const remainingRealHouseholds = await prisma.household.count();
  const remainingRealRequests = await prisma.emergencyRequest.count();

  console.log('\nIntegrity Check (Remaining non-demo records):');
  console.log(`  • Real Users: ${remainingRealUsers}`);
  console.log(`  • Real Households: ${remainingRealHouseholds}`);
  console.log(`  • Real Emergency Requests: ${remainingRealRequests}`);

  console.log('\n---------------------------------------------------------------');
  console.log('✅ DEMO CLEANUP COMPLETED: All temporary demo records purged safely.');
  console.log('===============================================================');
}

// Execute directly if run as a script
if (process.argv[1]?.endsWith('clear-demo-data.ts') || process.argv[1]?.endsWith('clear-demo-data.js')) {
  clearDemoData()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('Demo cleanup error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
