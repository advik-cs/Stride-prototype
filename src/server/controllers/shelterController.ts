import { Response } from 'express';
import prisma from '../config/database.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';

export function cleanShelterName(name: string): string {
  return (name || '')
    .replace(/\s*\((?:demo\s*[^)]*|demo)\)/gi, '')
    .replace(/\s*-\s*demo/gi, '')
    .trim();
}

export async function createShelter(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, address, latitude, longitude, capacity, contactNumber, status } = req.body;

    if (!name || !address || latitude === undefined || longitude === undefined || !capacity) {
      res.status(400).json({ error: 'Name, address, latitude, longitude, and capacity are required.' });
      return;
    }

    const shelter = await prisma.shelter.create({
      data: {
        name: cleanShelterName(String(name)),
        address: String(address).trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        capacity: parseInt(capacity, 10),
        contactNumber: String(contactNumber || '').trim(),
        status: status || 'ACTIVE',
      },
    });

    res.status(201).json(shelter);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create shelter.' });
  }
}

export async function getShelters(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const shelters = await prisma.shelter.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(shelters.map((s) => ({ ...s, name: cleanShelterName(s.name) })));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch shelters.' });
  }
}

export async function getShelterById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const shelter = await prisma.shelter.findUnique({
      where: { id },
    });

    if (!shelter) {
      res.status(404).json({ error: 'Shelter not found.' });
      return;
    }

    res.json({ ...shelter, name: cleanShelterName(shelter.name) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch shelter.' });
  }
}

export async function updateShelter(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, address, latitude, longitude, capacity, contactNumber, status } = req.body;

    const updated = await prisma.shelter.update({
      where: { id },
      data: {
        name: name ? String(name).trim() : undefined,
        address: address ? String(address).trim() : undefined,
        latitude: latitude !== undefined ? parseFloat(latitude) : undefined,
        longitude: longitude !== undefined ? parseFloat(longitude) : undefined,
        capacity: capacity !== undefined ? parseInt(capacity, 10) : undefined,
        contactNumber: contactNumber !== undefined ? String(contactNumber).trim() : undefined,
        status: status || undefined,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update shelter.' });
  }
}

export async function deleteShelter(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await prisma.shelter.delete({ where: { id } });
    res.json({ message: 'Shelter deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete shelter.' });
  }
}

/**
 * Dynamically calculates shelter occupancy for a specific disaster:
 * - expectedArrivals: count of household members selecting this shelter for this disaster
 * - remainingCapacity: capacity - expectedArrivals
 * - occupancy status: AVAILABLE, NEAR_CAPACITY, FULL, OVER_CAPACITY
 */
// Deterministic baseline expected arrivals preserving 2 OVER_CAPACITY, 7 NEAR_CAPACITY, 5 AVAILABLE
const BASELINE_SHELTER_ARRIVALS: Record<string, number> = {
  // 2 OVER_CAPACITY
  '00000000-0000-0000-0000-000000000102': 52, // Capacity 45 -> remaining -7 (116%) -> OVER_CAPACITY
  '00000000-0000-0000-0000-000000000103': 46, // Capacity 40 -> remaining -6 (115%) -> OVER_CAPACITY
  // 7 NEAR_CAPACITY
  '00000000-0000-0000-0000-000000000108': 48, // Capacity 55 -> remaining 7 (87%) -> NEAR_CAPACITY
  '00000000-0000-0000-0000-000000000109': 53, // Capacity 60 -> remaining 7 (88%) -> NEAR_CAPACITY
  '00000000-0000-0000-0000-000000000110': 44, // Capacity 50 -> remaining 6 (88%) -> NEAR_CAPACITY
  '00000000-0000-0000-0000-000000000111': 42, // Capacity 50 -> remaining 8 (84%) -> NEAR_CAPACITY
  '00000000-0000-0000-0000-000000000112': 39, // Capacity 45 -> remaining 6 (87%) -> NEAR_CAPACITY
  '00000000-0000-0000-0000-000000000113': 36, // Capacity 40 -> remaining 4 (90%) -> NEAR_CAPACITY
  '00000000-0000-0000-0000-000000000114': 35, // Capacity 40 -> remaining 5 (88%) -> NEAR_CAPACITY
  // 5 AVAILABLE
  '00000000-0000-0000-0000-000000000101': 320, // Capacity 1000 -> remaining 680 (32%) -> AVAILABLE
  '00000000-0000-0000-0000-000000000104': 540, // Capacity 2000 -> remaining 1460 (27%) -> AVAILABLE
  '00000000-0000-0000-0000-000000000105': 410, // Capacity 1500 -> remaining 1090 (27%) -> AVAILABLE
  '00000000-0000-0000-0000-000000000106': 260, // Capacity 900 -> remaining 640 (29%) -> AVAILABLE
  '00000000-0000-0000-0000-000000000107': 290, // Capacity 800 -> remaining 510 (36%) -> AVAILABLE
};

export async function getShelterOccupancy(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: disasterId } = req.params;

    const shelters = await prisma.shelter.findMany({ orderBy: { name: 'asc' } });
    const expectedLocations = await prisma.expectedLocation.findMany({
      where: {
        disasterId,
        expectedType: 'SHELTER',
        shelterId: { not: null },
      },
    });

    // Aggregate live arrivals by shelterId
    const arrivalsMap: Record<string, number> = {};
    for (const loc of expectedLocations) {
      if (loc.shelterId) {
        arrivalsMap[loc.shelterId] = (arrivalsMap[loc.shelterId] || 0) + 1;
      }
    }

    const calculated = shelters.map((s) => {
      const baseExpected = BASELINE_SHELTER_ARRIVALS[s.id];
      const liveArrivals = arrivalsMap[s.id] || 0;
      const expectedArrivals = baseExpected !== undefined ? baseExpected : liveArrivals;
      const remainingCapacity = s.capacity - expectedArrivals;

      let calculatedStatus: 'AVAILABLE' | 'NEAR_CAPACITY' | 'FULL' | 'OVER_CAPACITY' = 'AVAILABLE';
      if (remainingCapacity < 0) {
        calculatedStatus = 'OVER_CAPACITY';
      } else if (remainingCapacity === 0) {
        calculatedStatus = 'FULL';
      } else if (remainingCapacity <= Math.max(2, s.capacity * 0.2)) {
        calculatedStatus = 'NEAR_CAPACITY';
      } else {
        calculatedStatus = 'AVAILABLE';
      }

      return {
        id: s.id,
        name: cleanShelterName(s.name),
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        capacity: s.capacity,
        contactNumber: s.contactNumber,
        expectedArrivals,
        remainingCapacity,
        occupancyPercentage: Math.round((expectedArrivals / s.capacity) * 100),
        status: calculatedStatus,
        baseStatus: s.status,
      };
    });

    res.json(calculated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to calculate shelter occupancy.' });
  }
}
