import { Response } from 'express';
import prisma from '../config/database.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { MemberCategory } from '../types/index.ts';

/**
 * Categorizes age automatically:
 * CHILD: < 18
 * ADULT: 18 - 64
 * ELDERLY: >= 65
 */
export function determineCategory(age: number): MemberCategory {
  if (age < 18) return 'CHILD';
  if (age >= 65) return 'ELDERLY';
  return 'ADULT';
}

export async function createHousehold(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { name, address, city, state, latitude, longitude } = req.body;

    if (!name || !address || !city || latitude === undefined || longitude === undefined) {
      res.status(400).json({ error: 'Name, address, city, latitude, and longitude are required.' });
      return;
    }

    const household = await prisma.household.create({
      data: {
        name: String(name).trim(),
        address: String(address).trim(),
        city: String(city).trim(),
        state: String(state || 'State').trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        userId,
      },
      include: {
        members: true,
      },
    });

    res.status(201).json(household);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create household.' });
  }
}

export async function getHousehold(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const household = await prisma.household.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            expectedLocations: true,
            emergencyStatuses: true,
          },
        },
      },
    });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    if (req.user!.role === 'CITIZEN' && household.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied. You can only view your own household.' });
      return;
    }

    const adults = household.members.filter((m) => m.category === 'ADULT').length;
    const children = household.members.filter((m) => m.category === 'CHILD').length;
    const elderly = household.members.filter((m) => m.category === 'ELDERLY').length;

    res.json({
      ...household,
      stats: {
        totalMembers: household.members.length,
        adults,
        children,
        elderly,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch household.' });
  }
}

export async function getMyHousehold(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    let household = await prisma.household.findFirst({
      where: { userId },
      include: {
        members: {
          include: {
            expectedLocations: true,
            emergencyStatuses: true,
          },
        },
      },
    });

    // If citizen doesn't have a household yet, auto-create a default registered home
    if (!household) {
      household = await prisma.household.create({
        data: {
          userId,
          name: 'Building A-182, Flat 401',
          address: '42 Central Riverfront Avenue, Ward 4',
          city: 'Coastal Metro',
          state: 'Southern Region',
          latitude: 13.0827,
          longitude: 80.2707,
          members: {
            create: [
              { name: req.user!.name, age: 34, relationship: 'Self', category: 'ADULT' },
              { name: 'Priya Sharma', age: 32, relationship: 'Spouse', category: 'ADULT' },
              { name: 'Aarav Sharma', age: 7, relationship: 'Child', category: 'CHILD' },
              { name: 'Kavita Sharma', age: 68, relationship: 'Parent', category: 'ELDERLY' },
            ],
          },
        },
        include: {
          members: {
            include: {
              expectedLocations: true,
              emergencyStatuses: true,
            },
          },
        },
      });
    }

    const adults = household.members.filter((m) => m.category === 'ADULT').length;
    const children = household.members.filter((m) => m.category === 'CHILD').length;
    const elderly = household.members.filter((m) => m.category === 'ELDERLY').length;

    res.json({
      ...household,
      stats: {
        totalMembers: household.members.length,
        adults,
        children,
        elderly,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch user household.' });
  }
}

export async function updateHousehold(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await prisma.household.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    if (req.user!.role === 'CITIZEN' && existing.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const { name, address, city, state, latitude, longitude } = req.body;
    const updated = await prisma.household.update({
      where: { id },
      data: {
        name: name ? String(name).trim() : undefined,
        address: address ? String(address).trim() : undefined,
        city: city ? String(city).trim() : undefined,
        state: state ? String(state).trim() : undefined,
        latitude: latitude !== undefined ? parseFloat(latitude) : undefined,
        longitude: longitude !== undefined ? parseFloat(longitude) : undefined,
      },
      include: {
        members: true,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update household.' });
  }
}

export async function getMembers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const household = await prisma.household.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    if (req.user!.role === 'CITIZEN' && household.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    res.json(household.members);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch members.' });
  }
}

export async function addMember(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const household = await prisma.household.findUnique({ where: { id } });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    if (req.user!.role === 'CITIZEN' && household.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const { name, age, relationship, category } = req.body;
    if (!name || age === undefined || !relationship) {
      res.status(400).json({ error: 'Name, age, and relationship are required.' });
      return;
    }

    const memberAge = parseInt(age, 10);
    const memberCategory = category || determineCategory(memberAge);

    const newMember = await prisma.householdMember.create({
      data: {
        householdId: id,
        name: String(name).trim(),
        age: memberAge,
        relationship: String(relationship).trim(),
        category: memberCategory,
      },
    });

    res.status(201).json(newMember);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to add member.' });
  }
}

export async function updateMember(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id, memberId } = req.params;
    const household = await prisma.household.findUnique({ where: { id } });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    if (req.user!.role === 'CITIZEN' && household.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const { name, age, relationship, category } = req.body;
    const memberAge = age !== undefined ? parseInt(age, 10) : undefined;
    const memberCategory =
      category || (memberAge !== undefined ? determineCategory(memberAge) : undefined);

    const updated = await prisma.householdMember.update({
      where: { id: memberId },
      data: {
        name: name ? String(name).trim() : undefined,
        age: memberAge,
        relationship: relationship ? String(relationship).trim() : undefined,
        category: memberCategory,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update member.' });
  }
}

export async function deleteMember(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id, memberId } = req.params;
    const household = await prisma.household.findUnique({ where: { id } });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    if (req.user!.role === 'CITIZEN' && household.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    await prisma.householdMember.delete({
      where: { id: memberId },
    });

    res.json({ message: 'Household member removed successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete member.' });
  }
}

export async function getHouseholdDisasterOccupancy(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { disasterId } = req.params;
    const userId = req.user!.userId;

    const household = await prisma.household.findFirst({
      where: { userId },
      include: {
        members: {
          include: {
            expectedLocations: {
              where: { disasterId },
              include: { shelter: true },
            },
            emergencyStatuses: {
              where: { disasterId },
            },
          },
        },
      },
    });

    if (!household) {
      res.status(404).json({ error: 'Household not found.' });
      return;
    }

    // Dynamic calculations for the household in this disaster
    let homeCount = 0;
    let shelterCount = 0;
    let otherCityCount = 0;
    let unknownCount = 0;

    let safeCount = 0;
    let distressCount = 0;
    let unaccountedCount = 0;

    for (const member of household.members) {
      const exp = member.expectedLocations[0];
      if (!exp || exp.expectedType === 'UNKNOWN') {
        unknownCount++;
      } else if (exp.expectedType === 'HOME') {
        homeCount++;
      } else if (exp.expectedType === 'SHELTER') {
        shelterCount++;
      } else if (exp.expectedType === 'OTHER_CITY') {
        otherCityCount++;
      }

      const st = member.emergencyStatuses[0];
      if (!st || st.status === 'UNACCOUNTED') {
        unaccountedCount++;
      } else if (st.status === 'SAFE') {
        safeCount++;
      } else if (st.status === 'IN_DISTRESS') {
        distressCount++;
      }
    }

    res.json({
      householdId: household.id,
      householdName: household.name,
      registeredMembers: household.members.length,
      before: {
        home: homeCount,
        shelter: shelterCount,
        otherCity: otherCityCount,
        unknown: unknownCount,
      },
      during: {
        safe: safeCount,
        inDistress: distressCount,
        unaccounted: unaccountedCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch household occupancy.' });
  }
}

/**
 * Check if the authenticated citizen has completed mandatory household onboarding.
 * A citizen has completed onboarding if:
 * 1. Their household exists in the database.
 * 2. It has at least 1 registered member.
 * 3. The household's onboardingCompleted field is explicitly true.
 */
export async function getHouseholdOnboardingStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== 'CITIZEN') {
      res.json({ completed: true });
      return;
    }

    const household = await prisma.household.findFirst({
      where: { userId: user.userId },
      include: {
        members: true,
      },
    });

    if (!household || household.members.length === 0 || !household.onboardingCompleted) {
      res.json({
        completed: false,
        householdId: household?.id || null,
        totalMembers: household?.members.length || 0,
        onboardingCompleted: Boolean(household?.onboardingCompleted),
      });
      return;
    }

    res.json({
      completed: true,
      householdId: household.id,
      totalMembers: household.members.length,
      onboardingCompleted: true,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to check onboarding status.' });
  }
}

/**
 * Explicitly verify and mark onboarding complete after save
 */
export async function completeHouseholdOnboarding(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== 'CITIZEN') {
      res.json({ success: true, completed: true });
      return;
    }

    const household = await prisma.household.findFirst({
      where: { userId: user.userId },
      include: {
        members: true,
      },
    });

    if (!household || household.members.length === 0) {
      res.status(400).json({ error: 'Household and members must be created before completing onboarding.' });
      return;
    }

    await prisma.household.update({
      where: { id: household.id },
      data: { onboardingCompleted: true },
    });

    res.json({ success: true, completed: true, householdId: household.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to complete household onboarding.' });
  }
}

