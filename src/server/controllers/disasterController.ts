import { Response } from 'express';
import prisma from '../config/database.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { isLocationInAffectedZone } from '../utils/geo.ts';

export async function createDisaster(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { type, title, description, alertLevel, predictedStartTime, predictedEndTime, status } =
      req.body;

    if (!type || !title || !alertLevel || !predictedStartTime || !predictedEndTime) {
      res.status(400).json({ error: 'Missing required disaster fields.' });
      return;
    }

    const disaster = await prisma.disasterEvent.create({
      data: {
        type,
        title: String(title).trim(),
        description: String(description || '').trim(),
        alertLevel,
        predictedStartTime: new Date(predictedStartTime),
        predictedEndTime: new Date(predictedEndTime),
        status: status || 'PREDICTED',
        createdById: req.user?.userId,
      },
    });

    res.status(201).json(disaster);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create disaster event.' });
  }
}

const SEVERITY_ORDER: Record<string, number> = {
  RED: 1,
  ORANGE: 2,
  YELLOW: 3,
  GREEN: 4,
};

export function sortDisasterThreats<T extends { alertLevel?: string | null; predictedStartTime?: Date | string | null; createdAt?: Date | string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const sevA = SEVERITY_ORDER[String(a.alertLevel).toUpperCase()] ?? 99;
    const sevB = SEVERITY_ORDER[String(b.alertLevel).toUpperCase()] ?? 99;
    if (sevA !== sevB) {
      return sevA - sevB; // RED (1) before ORANGE (2)
    }
    const timeA = new Date(a.predictedStartTime || a.createdAt || 0).getTime();
    const timeB = new Date(b.predictedStartTime || b.createdAt || 0).getTime();
    return timeA - timeB; // Earliest onset first
  });
}

export async function getDisasters(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const disasters = await prisma.disasterEvent.findMany({
      include: {
        affectedZones: true,
      },
    });

    const sortedDisasters = sortDisasterThreats(disasters);
    res.json(sortedDisasters);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch disasters.' });
  }
}

export async function getDisasterById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const disaster = await prisma.disasterEvent.findUnique({
      where: { id },
      include: {
        affectedZones: true,
      },
    });

    if (!disaster) {
      res.status(404).json({ error: 'Disaster event not found.' });
      return;
    }

    res.json(disaster);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch disaster.' });
  }
}

export async function updateDisaster(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { type, title, description, alertLevel, predictedStartTime, predictedEndTime, status } =
      req.body;

    const updated = await prisma.disasterEvent.update({
      where: { id },
      data: {
        type: type || undefined,
        title: title ? String(title).trim() : undefined,
        description: description !== undefined ? String(description).trim() : undefined,
        alertLevel: alertLevel || undefined,
        predictedStartTime: predictedStartTime ? new Date(predictedStartTime) : undefined,
        predictedEndTime: predictedEndTime ? new Date(predictedEndTime) : undefined,
        status: status || undefined,
      },
      include: {
        affectedZones: true,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update disaster.' });
  }
}

export async function deleteDisaster(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await prisma.disasterEvent.delete({ where: { id } });
    res.json({ message: 'Disaster event deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete disaster.' });
  }
}

// ==================== AFFECTED ZONES ====================

export async function addAffectedZone(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const { name, riskLevel, polygonGeoJson, radiusKm } = req.body;

    if (!name || !riskLevel || !polygonGeoJson) {
      res.status(400).json({ error: 'Name, riskLevel, and polygonGeoJson are required.' });
      return;
    }

    const zone = await prisma.affectedZone.create({
      data: {
        disasterId,
        name: String(name).trim(),
        riskLevel,
        polygonGeoJson: typeof polygonGeoJson === 'string' ? polygonGeoJson : JSON.stringify(polygonGeoJson),
        radiusKm: radiusKm ? parseFloat(radiusKm) : 5.0,
      },
    });

    res.status(201).json(zone);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to add affected zone.' });
  }
}

export async function getAffectedZones(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    let zones = await prisma.affectedZone.findMany({
      where: { disasterId },
    });
    if (zones.length === 0) {
      zones = await prisma.affectedZone.findMany({
        where: {
          disaster: { status: { in: ['ACTIVE', 'PREDICTED'] } },
        },
      });
    }
    res.json(zones);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch affected zones.' });
  }
}

export async function updateAffectedZone(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { zoneId } = req.params;
    const { name, riskLevel, polygonGeoJson, radiusKm } = req.body;

    const updated = await prisma.affectedZone.update({
      where: { id: zoneId },
      data: {
        name: name ? String(name).trim() : undefined,
        riskLevel: riskLevel || undefined,
        polygonGeoJson: polygonGeoJson
          ? typeof polygonGeoJson === 'string'
            ? polygonGeoJson
            : JSON.stringify(polygonGeoJson)
          : undefined,
        radiusKm: radiusKm !== undefined ? parseFloat(radiusKm) : undefined,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update affected zone.' });
  }
}

export async function deleteAffectedZone(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { zoneId } = req.params;
    await prisma.affectedZone.delete({ where: { id: zoneId } });
    res.json({ message: 'Affected zone deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete affected zone.' });
  }
}

/**
 * Dynamically computes which registered households fall inside the disaster's affected zones
 */
export async function getAffectedHouseholds(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    let zones = await prisma.affectedZone.findMany({ where: { disasterId } });
    if (zones.length === 0) {
      zones = await prisma.affectedZone.findMany({
        where: {
          disaster: { status: { in: ['ACTIVE', 'PREDICTED'] } },
        },
      });
    }
    const households = await prisma.household.findMany({
      where: {
        NOT: {
          name: { contains: "'s Residence" },
        },
      },
      include: {
        members: {
          include: {
            expectedLocations: {
              where: { disasterId },
            },
          },
        },
      },
    });

    const affectedList = households.map((h) => {
      let isAffected = false;
      let matchedZone: any = null;

      for (const zone of zones) {
        if (isLocationInAffectedZone(h.latitude, h.longitude, zone.polygonGeoJson, zone.radiusKm)) {
          isAffected = true;
          matchedZone = zone;
          break;
        }
      }

      return {
        ...h,
        isAffected,
        matchedZone: matchedZone ? { id: matchedZone.id, name: matchedZone.name, riskLevel: matchedZone.riskLevel } : null,
      };
    });

    res.json(affectedList);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to calculate affected households.' });
  }
}

// ==================== EXPECTED LOCATIONS ====================

export async function setExpectedLocations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const locations = req.body.locations || req.body.plans; // Array of { memberId, expectedType, shelterId, otherCity }

    if (!Array.isArray(locations) || locations.length === 0) {
      res.status(400).json({ error: 'locations array is required.' });
      return;
    }

    const results = [];
    for (const loc of locations) {
      const memberId = loc.memberId || loc.householdMemberId;
      const expectedType = loc.expectedType || loc.expectedLocationType || 'HOME';
      const shelterId = loc.shelterId;
      const otherCity = loc.otherCity;

      if (!memberId) {
        res.status(400).json({ error: 'memberId is required for each location item.' });
        return;
      }

      // Validate according to strict prompt guidelines:
      // HOME: No shelter, No other city
      // SHELTER: Shelter required
      // OTHER_CITY: City required
      // UNKNOWN: No shelter, No city
      if (expectedType === 'SHELTER' && !shelterId) {
        res.status(400).json({ error: `Shelter selection required for member ${memberId} when selecting SHELTER.` });
        return;
      }
      if (expectedType === 'OTHER_CITY' && !otherCity) {
        res.status(400).json({ error: `City name required for member ${memberId} when selecting OTHER_CITY.` });
        return;
      }

      const cleanShelterId = expectedType === 'SHELTER' ? shelterId : null;
      const cleanOtherCity = expectedType === 'OTHER_CITY' ? String(otherCity).trim() : null;

      const record = await prisma.expectedLocation.upsert({
        where: {
          disasterId_householdMemberId: {
            disasterId,
            householdMemberId: memberId,
          },
        },
        update: {
          expectedType,
          shelterId: cleanShelterId,
          otherCity: cleanOtherCity,
          updatedTime: new Date(),
        },
        create: {
          disasterId,
          householdMemberId: memberId,
          expectedType,
          shelterId: cleanShelterId,
          otherCity: cleanOtherCity,
        },
      });

      results.push(record);
    }

    // If user is a citizen, mark household onboarding as completed
    if (req.user?.userId) {
      try {
        await prisma.household.updateMany({
          where: { userId: req.user.userId },
          data: { onboardingCompleted: true },
        });
      } catch (markErr) {
        console.warn('Failed to auto-mark household onboardingCompleted in setExpectedLocations:', markErr);
      }
    }

    res.json({ message: 'Expected locations updated successfully', results });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update expected locations.' });
  }
}

export async function getExpectedLocations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const records = await prisma.expectedLocation.findMany({
      where: { disasterId },
      include: {
        householdMember: {
          include: {
            household: true,
          },
        },
        shelter: true,
      },
    });

    res.json(records);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch expected locations.' });
  }
}

export async function updateSingleExpectedLocation(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id: disasterId, memberId } = req.params;
    const { expectedType, shelterId, otherCity } = req.body;

    if (expectedType === 'SHELTER' && !shelterId) {
      res.status(400).json({ error: 'Shelter is required when selecting SHELTER.' });
      return;
    }
    if (expectedType === 'OTHER_CITY' && !otherCity) {
      res.status(400).json({ error: 'City is required when selecting OTHER_CITY.' });
      return;
    }

    const cleanShelterId = expectedType === 'SHELTER' ? shelterId : null;
    const cleanOtherCity = expectedType === 'OTHER_CITY' ? String(otherCity).trim() : null;

    const record = await prisma.expectedLocation.upsert({
      where: {
        disasterId_householdMemberId: {
          disasterId,
          householdMemberId: memberId,
        },
      },
      update: {
        expectedType,
        shelterId: cleanShelterId,
        otherCity: cleanOtherCity,
        updatedTime: new Date(),
      },
      create: {
        disasterId,
        householdMemberId: memberId,
        expectedType,
        shelterId: cleanShelterId,
        otherCity: cleanOtherCity,
      },
    });

    res.json(record);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update member expected location.' });
  }
}

// ==================== RESCUER BUILDING INTELLIGENCE ====================

export async function getBuildingIntelligence(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    let zones = await prisma.affectedZone.findMany({ where: { disasterId } });
    if (zones.length === 0) {
      zones = await prisma.affectedZone.findMany({
        where: {
          disaster: { status: { in: ['ACTIVE', 'PREDICTED'] } },
        },
      });
    }

    const households = await prisma.household.findMany({
      where: {
        NOT: {
          name: { contains: "'s Residence" },
        },
      },
      include: {
        members: {
          include: {
            expectedLocations: true,
            emergencyStatuses: true,
            emergencyRequests: {
              where: { disasterId },
              include: { conditions: true, rescueAssignments: true },
            },
          },
        },
      },
    });

    // Aggregate by unique building name
    const buildingMap: Record<string, any> = {};

    for (const h of households) {
      const bName = h.name.split(',')[0].trim(); // Extract e.g. "Building A-182"
      if (!buildingMap[bName]) {
        let isAffected = false;
        let riskLevel = 'LOW';
        let matchedZoneName = 'Safe Zone';

        const matchedZones: typeof zones = [];
        for (const zone of zones) {
          if (isLocationInAffectedZone(h.latitude, h.longitude, zone.polygonGeoJson, zone.radiusKm)) {
            matchedZones.push(zone);
          }
        }

        if (matchedZones.length > 0) {
          isAffected = true;
          const hasRed = matchedZones.find(
            (z) => z.riskLevel === 'RED' || z.riskLevel === 'HIGH' || z.riskLevel === 'EXTREME'
          );
          const hasOrange = matchedZones.find(
            (z) => z.riskLevel === 'ORANGE' || z.riskLevel === 'MEDIUM'
          );
          if (hasRed) {
            riskLevel = 'RED';
            matchedZoneName = hasRed.name;
          } else if (hasOrange) {
            riskLevel = 'ORANGE';
            matchedZoneName = hasOrange.name;
          } else {
            riskLevel = matchedZones[0].riskLevel;
            matchedZoneName = matchedZones[0].name;
          }
        } else {
          isAffected = false;
          riskLevel = 'SAFE';
          matchedZoneName = 'Safe Zone';
        }

        buildingMap[bName] = {
          buildingName: bName,
          address: h.address,
          latitude: h.latitude,
          longitude: h.longitude,
          isAffected,
          riskLevel,
          zoneName: matchedZoneName,
          registeredPopulation: 0,
          adults: 0,
          children: 0,
          elderly: 0,
          expectedHome: 0,
          expectedShelter: 0,
          expectedElsewhere: 0,
          unknown: 0,
          expectedOccupancy: 0, // Number selecting HOME
          // During disaster live data:
          confirmedSafe: 0,
          inDistress: 0,
          unaccounted: 0,
          activeRequests: [],
        };
      }

      const b = buildingMap[bName];
      for (const m of h.members) {
        b.registeredPopulation++;
        if (m.category === 'ADULT') b.adults++;
        else if (m.category === 'CHILD') b.children++;
        else if (m.category === 'ELDERLY') b.elderly++;

        // BEFORE calculations
        const exp = m.expectedLocations.find((e) => e.disasterId === disasterId) || m.expectedLocations[0];
        if (!exp || exp.expectedType === 'UNKNOWN') {
          b.unknown++;
        } else if (exp.expectedType === 'HOME') {
          b.expectedHome++;
          b.expectedOccupancy++; // Only HOME counts towards expected building occupancy
        } else if (exp.expectedType === 'SHELTER') {
          b.expectedShelter++;
        } else if (exp.expectedType === 'OTHER_CITY') {
          b.expectedElsewhere++;
        }

        // DURING calculations
        const em = m.emergencyStatuses.find((s) => s.disasterId === disasterId) || m.emergencyStatuses[0];
        if (!em || em.status === 'UNACCOUNTED') {
          b.unaccounted++;
        } else if (em.status === 'SAFE') {
          b.confirmedSafe++;
        } else if (em.status === 'IN_DISTRESS') {
          b.inDistress++;
        }

        if (m.emergencyRequests && m.emergencyRequests.length > 0) {
          b.activeRequests.push(...m.emergencyRequests);
        }
      }
    }

    const result = Object.values(buildingMap);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to compile building intelligence.' });
  }
}

// ==================== ZONE SUMMARY ====================

export async function getZoneSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    let zones = await prisma.affectedZone.findMany({ where: { disasterId } });
    if (zones.length === 0) {
      zones = await prisma.affectedZone.findMany({
        where: {
          disaster: { status: { in: ['ACTIVE', 'PREDICTED'] } },
        },
      });
    }

    const households = await prisma.household.findMany({
      where: {
        NOT: {
          name: { contains: "'s Residence" },
        },
      },
      include: {
        members: {
          include: {
            expectedLocations: true,
          },
        },
      },
    });

    let totalRegistered = 0;
    let totalHome = 0;
    let totalShelter = 0;
    let totalElsewhere = 0;
    let totalUnknown = 0;

    const zoneBreakdown = zones.map((z) => ({
      id: z.id,
      name: z.name,
      riskLevel: z.riskLevel,
      registered: 0,
      expectedHome: 0,
      expectedShelter: 0,
      expectedElsewhere: 0,
      unknown: 0,
    }));

    for (const h of households) {
      let matchedZoneIdx = -1;
      for (let i = 0; i < zones.length; i++) {
        if (isLocationInAffectedZone(h.latitude, h.longitude, zones[i].polygonGeoJson, zones[i].radiusKm)) {
          matchedZoneIdx = i;
          break;
        }
      }

      for (const m of h.members) {
        totalRegistered++;
        const exp = m.expectedLocations[0];

        let type = 'UNKNOWN';
        if (exp) {
          type = exp.expectedType;
        }

        if (type === 'HOME') totalHome++;
        else if (type === 'SHELTER') totalShelter++;
        else if (type === 'OTHER_CITY') totalElsewhere++;
        else totalUnknown++;

        if (matchedZoneIdx >= 0) {
          zoneBreakdown[matchedZoneIdx].registered++;
          if (type === 'HOME') zoneBreakdown[matchedZoneIdx].expectedHome++;
          else if (type === 'SHELTER') zoneBreakdown[matchedZoneIdx].expectedShelter++;
          else if (type === 'OTHER_CITY') zoneBreakdown[matchedZoneIdx].expectedElsewhere++;
          else zoneBreakdown[matchedZoneIdx].unknown++;
        }
      }
    }

    res.json({
      overall: {
        registeredPopulation: totalRegistered,
        expectedAtHome: totalHome,
        expectedAtShelters: totalShelter,
        expectedElsewhere: totalElsewhere,
        unknown: totalUnknown,
      },
      zones: zoneBreakdown,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to compute zone summary.' });
  }
}

// ==================== RECONFIRMATION ====================

export async function submitReconfirmation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const choice =
      req.body.choice ||
      req.body.action ||
      (req.body.reconfirmations && req.body.reconfirmations[0]?.action);
    const userId = req.user!.userId;

    if (!choice || !['SAME_PLAN', 'CHANGE_LOCATION', 'NOT_SURE'].includes(choice)) {
      res.status(400).json({ error: 'Valid choice required (SAME_PLAN, CHANGE_LOCATION, NOT_SURE).' });
      return;
    }

    const household = await prisma.household.findFirst({
      where: { userId },
      include: { members: true },
    });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    const memberIds = household.members.map((m) => m.id);

    // Extract optional location change targets
    const expectedType =
      req.body.expectedLocationType ||
      req.body.reconfirmations?.[0]?.expectedLocationType ||
      'HOME';
    const shelterId =
      req.body.shelterId !== undefined
        ? req.body.shelterId
        : req.body.reconfirmations?.[0]?.shelterId || null;
    const otherCity =
      req.body.otherCity !== undefined
        ? req.body.otherCity
        : req.body.reconfirmations?.[0]?.otherCity || null;

    // Update expected locations reconfirmedStatus
    for (const memberId of memberIds) {
      const updateData: any = {
        reconfirmedStatus: choice,
        reconfirmedAt: new Date(),
      };
      if (choice === 'CHANGE_LOCATION') {
        updateData.expectedType = expectedType;
        updateData.shelterId = shelterId;
        updateData.otherCity = otherCity;
      }

      await prisma.expectedLocation.upsert({
        where: {
          disasterId_householdMemberId: {
            disasterId,
            householdMemberId: memberId,
          },
        },
        update: updateData,
        create: {
          disasterId,
          householdMemberId: memberId,
          expectedType: choice === 'CHANGE_LOCATION' ? expectedType : 'HOME',
          shelterId: choice === 'CHANGE_LOCATION' ? shelterId : null,
          otherCity: choice === 'CHANGE_LOCATION' ? otherCity : null,
          reconfirmedStatus: choice,
          reconfirmedAt: new Date(),
        },
      });
    }

    res.json({
      message: 'Reconfirmation recorded successfully.',
      reconfirmedStatus: choice,
      reconfirmedAt: new Date(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to submit reconfirmation.' });
  }
}

export async function getReconfirmationStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;
    const userId = req.user!.userId;

    const disaster = await prisma.disasterEvent.findUnique({ where: { id: disasterId } });
    if (!disaster) {
      res.status(404).json({ error: 'Disaster event not found.' });
      return;
    }

    // Backend determines if reconfirmation is required:
    // Approximately 30 hours before a predicted disaster (or whenever status is PREDICTED within 48h)
    const now = new Date().getTime();
    const startTime = new Date(disaster.predictedStartTime).getTime();
    const hoursUntilDisaster = (startTime - now) / (1000 * 60 * 60);

    const isReconfirmationWindow = hoursUntilDisaster <= 36 && hoursUntilDisaster > 0;

    const household = await prisma.household.findFirst({
      where: { userId },
      include: {
        members: {
          include: {
            expectedLocations: {
              where: { disasterId },
            },
          },
        },
      },
    });

    let currentStatus: string | null = null;
    let reconfirmedAt: Date | null = null;

    if (household && household.members.length > 0) {
      const firstExp = household.members[0].expectedLocations[0];
      if (firstExp && firstExp.reconfirmedStatus) {
        currentStatus = firstExp.reconfirmedStatus;
        reconfirmedAt = firstExp.reconfirmedAt;
      }
    }

    res.json({
      disasterId,
      disasterTitle: disaster.title,
      predictedStartTime: disaster.predictedStartTime,
      hoursUntilDisaster: Math.round(hoursUntilDisaster * 10) / 10,
      isReconfirmationRequired: isReconfirmationWindow || !currentStatus,
      currentStatus,
      reconfirmedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get reconfirmation status.' });
  }
}
