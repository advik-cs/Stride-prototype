import { Response } from 'express';
import prisma from '../config/database.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';

export const DEMO_RESCUE_TEAMS = [
  {
    id: 'team-ndrf-1',
    name: 'NDRF 10th Battalion — Alpha Flood Squad',
    type: 'Aquatic Search & Deep Water Rescue',
    leader: 'Inspector Rajesh Gowda, NDRF',
    base: 'Yelahanka Air Force Station Base',
    capability: 'Inflatable Gemini Boats, OBM Motors, Diving Gear',
    capacity: 8,
    currentLatitude: 13.1007,
    currentLongitude: 77.5963,
    status: 'AVAILABLE',
    contactNumber: '+91 80 2847 8001',
  },
  {
    id: 'team-sdrf-2',
    name: 'Karnataka SDRF — Bravo Quick Response Team',
    type: 'Amphibious Evacuation & Swift Water Rescue',
    leader: 'Sub-Inspector Manjunath K., SDRF',
    base: 'KSRP 3rd Battalion Camp, Koramangala',
    capability: 'Assault Boats, Life Rafts, Flood Safety Ropes',
    capacity: 6,
    currentLatitude: 12.9352,
    currentLongitude: 77.6245,
    status: 'AVAILABLE',
    contactNumber: '+91 80 2553 4402',
  },
  {
    id: 'team-fire-3',
    name: 'Bengaluru Fire & Emergency Services — Unit Charlie',
    type: 'Heavy Debris & Structural Rescue',
    leader: 'Station Officer S. Ramesh, KSFES',
    base: 'South Fire Station, Jayanagar 4th Block',
    capability: 'Hydraulic Cutters, Water Pumps, High-clearance Tenders',
    capacity: 10,
    currentLatitude: 12.9320,
    currentLongitude: 77.5850,
    status: 'AVAILABLE',
    contactNumber: '+91 80 2297 1503',
  },
  {
    id: 'team-medical-4',
    name: '108 Arogya Kavacha — Mobile Trauma Unit Delta',
    type: 'Disaster Critical Medical Triage',
    leader: 'Dr. Ananya Hegde, Critical Care Lead',
    base: 'Victoria Hospital Emergency Hub',
    capability: 'Advanced Life Support, Portable Ventilators, Defibrillators',
    capacity: 4,
    currentLatitude: 12.9634,
    currentLongitude: 77.5744,
    status: 'AVAILABLE',
    contactNumber: '+91 80 2670 1104',
  },
  {
    id: 'team-police-5',
    name: 'Bengaluru City Police — Law & Order Rescue Unit Echo',
    type: 'Perimeter Evacuation & Traffic Cordon',
    leader: 'Inspector Vijay Kumar, BCP Traffic & Rescue',
    base: 'East Division Command, Indiranagar',
    capability: 'PA Systems, 4x4 Heavy Jeeps, Drone Surveillance',
    capacity: 6,
    currentLatitude: 12.9784,
    currentLongitude: 77.6408,
    status: 'AVAILABLE',
    contactNumber: '+91 80 2294 2205',
  },
  {
    id: 'team-civil-6',
    name: 'Civil Defence Karnataka — Quick Action Boat Squad Foxtrot',
    type: 'Urban Lake Overflow & Shallow Water Rescue',
    leader: 'Warden Pradeep Shenoy, Civil Defence',
    base: 'Ulsoor Lake Civil Defence Depot',
    capability: 'Aluminium Flat-bottom Boats, PFDs, Thermal Blankets',
    capacity: 6,
    currentLatitude: 12.9810,
    currentLongitude: 77.6180,
    status: 'AVAILABLE',
    contactNumber: '+91 80 2551 0106',
  },
];

export async function assignRescueTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const requestId = req.params.requestId || req.params.id;
    const { teamName, teamId, notes } = req.body;
    const userId = req.user!.userId;

    const matchedTeam = DEMO_RESCUE_TEAMS.find((t) => t.id === teamId || t.name === teamName);
    const resolvedTeamName = matchedTeam?.name || teamName || teamId;

    if (!resolvedTeamName) {
      res.status(400).json({ error: 'Team name or ID is required.' });
      return;
    }

    const request = await prisma.emergencyRequest.findUnique({
      where: { id: requestId },
      include: { householdMember: true },
    });

    if (!request) {
      res.status(404).json({ error: 'Emergency request not found.' });
      return;
    }

    const assignment = await prisma.rescueAssignment.create({
      data: {
        emergencyRequestId: requestId,
        teamName: String(resolvedTeamName).trim(),
        assignedByUserId: userId,
        status: 'TEAM_ASSIGNED',
        notes: notes ? String(notes).trim() : 'Rapid dispatch initialized',
      },
    });

    // Update emergency request rescueStatus
    const updatedRequest = await prisma.emergencyRequest.update({
      where: { id: requestId },
      data: {
        rescueStatus: 'TEAM_ASSIGNED',
      },
      include: {
        conditions: true,
        rescueAssignments: {
          orderBy: { assignedAt: 'desc' },
        },
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
    });

    const formatted = formatRescueRequest(updatedRequest);

    res.status(201).json({
      message: 'Rescue team successfully assigned',
      assignment,
      request: formatted,
      id: updatedRequest.id,
      status: 'ASSIGNED',
      teamId: matchedTeam?.id || resolvedTeamName,
      team: matchedTeam || {
        id: assignment.id,
        name: resolvedTeamName,
        type: 'Rapid Response Unit',
        capacity: 6,
        currentLatitude: updatedRequest.latitude || 12.9716,
        currentLongitude: updatedRequest.longitude || 77.5946,
        status: 'BUSY',
        contactNumber: '+91 80 2297 1500',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to assign rescue team.' });
  }
}

export async function updateRescueStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const requestId = req.params.requestId || req.params.id;
    const { rescueStatus, status, notes } = req.body;
    let targetStatus = rescueStatus || status;

    if (targetStatus === 'ASSIGNED') targetStatus = 'TEAM_ASSIGNED';

    const validStatuses = ['PENDING', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'IN_PROGRESS', 'SAFELY_RESCUED', 'NOT_FOUND', 'CANCELLED'];
    if (!targetStatus || !validStatuses.includes(targetStatus)) {
      res.status(400).json({
        error: `Invalid rescue status. Must be one of: ${validStatuses.join(', ')}`,
      });
      return;
    }

    const request = await prisma.emergencyRequest.findUnique({
      where: { id: requestId },
      include: { householdMember: true },
    });

    if (!request) {
      res.status(404).json({ error: 'Emergency request not found.' });
      return;
    }

    // If marked SAFELY_RESCUED or CANCELLED, update EmergencyStatus to SAFE!
    if (targetStatus === 'SAFELY_RESCUED' || targetStatus === 'CANCELLED') {
      await prisma.emergencyStatus.upsert({
        where: {
          disasterId_householdMemberId: {
            disasterId: request.disasterId,
            householdMemberId: request.householdMemberId,
          },
        },
        update: {
          status: 'SAFE',
          updatedAt: new Date(),
        },
        create: {
          disasterId: request.disasterId,
          householdMemberId: request.householdMemberId,
          status: 'SAFE',
        },
      });
    }

    const updated = await prisma.emergencyRequest.update({
      where: { id: requestId },
      data: {
        rescueStatus: targetStatus,
      },
      include: {
        conditions: true,
        rescueAssignments: {
          orderBy: { assignedAt: 'desc' },
        },
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
    });

    if (notes) {
      const latestAssignment = await prisma.rescueAssignment.findFirst({
        where: { emergencyRequestId: requestId },
        orderBy: { assignedAt: 'desc' },
      });
      if (latestAssignment) {
        await prisma.rescueAssignment.update({
          where: { id: latestAssignment.id },
          data: {
            status: targetStatus,
            notes: String(notes).trim(),
          },
        });
      }
    }

    res.json(formatRescueRequest(updated));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update rescue status.' });
  }
}

export async function getPriorityConfigs(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const configs = await prisma.priorityConfiguration.findMany();
    res.json(configs);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch priority configurations.' });
  }
}

export async function updatePriorityConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { weight, isActive } = req.body;

    const updated = await prisma.priorityConfiguration.update({
      where: { id },
      data: {
        weight: weight !== undefined ? parseInt(weight, 10) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update priority configuration.' });
  }
}

// ==================== UNIFIED RESCUE REQUEST HANDLERS ====================

function formatRescueRequest(reqRecord: any, citizenUser?: any, customBreakdown?: any) {
  const score = reqRecord.priorityScore || 0;
  const level =
    score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';

  let status = reqRecord.rescueStatus || 'PENDING';
  if (status === 'TEAM_ASSIGNED') status = 'ASSIGNED';
  else if (status === 'SAFELY_RESCUED') status = 'RESCUED';

  const condTypes = reqRecord.conditions?.map((c: any) => c.conditionType) || [];
  const hasCriticalMedical = condTypes.includes('SERIOUSLY_UNWELL');
  const hasInjured = condTypes.includes('HEAVILY_INJURED');
  const hasChildren = condTypes.includes('CHILDREN_INFANTS_PRESENT');
  const hasDisabled = condTypes.includes('PHYSICALLY_DISABLED');
  const hasWaterRising = condTypes.includes('WATER_RISING');
  const hasTrapped = condTypes.includes('TRAPPED');
  const hasFire = condTypes.includes('FIRE');

  // Parse optional metadata embedded in description: e.g. [P:4, C:1, E:1, D:0, I:1, W:CHEST_LEVEL, T:FLOOD_TRAPPED] or [SRC:VOICE, P:4, ...]
  let rawDesc = reqRecord.description || 'Urgent assistance requested';
  let peopleCount = 1;
  let childrenCount = hasChildren ? 1 : 0;
  let elderlyCount = 0;
  let disabledCount = hasDisabled ? 1 : 0;
  let injuredCount = hasInjured ? 1 : 0;
  let waterLevel = hasWaterRising ? 'HIGH' : 'MEDIUM';
  let emergencyType = hasTrapped ? 'TRAPPED' : hasFire ? 'FIRE' : 'FLOOD';
  let isVoice = /\[(?:SRC:)?VOICE/i.test(rawDesc);
  let spokenLocation: string | undefined = undefined;
  let locationConflict = false;

  const metaMatch = rawDesc.match(/\[(?:SRC:([\w_]+),\s*)?P:(\d+)(?:,\s*C:(\d+))?(?:,\s*E:(\d+))?(?:,\s*D:(\d+))?(?:,\s*I:(\d+))?(?:,\s*W:([\w_]+))?(?:,\s*T:([\w_]+))?(?:,\s*SPOKEN_LOC:([^,\]]+))?(?:,\s*CONFLICT:(YES|NO))?\]/i);
  if (metaMatch) {
    if (metaMatch[1] && metaMatch[1].toUpperCase() === 'VOICE') isVoice = true;
    peopleCount = parseInt(metaMatch[2], 10) || 1;
    if (metaMatch[3] !== undefined) childrenCount = parseInt(metaMatch[3], 10);
    if (metaMatch[4] !== undefined) elderlyCount = parseInt(metaMatch[4], 10);
    if (metaMatch[5] !== undefined) disabledCount = parseInt(metaMatch[5], 10);
    if (metaMatch[6] !== undefined) injuredCount = parseInt(metaMatch[6], 10);
    if (metaMatch[7]) waterLevel = metaMatch[7];
    if (metaMatch[8]) emergencyType = metaMatch[8];
    if (metaMatch[9]) spokenLocation = metaMatch[9].trim();
    if (metaMatch[10]) locationConflict = metaMatch[10].toUpperCase() === 'YES';
    rawDesc = rawDesc.replace(metaMatch[0], '').trim();
  } else {
    // Fallback standard check
    const simpleMeta = rawDesc.match(/\[P:(\d+)(?:,\s*C:(\d+))?(?:,\s*E:(\d+))?(?:,\s*D:(\d+))?(?:,\s*I:(\d+))?(?:,\s*W:([\w_]+))?(?:,\s*T:([\w_]+))?\]/);
    if (simpleMeta) {
      peopleCount = parseInt(simpleMeta[1], 10) || 1;
      if (simpleMeta[2] !== undefined) childrenCount = parseInt(simpleMeta[2], 10);
      if (simpleMeta[3] !== undefined) elderlyCount = parseInt(simpleMeta[3], 10);
      if (simpleMeta[4] !== undefined) disabledCount = parseInt(simpleMeta[4], 10);
      if (simpleMeta[5] !== undefined) injuredCount = parseInt(simpleMeta[5], 10);
      if (simpleMeta[6]) waterLevel = simpleMeta[6];
      if (simpleMeta[7]) emergencyType = simpleMeta[7];
      rawDesc = rawDesc.replace(simpleMeta[0], '').trim();
    }
  }

  const breakdown = customBreakdown || {
    criticalMedical: hasCriticalMedical ? 25 : 0,
    injured: hasInjured ? 20 : 0,
    children: hasChildren ? 15 : 0,
    elderly: elderlyCount > 0 ? 15 : 0,
    disabled: hasDisabled ? 15 : 0,
    waterLevel: hasWaterRising || waterLevel === 'CHEST_LEVEL' ? 20 : 10,
    trappedOrStructural: hasTrapped ? 20 : hasFire ? 30 : 0,
  };

  const latestAssignment = reqRecord.rescueAssignments?.[0];
  const matchedTeam = latestAssignment ? DEMO_RESCUE_TEAMS.find((t) => t.name === latestAssignment.teamName) : null;

  return {
    id: reqRecord.id,
    citizenId: citizenUser?.id || reqRecord.householdMember?.household?.userId || 'unknown',
    latitude: reqRecord.latitude,
    longitude: reqRecord.longitude,
    address: reqRecord.address || 'Bengaluru',
    description: rawDesc,
    peopleCount,
    childrenCount,
    elderlyCount,
    disabledCount,
    injuredCount,
    criticalMedicalNeed: hasCriticalMedical,
    waterLevel,
    emergencyType,
    priorityScore: score,
    priorityLevel: level,
    status,
    priorityBreakdown: breakdown,
    source: isVoice ? 'VOICE' : 'MANUAL',
    spokenLocation,
    locationConflict,
    teamId: matchedTeam?.id || latestAssignment?.teamName || null,
    team: latestAssignment
      ? (matchedTeam || {
          id: latestAssignment.id,
          name: latestAssignment.teamName,
          type: 'Rapid Response Unit',
          capacity: 6,
          currentLatitude: reqRecord.latitude,
          currentLongitude: reqRecord.longitude,
          status: 'BUSY',
          contactNumber: '+91 80 2297 1500',
        })
      : null,
    citizen: {
      id: citizenUser?.id || reqRecord.householdMember?.household?.userId || 'unknown',
      name: citizenUser?.name || reqRecord.householdMember?.household?.user?.name || reqRecord.householdMember?.name || 'Citizen',
      phone: citizenUser?.mobileNumber || reqRecord.householdMember?.household?.user?.mobileNumber || undefined,
    },
    assignedById: latestAssignment?.assignedByUserId || null,
    assignedAt: latestAssignment?.assignedAt ? latestAssignment.assignedAt.toISOString() : null,
    rescuedAt: status === 'RESCUED' ? reqRecord.updatedAt?.toISOString() : null,
    createdAt: reqRecord.createdAt ? reqRecord.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: reqRecord.updatedAt ? reqRecord.updatedAt.toISOString() : new Date().toISOString(),
  };
}

export { formatRescueRequest };

export async function createRescueRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const {
      latitude,
      longitude,
      address,
      description,
      peopleCount = 1,
      childrenCount = 0,
      elderlyCount = 0,
      disabledCount = 0,
      injuredCount = 0,
      criticalMedicalNeed = false,
      waterLevel = 'MEDIUM',
      emergencyType = 'FLOOD',
    } = req.body;

    if (!address || !description) {
      res.status(400).json({ error: 'Address and description are required.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        households: {
          include: { members: true },
        },
      },
    });

    let household = user?.households?.[0];
    if (!household) {
      household = await prisma.household.create({
        data: {
          userId,
          name: `${user?.name || 'Citizen'} Household`,
          address: String(address).trim(),
          city: 'Bengaluru',
          state: 'Karnataka',
          latitude: Number(latitude) || 12.9716,
          longitude: Number(longitude) || 77.5946,
          members: {
            create: {
              name: user?.name || 'Primary Citizen',
              age: 35,
              category: 'ADULT',
              relationship: 'Self',
            },
          },
        },
        include: { members: true },
      });
    }

    let member = household.members?.[0];
    if (!member) {
      member = await prisma.householdMember.create({
        data: {
          householdId: household.id,
          name: user?.name || 'Primary Citizen',
          age: 35,
          category: 'ADULT',
          relationship: 'Self',
        },
      });
    }

    const activeDisaster =
      (await prisma.disasterEvent.findFirst({
        where: { status: { in: ['PREDICTED', 'ACTIVE', 'WARNING'] } },
        orderBy: { predictedStartTime: 'asc' },
      })) ||
      (await prisma.disasterEvent.findFirst({
        orderBy: { createdAt: 'desc' },
      }));

    if (!activeDisaster) {
      res.status(404).json({ error: 'No active disaster event found.' });
      return;
    }

    const conditionList: string[] = ['NEED_RESCUE'];
    if (criticalMedicalNeed) conditionList.push('SERIOUSLY_UNWELL');
    if (injuredCount > 0) conditionList.push('HEAVILY_INJURED');
    if (childrenCount > 0) conditionList.push('CHILDREN_INFANTS_PRESENT');
    if (disabledCount > 0) conditionList.push('PHYSICALLY_DISABLED');
    if (waterLevel === 'HIGH' || waterLevel === 'EXTREME') conditionList.push('WATER_RISING');
    if (emergencyType === 'TRAPPED') conditionList.push('TRAPPED');
    if (emergencyType === 'FIRE') conditionList.push('FIRE');

    const breakdown = {
      criticalMedical: criticalMedicalNeed ? 25 : 0,
      injured: injuredCount > 0 ? Math.min(25, Number(injuredCount) * 15) : 0,
      children: childrenCount > 0 ? Math.min(15, Number(childrenCount) * 8) : 0,
      elderly: elderlyCount > 0 ? Math.min(15, Number(elderlyCount) * 8) : 0,
      disabled: disabledCount > 0 ? Math.min(15, Number(disabledCount) * 10) : 0,
      waterLevel:
        waterLevel === 'EXTREME' ? 20 : waterLevel === 'HIGH' ? 15 : waterLevel === 'MEDIUM' ? 10 : 5,
      trappedOrStructural:
        emergencyType === 'TRAPPED' || emergencyType === 'STRUCTURAL_DANGER' ? 20 : emergencyType === 'FIRE' ? 30 : 0,
    };

    const calculatedTotal = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const priorityScore = Math.min(100, Math.max(15, calculatedTotal));

    const requestRecord = await prisma.emergencyRequest.create({
      data: {
        disasterId: activeDisaster.id,
        householdMemberId: member.id,
        latitude: Number(latitude) || household.latitude,
        longitude: Number(longitude) || household.longitude,
        address: String(address).trim(),
        description: `[SRC:MANUAL, P:${peopleCount}, C:${childrenCount}, E:${elderlyCount}, D:${disabledCount}, I:${injuredCount}, W:${waterLevel}, T:${emergencyType}] ${String(description).trim()}`,
        priorityScore,
        rescueStatus: 'PENDING',
        conditions: {
          create: conditionList.map((c) => ({ conditionType: c })),
        },
      },
      include: {
        conditions: true,
        rescueAssignments: true,
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
    });

    await prisma.emergencyStatus.upsert({
      where: {
        disasterId_householdMemberId: {
          disasterId: activeDisaster.id,
          householdMemberId: member.id,
        },
      },
      update: {
        status: 'IN_DISTRESS',
        updatedAt: new Date(),
      },
      create: {
        disasterId: activeDisaster.id,
        householdMemberId: member.id,
        status: 'IN_DISTRESS',
      },
    });

    const responseData = formatRescueRequest(requestRecord, user, breakdown);
    res.status(201).json(responseData);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create rescue request.' });
  }
}

export async function getMyRescueRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const requests = await prisma.emergencyRequest.findMany({
      where: {
        householdMember: {
          household: { userId },
        },
      },
      include: {
        conditions: true,
        rescueAssignments: { orderBy: { assignedAt: 'desc' } },
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = requests.map((r) => formatRescueRequest(r));
    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch your rescue requests.' });
  }
}

export async function getRescueRequestByIdUnified(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const record = await prisma.emergencyRequest.findUnique({
      where: { id },
      include: {
        conditions: true,
        rescueAssignments: { orderBy: { assignedAt: 'desc' } },
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
    });

    if (!record) {
      res.status(404).json({ error: 'Rescue request not found.' });
      return;
    }

    res.json(formatRescueRequest(record));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch rescue request.' });
  }
}

export async function cancelRescueRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const record = await prisma.emergencyRequest.findUnique({
      where: { id },
      include: { householdMember: true },
    });

    if (!record) {
      res.status(404).json({ error: 'Rescue request not found.' });
      return;
    }

    const updated = await prisma.emergencyRequest.update({
      where: { id },
      data: { rescueStatus: 'CANCELLED' },
      include: {
        conditions: true,
        rescueAssignments: { orderBy: { assignedAt: 'desc' } },
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
    });

    await prisma.emergencyStatus.upsert({
      where: {
        disasterId_householdMemberId: {
          disasterId: record.disasterId,
          householdMemberId: record.householdMemberId,
        },
      },
      update: {
        status: 'SAFE',
        updatedAt: new Date(),
      },
      create: {
        disasterId: record.disasterId,
        householdMemberId: record.householdMemberId,
        status: 'SAFE',
      },
    });

    res.json(formatRescueRequest(updated));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to cancel rescue request.' });
  }
}

export async function getRankedRescueRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const requests = await prisma.emergencyRequest.findMany({
      where: {
        rescueStatus: { not: 'CANCELLED' },
      },
      include: {
        conditions: true,
        rescueAssignments: { orderBy: { assignedAt: 'desc' } },
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json(requests.map((r) => formatRescueRequest(r)));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch ranked requests.' });
  }
}

export async function getMapRescueRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const requests = await prisma.emergencyRequest.findMany({
      where: {
        rescueStatus: { not: 'CANCELLED' },
      },
      include: {
        conditions: true,
        rescueAssignments: { orderBy: { assignedAt: 'desc' } },
      },
    });

    const markers = requests.map((r) => {
      const formatted = formatRescueRequest(r);
      return {
        id: formatted.id,
        latitude: formatted.latitude,
        longitude: formatted.longitude,
        priorityScore: formatted.priorityScore,
        priorityLevel: formatted.priorityLevel,
        status: formatted.status,
        peopleCount: formatted.peopleCount,
        emergencyType: formatted.emergencyType,
        waterLevel: formatted.waterLevel,
        shortDescription: formatted.description,
        address: formatted.address,
        createdAt: formatted.createdAt,
        assignedTeam: formatted.team,
      };
    });

    res.json(markers);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch map requests.' });
  }
}

export async function getAvailableRescueTeams(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    res.json(DEMO_RESCUE_TEAMS);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch rescue teams.' });
  }
}

export async function getAssignedMissions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const requests = await prisma.emergencyRequest.findMany({
      where: {
        rescueStatus: { in: ['TEAM_ASSIGNED', 'ASSIGNED', 'IN_PROGRESS'] },
      },
      include: {
        conditions: true,
        rescueAssignments: { orderBy: { assignedAt: 'desc' } },
        householdMember: {
          include: { household: { include: { user: true } } },
        },
      },
      orderBy: { priorityScore: 'desc' },
    });

    res.json(requests.map((r) => formatRescueRequest(r)));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch assigned missions.' });
  }
}
