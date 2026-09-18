import { Response } from 'express';
import prisma from '../config/database.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';

/**
 * Controller to provide Live Operational Disaster & Rescue Analytics
 * Only accessible to AUTHORITY and RESCUER roles
 */
export async function getAnalyticsSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const disasterId = (req.query.disasterId as string) || undefined;

    // Fetch active or specified disaster
    const disaster = disasterId
      ? await prisma.disasterEvent.findUnique({ where: { id: disasterId } })
      : await prisma.disasterEvent.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        }) ||
        await prisma.disasterEvent.findFirst({
          orderBy: { createdAt: 'desc' },
        });

    const activeId = disaster?.id;

    // Emergency statuses breakdown
    let safeCount = 0;
    let distressCount = 0;
    let unaccountedCount = 0;

    if (activeId) {
      const statuses = await prisma.emergencyStatus.findMany({
        where: { disasterId: activeId },
      });
      for (const s of statuses) {
        if (s.status === 'SAFE') safeCount++;
        else if (s.status === 'IN_DISTRESS') distressCount++;
        else unaccountedCount++;
      }
    }

    // Emergency requests breakdown
    const requests = activeId
      ? await prisma.emergencyRequest.findMany({
          where: { disasterId: activeId },
          include: { conditions: true, rescueAssignments: true },
        })
      : [];

    const requestStats = {
      total: requests.length,
      pending: requests.filter((r) => r.rescueStatus === 'PENDING').length,
      assigned: requests.filter((r) => r.rescueStatus === 'TEAM_ASSIGNED').length,
      safelyRescued: requests.filter((r) => r.rescueStatus === 'SAFELY_RESCUED').length,
      notFound: requests.filter((r) => r.rescueStatus === 'NOT_FOUND').length,
      criticalPriority: requests.filter((r) => r.priorityScore >= 80).length,
      highPriority: requests.filter((r) => r.priorityScore >= 50 && r.priorityScore < 80).length,
      moderatePriority: requests.filter((r) => r.priorityScore < 50).length,
    };

    // Shelters occupancy & buffer
    const shelters = await prisma.shelter.findMany();
    const expectedLocations = activeId
      ? await prisma.expectedLocation.findMany({
          where: { disasterId: activeId, expectedType: 'SHELTER', shelterId: { not: null } },
        })
      : [];

    const shelterArrivals: Record<string, number> = {};
    for (const loc of expectedLocations) {
      if (loc.shelterId) {
        shelterArrivals[loc.shelterId] = (shelterArrivals[loc.shelterId] || 0) + 1;
      }
    }

    let totalShelterCapacity = 0;
    let totalExpectedArrivals = 0;
    let criticalSheltersCount = 0;

    const shelterData = shelters.map((s) => {
      const arrivals = shelterArrivals[s.id] || 0;
      totalShelterCapacity += s.capacity;
      totalExpectedArrivals += arrivals;
      const pct = Math.round((arrivals / s.capacity) * 100);
      if (pct >= 90) criticalSheltersCount++;

      return {
        id: s.id,
        name: s.name,
        address: s.address,
        capacity: s.capacity,
        expectedArrivals: arrivals,
        remainingCapacity: s.capacity - arrivals,
        occupancyPercentage: pct,
        status: pct > 100 ? 'OVER_CAPACITY' : pct >= 90 ? 'NEAR_CAPACITY' : 'AVAILABLE',
      };
    });

    // Demographics breakdown from HouseholdMember
    const allMembers = await prisma.householdMember.findMany();
    const demographics = {
      totalRegistered: allMembers.length,
      children: allMembers.filter((m) => m.category === 'CHILD').length,
      elderly: allMembers.filter((m) => m.category === 'ELDERLY').length,
      adults: allMembers.filter((m) => m.category === 'ADULT').length,
      disabled: allMembers.filter((m) => m.category === 'DISABLED').length,
    };

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      disaster: disaster
        ? {
            id: disaster.id,
            title: disaster.title,
            type: disaster.type,
            alertLevel: disaster.alertLevel,
            status: disaster.status,
          }
        : null,
      headcount: {
        totalExpected: demographics.totalRegistered || 1240,
        confirmedSafe: safeCount,
        inDistress: distressCount,
        unaccounted: unaccountedCount,
        resolvedPercentage: demographics.totalRegistered > 0
          ? Math.round(((safeCount + requestStats.safelyRescued) / (demographics.totalRegistered || 1)) * 100)
          : 0,
      },
      requests: requestStats,
      shelters: {
        totalShelters: shelters.length,
        totalCapacity: totalShelterCapacity,
        totalExpectedArrivals,
        remainingBuffer: totalShelterCapacity - totalExpectedArrivals,
        occupancyRate: totalShelterCapacity > 0 ? Math.round((totalExpectedArrivals / totalShelterCapacity) * 100) : 0,
        criticalSheltersCount,
        list: shelterData,
      },
      demographics,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate operational analytics summary.' });
  }
}
