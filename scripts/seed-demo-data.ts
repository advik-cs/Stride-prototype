import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/server/config/database.ts';
import { calculatePriorityScore } from '../src/server/utils/priority.ts';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

export const DEMO_PREFIX = 'DEMO_STRIDE_';

export interface DemoRequestSpec {
  reqId: string;
  userId: string;
  hhId: string;
  mbrId: string;
  assignId?: string;
  citizenName: string;
  phone: string;
  identityNum: string;
  hhName: string;
  address: string;
  latitude: number;
  longitude: number;
  memberAge: number;
  memberCategory: 'ADULT' | 'CHILD' | 'ELDERLY';
  relationship: string;
  conditions: string[];
  description: string;
  rescueStatus: 'PENDING' | 'TEAM_ASSIGNED' | 'IN_PROGRESS';
  assignment?: {
    teamName: string;
    notes: string;
    status: 'TEAM_ASSIGNED' | 'IN_PROGRESS';
  };
}

export const DEMO_REQUESTS: DemoRequestSpec[] = [
  // 1. CRITICAL — trapped + rapidly rising water + child + elderly + serious injury
  {
    reqId: `${DEMO_PREFIX}REQ_001`,
    userId: `${DEMO_PREFIX}USER_001`,
    hhId: `${DEMO_PREFIX}HH_001`,
    mbrId: `${DEMO_PREFIX}MBR_001`,
    assignId: `${DEMO_PREFIX}ASSIGN_001`,
    citizenName: 'Priya Sharma (Demo)',
    phone: '9900000001',
    identityNum: `${DEMO_PREFIX}CIT_001`,
    hhName: 'Palm Meadows Villa 101',
    address: '80 Feet Road, Koramangala 4th Block, Bengaluru',
    latitude: 12.9340,
    longitude: 77.6230,
    memberAge: 34,
    memberCategory: 'ADULT',
    relationship: 'Self',
    conditions: ['TRAPPED', 'WATER_RISING', 'CHILDREN_INFANTS_PRESENT', 'HEAVILY_INJURED', 'NEED_RESCUE'],
    description: '[P:5, C:2, E:1, D:0, I:1, W:CHEST_LEVEL, T:FLOOD_TRAPPED] Rapidly rising water in ground floor flat. Elderly grandmother with compound fracture and 2 children trapped on upper cabinet; water reaching chest level.',
    rescueStatus: 'TEAM_ASSIGNED',
    assignment: {
      teamName: 'NDRF 10th Battalion — Alpha Flood Squad',
      notes: 'Dispatched Gemini inflatable boat with 4 rescuers; ETA 8 mins.',
      status: 'TEAM_ASSIGNED',
    },
  },

  // 2. HIGH — multiple people + rising water
  {
    reqId: `${DEMO_PREFIX}REQ_002`,
    userId: `${DEMO_PREFIX}USER_002`,
    hhId: `${DEMO_PREFIX}HH_002`,
    mbrId: `${DEMO_PREFIX}MBR_002`,
    assignId: `${DEMO_PREFIX}ASSIGN_002`,
    citizenName: 'Rajesh Verma (Demo)',
    phone: '9900000002',
    identityNum: `${DEMO_PREFIX}CIT_002`,
    hhName: 'Atal Heights Sector 1',
    address: '27th Main Road, HSR Layout Sector 1, Bengaluru',
    latitude: 12.9125,
    longitude: 77.6380,
    memberAge: 42,
    memberCategory: 'ADULT',
    relationship: 'Self',
    conditions: ['WATER_RISING', 'TRAPPED', 'NEED_RESCUE'],
    description: '[P:4, C:0, E:0, D:0, I:0, W:WAIST_LEVEL, T:FLOOD] Stormwater overflow from lake breach trapped 4 adults in residential corridor; external exit gates locked by water pressure.',
    rescueStatus: 'TEAM_ASSIGNED',
    assignment: {
      teamName: 'Karnataka SDRF — Bravo Quick Response Team',
      notes: 'Amphibious response squad mobilized with life vests and safety line.',
      status: 'TEAM_ASSIGNED',
    },
  },

  // 3. HIGH — disabled/bedridden person + rescue required
  {
    reqId: `${DEMO_PREFIX}REQ_003`,
    userId: `${DEMO_PREFIX}USER_003`,
    hhId: `${DEMO_PREFIX}HH_003`,
    mbrId: `${DEMO_PREFIX}MBR_003`,
    assignId: `${DEMO_PREFIX}ASSIGN_003`,
    citizenName: 'Ananya Rao (Demo)',
    phone: '9900000003',
    identityNum: `${DEMO_PREFIX}CIT_003`,
    hhName: 'Sobha Dream Acres, Tower 4',
    address: 'Panathur Main Road, Balagere, Bengaluru',
    latitude: 12.9380,
    longitude: 77.6850,
    memberAge: 68,
    memberCategory: 'ELDERLY',
    relationship: 'Parent',
    conditions: ['PHYSICALLY_DISABLED', 'SERIOUSLY_UNWELL', 'WATER_RISING', 'NEED_RESCUE'],
    description: '[P:2, C:0, E:1, D:1, I:0, W:KNEE_LEVEL, T:MEDICAL_EVAC] Bedridden elderly patient dependent on dialysis and oxygen concentrator; basement generator submerged and power lost.',
    rescueStatus: 'IN_PROGRESS',
    assignment: {
      teamName: 'Bengaluru Fire & Emergency Services — Unit Charlie',
      notes: 'Emergency medical extraction in progress; stretcher and battery backup deployed.',
      status: 'IN_PROGRESS',
    },
  },

  // 4. MEDIUM — household evacuation
  {
    reqId: `${DEMO_PREFIX}REQ_004`,
    userId: `${DEMO_PREFIX}USER_004`,
    hhId: `${DEMO_PREFIX}HH_004`,
    mbrId: `${DEMO_PREFIX}MBR_004`,
    citizenName: 'Suresh Nair (Demo)',
    phone: '9900000004',
    identityNum: `${DEMO_PREFIX}CIT_004`,
    hhName: 'HAL Enclave Villa 12',
    address: '12th Main Road, HAL 2nd Stage, Indiranagar, Bengaluru',
    latitude: 12.9710,
    longitude: 77.6430,
    memberAge: 38,
    memberCategory: 'ADULT',
    relationship: 'Self',
    conditions: ['NEED_RESCUE', 'WATER_RISING', 'CHILDREN_INFANTS_PRESENT'],
    description: '[P:3, C:1, E:0, D:0, I:0, W:ANKLE_LEVEL, T:EVACUATION] Storm drain overflowing into driveway and ground level rooms. Precautionary evacuation requested for family with toddler.',
    rescueStatus: 'PENDING',
  },

  // 5. MEDIUM — water intrusion / stranded
  {
    reqId: `${DEMO_PREFIX}REQ_005`,
    userId: `${DEMO_PREFIX}USER_005`,
    hhId: `${DEMO_PREFIX}HH_005`,
    mbrId: `${DEMO_PREFIX}MBR_005`,
    citizenName: 'Deepa Patel (Demo)',
    phone: '9900000005',
    identityNum: `${DEMO_PREFIX}CIT_005`,
    hhName: 'BTM Lakeview Residency',
    address: 'Lakeview Road, BTM Layout 2nd Stage, Bengaluru',
    latitude: 12.9160,
    longitude: 77.6100,
    memberAge: 29,
    memberCategory: 'ADULT',
    relationship: 'Self',
    conditions: ['NEED_RESCUE', 'WATER_RISING'],
    description: '[P:2, C:0, E:0, D:0, I:0, W:KNEE_LEVEL, T:STRANDED] Waterlogging surrounding building complex; basement car park flooded, residents stranded on first floor without drinking water.',
    rescueStatus: 'PENDING',
  },

  // 6. LOW — assistance request
  {
    reqId: `${DEMO_PREFIX}REQ_006`,
    userId: `${DEMO_PREFIX}USER_006`,
    hhId: `${DEMO_PREFIX}HH_006`,
    mbrId: `${DEMO_PREFIX}MBR_006`,
    citizenName: 'Karthik Hegde (Demo)',
    phone: '9900000006',
    identityNum: `${DEMO_PREFIX}CIT_006`,
    hhName: 'Prestige Boulevard Block C',
    address: 'ITPL Main Road, Whitefield, Bengaluru',
    latitude: 12.9750,
    longitude: 77.7140,
    memberAge: 45,
    memberCategory: 'ADULT',
    relationship: 'Self',
    conditions: ['OTHER'],
    description: '[P:1, C:0, E:0, D:0, I:0, W:LOW, T:ASSISTANCE] Inflow of drain runoff across compound entry path. Requesting sandbag barriers and municipal dewatering pump assistance.',
    rescueStatus: 'PENDING',
  },
];

export async function seedDemoData(): Promise<void> {
  console.log('===============================================================');
  console.log(' STRIDE — SEEDING DEMO EMERGENCY & MISSION DATA');
  console.log('===============================================================');

  // 1. Locate active disaster
  let activeDisaster = await prisma.disasterEvent.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });

  if (!activeDisaster) {
    activeDisaster = await prisma.disasterEvent.findFirst({
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!activeDisaster) {
    // Create demo active disaster if database has zero disasters
    console.log('No existing disaster found. Creating demo active disaster event...');
    const now = new Date();
    activeDisaster = await prisma.disasterEvent.create({
      data: {
        id: `${DEMO_PREFIX}DISASTER_001`,
        type: 'FLOOD',
        title: 'Monsoon Flash Flood Warning — South Bengaluru Urban',
        description: 'Severe monsoon downpour inducing high-velocity surface runoff, lake breaches, and storm conduit overflow.',
        alertLevel: 'RED',
        predictedStartTime: new Date(now.getTime() - 2 * 3600 * 1000),
        predictedEndTime: new Date(now.getTime() + 48 * 3600 * 1000),
        status: 'ACTIVE',
      },
    });
  }

  console.log(`Active Disaster Target: [${activeDisaster.id}] "${activeDisaster.title}"`);

  // 2. Check Idempotency: have demo records already been seeded?
  const existingDemoRequests = await prisma.emergencyRequest.findMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });

  if (existingDemoRequests.length >= DEMO_REQUESTS.length) {
    console.log(`\n✅ DEMO DATA ALREADY SEEDED (${existingDemoRequests.length} requests found).`);
    console.log('Seed operation is idempotent. No duplicate records were created.');
    return;
  }

  // Find commander user for assignment if available
  const commanderUser = await prisma.user.findFirst({
    where: {
      OR: [
        { testIdentityNumber: 'AUTH-COMMAND-01' },
        { role: 'RESCUER' },
      ],
    },
  });

  const passwordHash = await bcrypt.hash('DemoPassword123!', 10);

  let createdCount = 0;
  let assignedCount = 0;

  for (const item of DEMO_REQUESTS) {
    // Check if this specific demo request exists
    const existingReq = await prisma.emergencyRequest.findUnique({
      where: { id: item.reqId },
    });
    if (existingReq) {
      console.log(`  • Request ${item.reqId} already exists, skipping.`);
      continue;
    }

    // Upsert demo User
    await prisma.user.upsert({
      where: { testIdentityNumber: item.identityNum },
      update: {},
      create: {
        id: item.userId,
        name: item.citizenName,
        mobileNumber: item.phone,
        testIdentityNumber: item.identityNum,
        password: passwordHash,
        role: 'CITIZEN',
      },
    });

    // Upsert demo Household
    await prisma.household.upsert({
      where: { id: item.hhId },
      update: {},
      create: {
        id: item.hhId,
        userId: item.userId,
        name: item.hhName,
        address: item.address,
        city: 'Bengaluru',
        state: 'Karnataka',
        latitude: item.latitude,
        longitude: item.longitude,
        onboardingCompleted: true,
      },
    });

    // Upsert demo HouseholdMember
    await prisma.householdMember.upsert({
      where: { id: item.mbrId },
      update: {},
      create: {
        id: item.mbrId,
        householdId: item.hhId,
        name: item.citizenName,
        age: item.memberAge,
        category: item.memberCategory,
        relationship: item.relationship,
      },
    });

    // Set EmergencyStatus to IN_DISTRESS
    await prisma.emergencyStatus.upsert({
      where: {
        disasterId_householdMemberId: {
          disasterId: activeDisaster.id,
          householdMemberId: item.mbrId,
        },
      },
      update: { status: 'IN_DISTRESS' },
      create: {
        disasterId: activeDisaster.id,
        householdMemberId: item.mbrId,
        status: 'IN_DISTRESS',
      },
    });

    // IMPORTANT: Calculate priority using the EXISTING priority algorithm!
    const { score } = await calculatePriorityScore(item.conditions);
    const calculatedLevel =
      score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';

    // Create EmergencyRequest
    await prisma.emergencyRequest.create({
      data: {
        id: item.reqId,
        disasterId: activeDisaster.id,
        householdMemberId: item.mbrId,
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address,
        description: item.description,
        priorityScore: score,
        rescueStatus: item.rescueStatus,
        conditions: {
          create: item.conditions.map((c) => ({
            conditionType: c,
          })),
        },
      },
    });
    createdCount++;

    // If assignment specified, create RescueAssignment
    if (item.assignment && item.assignId) {
      await prisma.rescueAssignment.create({
        data: {
          id: item.assignId,
          emergencyRequestId: item.reqId,
          teamName: item.assignment.teamName,
          assignedByUserId: commanderUser?.id || null,
          status: item.assignment.status,
          notes: item.assignment.notes,
        },
      });
      assignedCount++;
    }

    console.log(
      `  + [${calculatedLevel}] (Score: ${score}) ${item.reqId} -> ${item.address} (${item.rescueStatus})`
    );
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`✅ DEMO SEED COMPLETED: ${createdCount} requests created, ${assignedCount} assigned to field units.`);
  console.log('Authority queue and Rescuer missions are now populated.');
  console.log('===============================================================');
}

// Execute directly if run as a script
if (process.argv[1]?.endsWith('seed-demo-data.ts') || process.argv[1]?.endsWith('seed-demo-data.js')) {
  seedDemoData()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('Demo seed error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
