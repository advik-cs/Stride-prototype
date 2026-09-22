import { Response } from 'express';
import prisma from '../config/database.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { calculatePriorityScore } from '../utils/priority.ts';
import { isLocationInAffectedZone } from '../utils/geo.ts';

export async function getMyStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const userId = req.user!.userId;

    const household = await prisma.household.findFirst({
      where: { userId },
      include: {
        members: {
          include: {
            emergencyStatuses: {
              where: { disasterId },
            },
            emergencyRequests: {
              where: { disasterId },
              include: { conditions: true, rescueAssignments: true },
            },
          },
        },
      },
    });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    const membersStatus = household.members.map((m) => ({
      memberId: m.id,
      name: m.name,
      category: m.category,
      relationship: m.relationship,
      status: m.emergencyStatuses[0]?.status || 'UNACCOUNTED',
      activeRequest: m.emergencyRequests[0] || null,
    }));

    res.json({
      householdId: household.id,
      householdName: household.name,
      members: membersStatus,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch status.' });
  }
}

/**
 * Updates live status (SAFE, IN_DISTRESS, UNACCOUNTED) for members of user's household
 */
export async function updateStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const { memberIds, status } = req.body;
    const userId = req.user!.userId;

    if (!status || !['SAFE', 'IN_DISTRESS', 'UNACCOUNTED'].includes(status)) {
      res.status(400).json({ error: 'Valid status required (SAFE, IN_DISTRESS, UNACCOUNTED).' });
      return;
    }

    // Verify ownership
    const household = await prisma.household.findFirst({
      where: { userId },
      include: { members: true },
    });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    const authorizedMemberIds = household.members.map((m) => m.id);
    const targetIds = Array.isArray(memberIds) && memberIds.length > 0 ? memberIds : authorizedMemberIds;

    const invalidIds = targetIds.filter((id) => !authorizedMemberIds.includes(id));
    if (invalidIds.length > 0 && req.user!.role !== 'RESCUER') {
      res.status(403).json({ error: 'You can only update status for members in your own household.' });
      return;
    }

    const updatedRecords = [];
    for (const memberId of targetIds) {
      const rec = await prisma.emergencyStatus.upsert({
        where: {
          disasterId_householdMemberId: {
            disasterId,
            householdMemberId: memberId,
          },
        },
        update: {
          status,
          updatedAt: new Date(),
        },
        create: {
          disasterId,
          householdMemberId: memberId,
          status,
        },
      });
      updatedRecords.push(rec);
    }

    res.json({
      message: `Emergency status updated to ${status}`,
      updated: updatedRecords,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update emergency status.' });
  }
}

/**
 * Create Emergency Request ("I NEED HELP")
 */
export async function createEmergencyRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const {
      householdMemberId,
      latitude,
      longitude,
      address,
      description,
      conditions, // Array of string condition types
    } = req.body;

    const userId = req.user!.userId;

    // Verify member belongs to this user or user is rescuer
    const member = await prisma.householdMember.findUnique({
      where: { id: householdMemberId },
      include: { household: true },
    });

    if (!member) {
      res.status(404).json({ error: 'Household member not found.' });
      return;
    }

    if (req.user!.role === 'CITIZEN' && member.household.userId !== userId) {
      res.status(403).json({ error: 'Unauthorized to submit request for this member.' });
      return;
    }

    const conditionList: string[] = Array.isArray(conditions) && conditions.length > 0 ? conditions : ['NEED_RESCUE'];

    // Calculate priority score on backend
    const { score } = await calculatePriorityScore(conditionList);

    const reqLat = latitude !== undefined ? parseFloat(latitude) : member.household.latitude;
    const reqLng = longitude !== undefined ? parseFloat(longitude) : member.household.longitude;
    const reqAddress = address || member.household.address;

    // Update emergency status to IN_DISTRESS
    await prisma.emergencyStatus.upsert({
      where: {
        disasterId_householdMemberId: {
          disasterId,
          householdMemberId,
        },
      },
      update: {
        status: 'IN_DISTRESS',
        updatedAt: new Date(),
      },
      create: {
        disasterId,
        householdMemberId,
        status: 'IN_DISTRESS',
      },
    });

    // Create emergency request
    const emergencyRequest = await prisma.emergencyRequest.create({
      data: {
        disasterId,
        householdMemberId,
        latitude: reqLat,
        longitude: reqLng,
        address: reqAddress,
        description: description ? String(description).trim() : 'Urgent rescue requested.',
        priorityScore: score,
        rescueStatus: 'PENDING',
        conditions: {
          create: conditionList.map((c) => ({ conditionType: c })),
        },
      },
      include: {
        conditions: true,
        householdMember: {
          include: { household: true },
        },
      },
    });

    res.status(201).json(emergencyRequest);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create emergency request.' });
  }
}

export async function getEmergencyRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const { status, minPriority } = req.query;

    const whereClause: any = { disasterId };
    if (status) {
      whereClause.rescueStatus = String(status);
    }
    if (minPriority) {
      whereClause.priorityScore = { gte: parseInt(String(minPriority), 10) };
    }

    // If citizen, return only requests from their household
    if (req.user!.role === 'CITIZEN') {
      const userHouseholds = await prisma.household.findMany({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      const householdIds = userHouseholds.map((h) => h.id);

      whereClause.householdMember = {
        householdId: { in: householdIds },
      };
    }

    const requests = await prisma.emergencyRequest.findMany({
      where: whereClause,
      include: {
        conditions: true,
        rescueAssignments: {
          orderBy: { assignedAt: 'desc' },
        },
        householdMember: {
          include: { household: true },
        },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch emergency requests.' });
  }
}

export async function getEmergencyRequestById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { requestId } = req.params;

    const request = await prisma.emergencyRequest.findUnique({
      where: { id: requestId },
      include: {
        conditions: true,
        rescueAssignments: {
          include: { assignedByUser: { select: { name: true, mobileNumber: true } } },
        },
        householdMember: {
          include: { household: true },
        },
      },
    });

    if (!request) {
      res.status(404).json({ error: 'Emergency request not found.' });
      return;
    }

    // Role-based authorization: CITIZEN can only view their own emergency requests
    const userRole = req.user?.role;
    const userId = req.user?.userId;
    const ownerUserId = request.householdMember?.household?.userId;
    if (userRole === 'CITIZEN' && ownerUserId && ownerUserId !== userId) {
      res.status(403).json({ error: 'Access denied: You can only view your own emergency requests.' });
      return;
    }

    res.json(request);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch emergency request.' });
  }
}

export async function updateEmergencyRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { requestId } = req.params;
    const { description, conditions, rescueStatus } = req.body;

    const existing = await prisma.emergencyRequest.findUnique({
      where: { id: requestId },
      include: { householdMember: { include: { household: true } } },
    });

    if (!existing) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    if (req.user!.role === 'CITIZEN' && existing.householdMember.household.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }

    let newScore = existing.priorityScore;
    if (Array.isArray(conditions)) {
      const calc = await calculatePriorityScore(conditions);
      newScore = calc.score;

      // Replace conditions
      await prisma.emergencyCondition.deleteMany({ where: { emergencyRequestId: requestId } });
      await prisma.emergencyCondition.createMany({
        data: conditions.map((c: string) => ({
          emergencyRequestId: requestId,
          conditionType: c,
        })),
      });
    }

    const updated = await prisma.emergencyRequest.update({
      where: { id: requestId },
      data: {
        description: description !== undefined ? String(description).trim() : undefined,
        rescueStatus: rescueStatus || undefined,
        priorityScore: newScore,
      },
      include: {
        conditions: true,
        rescueAssignments: true,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update emergency request.' });
  }
}

// ==================== COMMUNITY LIVE STATUS ====================

export async function getCommunityStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;

    const households = await prisma.household.findMany({
      include: {
        members: {
          include: {
            emergencyStatuses: {
              where: { disasterId },
            },
          },
        },
      },
    });

    let totalPopulation = 0;
    let confirmedSafe = 0;
    let inDistress = 0;
    let unaccounted = 0;

    for (const h of households) {
      for (const m of h.members) {
        totalPopulation++;
        const st = m.emergencyStatuses[0];
        if (!st || st.status === 'UNACCOUNTED') {
          unaccounted++;
        } else if (st.status === 'SAFE') {
          confirmedSafe++;
        } else if (st.status === 'IN_DISTRESS') {
          inDistress++;
        }
      }
    }

    // Count pending vs assigned emergency requests
    const activeRequests = await prisma.emergencyRequest.findMany({
      where: { disasterId },
      select: { rescueStatus: true, priorityScore: true },
    });

    const pendingRequests = activeRequests.filter((r) => r.rescueStatus === 'PENDING').length;
    const teamAssigned = activeRequests.filter((r) => r.rescueStatus === 'TEAM_ASSIGNED').length;
    const safelyRescued = activeRequests.filter((r) => r.rescueStatus === 'SAFELY_RESCUED').length;
    const notFound = activeRequests.filter((r) => r.rescueStatus === 'NOT_FOUND').length;

    res.json({
      disasterId,
      totalPopulation,
      confirmedSafe,
      inDistress,
      unaccounted,
      emergencyRequests: {
        total: activeRequests.length,
        pending: pendingRequests,
        teamAssigned,
        safelyRescued,
        notFound,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch community status.' });
  }
}

export async function getBuildingLiveStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId, buildingId } = req.params;

    const household = await prisma.household.findUnique({
      where: { id: buildingId },
      include: {
        members: {
          include: {
            expectedLocations: { where: { disasterId } },
            emergencyStatuses: { where: { disasterId } },
            emergencyRequests: {
              where: { disasterId },
              include: { conditions: true, rescueAssignments: true },
            },
          },
        },
      },
    });

    if (!household) {
      res.status(404).json({ error: 'Building not found.' });
      return;
    }

    let expectedHome = 0;
    let confirmedSafe = 0;
    let inDistress = 0;
    let unaccounted = 0;

    for (const m of household.members) {
      if (m.expectedLocations[0]?.expectedType === 'HOME') {
        expectedHome++;
      }
      const st = m.emergencyStatuses[0];
      if (st?.status === 'SAFE') confirmedSafe++;
      else if (st?.status === 'IN_DISTRESS') inDistress++;
      else unaccounted++;
    }

    res.json({
      buildingId: household.id,
      name: household.name,
      address: household.address,
      registeredPopulation: household.members.length,
      expectedOccupancy: expectedHome,
      confirmedSafe,
      inDistress,
      unaccounted,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch building status.' });
  }
}

export async function getZoneLiveStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId, zoneId } = req.params;

    const zone = await prisma.affectedZone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      res.status(404).json({ error: 'Zone not found.' });
      return;
    }

    const households = await prisma.household.findMany({
      include: {
        members: {
          include: {
            emergencyStatuses: { where: { disasterId } },
          },
        },
      },
    });

    let zonePopulation = 0;
    let confirmedSafe = 0;
    let inDistress = 0;
    let unaccounted = 0;

    for (const h of households) {
      if (isLocationInAffectedZone(h.latitude, h.longitude, zone.polygonGeoJson, zone.radiusKm)) {
        for (const m of h.members) {
          zonePopulation++;
          const st = m.emergencyStatuses[0];
          if (st?.status === 'SAFE') confirmedSafe++;
          else if (st?.status === 'IN_DISTRESS') inDistress++;
          else unaccounted++;
        }
      }
    }

    res.json({
      zoneId: zone.id,
      name: zone.name,
      riskLevel: zone.riskLevel,
      zonePopulation,
      confirmedSafe,
      inDistress,
      unaccounted,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch zone live status.' });
  }
}
