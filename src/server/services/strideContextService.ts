import prisma from '../config/database.ts';
import { calculateHaversineDistance } from '../utils/geo.ts';

export interface StrideContextData {
  activeDisaster: {
    id: string;
    title: string;
    type: string;
    alertLevel: string;
    description: string;
    status: string;
  } | null;
  citizenHousehold: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    members: Array<{ id: string; name: string; age: number; category: string }>;
  } | null;
  activeSos: {
    id: string;
    priorityScore: number;
    rescueStatus: string;
    description: string;
    address: string;
    conditions: string[];
    createdAt: string;
  } | null;
  nearestShelters: Array<{
    id: string;
    name: string;
    address: string;
    capacity: number;
    status: string;
    distanceKm: number;
  }>;
  nearestFacilities: Array<{
    id: string;
    name: string;
    type: string;
    address: string;
    contactNumber?: string | null;
    distanceKm: number;
  }>;
}

/**
 * Gathers authentic STRIDE contextual information for the conversational AI prompt.
 * Strictly avoids fabricating data; only queries real database records.
 */
export async function getStrideContext(
  userId: string,
  userLocation?: { latitude: number; longitude: number }
): Promise<StrideContextData> {
  // 1. Fetch active disaster event
  const activeDisaster =
    (await prisma.disasterEvent.findFirst({
      where: { status: { in: ['PREDICTED', 'ACTIVE', 'WARNING'] } },
      orderBy: { predictedStartTime: 'asc' },
    })) ||
    (await prisma.disasterEvent.findFirst({
      orderBy: { createdAt: 'desc' },
    }));

  // 2. Fetch citizen's household & members
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      households: {
        include: { members: true },
      },
    },
  });

  const household = user?.households?.[0] || null;

  // Reference coordinates for distance calculation (GPS priority, fallback to household, then Bengaluru center)
  const refLat = userLocation?.latitude || household?.latitude || 12.9716;
  const refLng = userLocation?.longitude || household?.longitude || 77.5946;

  // 3. Fetch active SOS for this citizen if exists
  let activeSos = null;
  if (household) {
    const memberIds = household.members.map((m) => m.id);
    const existingReq = await prisma.emergencyRequest.findFirst({
      where: {
        householdMemberId: { in: memberIds },
        rescueStatus: { not: 'CANCELLED' },
      },
      include: {
        conditions: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingReq) {
      activeSos = {
        id: existingReq.id,
        priorityScore: existingReq.priorityScore,
        rescueStatus: existingReq.rescueStatus,
        description: existingReq.description,
        address: existingReq.address,
        conditions: existingReq.conditions.map((c) => c.conditionType),
        createdAt: existingReq.createdAt.toISOString(),
      };
    }
  }

  // 4. Fetch nearest shelters
  const allShelters = await prisma.shelter.findMany();
  const sortedShelters = allShelters
    .map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      capacity: s.capacity,
      status: s.status,
      distanceKm: parseFloat(calculateHaversineDistance(refLat, refLng, s.latitude, s.longitude).toFixed(1)),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 4);

  // 5. Fetch nearest emergency facilities
  const allFacilities = await prisma.emergencyFacility.findMany();
  const sortedFacilities = allFacilities
    .map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      address: f.address,
      contactNumber: f.contactNumber,
      distanceKm: parseFloat(calculateHaversineDistance(refLat, refLng, f.latitude, f.longitude).toFixed(1)),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 4);

  return {
    activeDisaster: activeDisaster
      ? {
          id: activeDisaster.id,
          title: activeDisaster.title,
          type: activeDisaster.type,
          alertLevel: activeDisaster.alertLevel,
          description: activeDisaster.description,
          status: activeDisaster.status,
        }
      : null,
    citizenHousehold: household
      ? {
          id: household.id,
          name: household.name,
          address: household.address,
          latitude: household.latitude,
          longitude: household.longitude,
          members: household.members.map((m) => ({
            id: m.id,
            name: m.name,
            age: m.age,
            category: m.category,
          })),
        }
      : null,
    activeSos,
    nearestShelters: sortedShelters,
    nearestFacilities: sortedFacilities,
  };
}
