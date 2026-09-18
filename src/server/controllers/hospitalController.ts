import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import prisma from '../config/database.ts';
import { calculateHaversineDistance } from '../utils/geo.ts';
import {
  CANONICAL_BENGALURU_HOSPITALS,
  CanonicalHospital,
  DEMO_DATA_DISCLAIMER,
} from '../data/canonicalHospitals.ts';

const CITIZEN_DEFAULT_RADIUS_KM = 6.0; // 6 km radius for nearby local citizen scope

export async function getHospitals(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const role = req.user?.role || 'CITIZEN';
    const queryLat = req.query.lat ? parseFloat(String(req.query.lat)) : undefined;
    const queryLng = req.query.lng ? parseFloat(String(req.query.lng)) : undefined;
    const radiusParam = req.query.radiusKm ? parseFloat(String(req.query.radiusKm)) : undefined;

    let userLat = queryLat;
    let userLng = queryLng;

    // For citizens, attempt to resolve registered home coordinates if not provided in query
    if (role === 'CITIZEN' && (userLat === undefined || userLng === undefined) && req.user?.userId) {
      try {
        const household = await prisma.household.findFirst({
          where: { userId: req.user.userId },
        });
        if (household) {
          userLat = household.latitude;
          userLng = household.longitude;
        }
      } catch {
        // Non-blocking fallback
      }
    }

    // Default fallback to Koramangala / Central Bengaluru demo centroid if no user location
    const effectiveLat = userLat ?? 12.9345;
    const effectiveLng = userLng ?? 77.618;
    const hasUserLocation = userLat !== undefined && userLng !== undefined;

    // Attach distanceKm deterministically to canonical hospitals
    const hospitalsWithDistance = CANONICAL_BENGALURU_HOSPITALS.map((h) => {
      const distanceKm =
        Math.round(calculateHaversineDistance(effectiveLat, effectiveLng, h.latitude, h.longitude) * 100) /
        100;

      return {
        ...h,
        distanceKm,
        isWithinCitizenPerimeter: distanceKm <= (radiusParam || CITIZEN_DEFAULT_RADIUS_KM),
      };
    });

    // Role-based visibility scoping:
    // Citizen: Nearby / local hospital view (respects geographic perimeter, sorted nearest first)
    // Authority & Rescuer: Broader / jurisdiction-wide operational view (all hospitals in district)
    let scopedHospitals = hospitalsWithDistance;

    if (role === 'CITIZEN' && req.query.scope === 'local') {
      const radius = radiusParam || CITIZEN_DEFAULT_RADIUS_KM;
      scopedHospitals = hospitalsWithDistance.filter((h) => h.distanceKm <= radius);
      // If none within strict radius, return nearest 3 so citizen is never left without medical options
      if (scopedHospitals.length === 0) {
        scopedHospitals = [...hospitalsWithDistance].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 3);
      }
    }

    // Sort by distance if user location is known
    scopedHospitals.sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({
      role,
      userLocation: hasUserLocation ? { latitude: effectiveLat, longitude: effectiveLng } : null,
      scope: role === 'CITIZEN' ? 'CITIZEN_LOCAL' : 'JURISDICTION_WIDE',
      totalCount: scopedHospitals.length,
      disclaimer: DEMO_DATA_DISCLAIMER,
      hospitals: scopedHospitals,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch hospital directory.' });
  }
}

export async function getHospitalById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const cleanQuery = id.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hospital = CANONICAL_BENGALURU_HOSPITALS.find(
      (h) =>
        h.id === id ||
        h.id.toLowerCase() === id.toLowerCase() ||
        h.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanQuery)
    );

    if (!hospital) {
      res.status(404).json({ error: 'Hospital not found in canonical registry.' });
      return;
    }

    const queryLat = req.query.lat ? parseFloat(String(req.query.lat)) : undefined;
    const queryLng = req.query.lng ? parseFloat(String(req.query.lng)) : undefined;

    let distanceKm: number | undefined = undefined;
    if (queryLat !== undefined && queryLng !== undefined) {
      distanceKm =
        Math.round(calculateHaversineDistance(queryLat, queryLng, hospital.latitude, hospital.longitude) * 100) /
        100;
    }

    res.json({
      ...hospital,
      distanceKm,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch hospital details.' });
  }
}

export const hospitalController = {
  getHospitals,
  getHospitalById,
};
