import { beforeApi } from '../api/beforeApi';
import { duringApi } from '../api/duringApi';
import { authApi } from '../api/authApi';
import { Shelter } from './shelterService';
import { EmergencyFacility } from './facilityService';
import { AffectedZone, disasterService } from './disasterService';
import { householdService } from './householdService';
import { offlineCacheService } from '../offline/cacheService';
import { isSnapshotStale } from '../offline/offlineDateUtils';

export interface Road {
  id: string;
  name: string;
  status: 'OPEN' | 'FLOODED' | 'BLOCKED' | 'RESTRICTED';
  coordinatesJson: string;
}

export interface CitizenMapResponse {
  registeredHome: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    membersCount: number;
    members: any[];
  };
  radiusKm: number;
  shelters: (Shelter & {
    distanceKm: number;
    expectedArrivals?: number;
    remainingCapacity?: number;
    occupancyPercentage?: number;
  })[];
  facilities: {
    hospitals: (EmergencyFacility & { distanceKm: number })[];
    fireStations: (EmergencyFacility & { distanceKm: number })[];
    policeStations: (EmergencyFacility & { distanceKm: number })[];
    checkpoints: (EmergencyFacility & { distanceKm: number })[];
  };
  roads: Road[];
  zones: AffectedZone[];
  osmStatus?: {
    source: string;
    totalDiscovered?: number;
    error?: string;
  };
  source?: 'server' | 'cache' | 'none';
  lastSyncedAt?: string;
  isStale?: boolean;
}

export interface RescuerMapResponse {
  households: any[];
  shelters: Shelter[];
  facilities: EmergencyFacility[];
  roads: Road[];
  zones: AffectedZone[];
  emergencyRequests: any[];
  source?: 'server' | 'cache' | 'none';
  lastSyncedAt?: string;
  isStale?: boolean;
}

function isValidCoordinate(lat: any, lng: any): boolean {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180
  );
}

export function generateDemoEmergencyContact(facilityId: string, type: string): string {
  let hash = 0;
  for (let i = 0; i < facilityId.length; i++) {
    hash = (hash << 5) - hash + facilityId.charCodeAt(i);
    hash |= 0;
  }
  const offset = (Math.abs(hash) % 999) + 1;
  let typePrefix = '1';
  const uType = (type || '').toUpperCase();
  if (uType.includes('FIRE')) {
    typePrefix = '2';
  } else if (uType.includes('POLICE')) {
    typePrefix = '3';
  } else if (uType.includes('HOSP') || uType.includes('HEALTH')) {
    typePrefix = '1';
  } else {
    typePrefix = '4';
  }
  return `080-4000-${typePrefix}${offset.toString().padStart(3, '0')}`;
}

const mapFacility = (f: any, type: 'HOSPITAL' | 'FIRE_STATION' | 'POLICE_STATION' | 'CHECKPOINT') => {
  const lat = Number(f.latitude);
  const lng = Number(f.longitude);
  const distanceKm = Number.isFinite(Number(f.distanceKm)) ? Number(f.distanceKm) : 0;
  const facilityId = f.id || `${type}-${Math.random().toString(36).slice(2, 9)}`;
  const demoContact = f.emergencyContact || generateDemoEmergencyContact(facilityId, type);
  return {
    id: facilityId,
    name: typeof f.name === 'string' && f.name.trim() ? f.name.trim() : `Unnamed ${type}`,
    type,
    address: typeof f.address === 'string' ? f.address : '',
    latitude: lat,
    longitude: lng,
    contactNumber: demoContact,
    emergencyContact: demoContact,
    emergencyContactIsDemo: true,
    phone: f.phone || demoContact || null,
    distanceKm,
    source: f.source || 'OpenStreetMap',
  };
};

export const mapService = {
  async getCitizenMap(disasterId?: string): Promise<CitizenMapResponse> {
    const storedUser = authApi.getStoredUser();
    const userId = storedUser?.id;
    const now = new Date().toISOString();

    // 1. ONLINE ATTEMPT
    try {
      const rawMap = await beforeApi.getCitizenMap(disasterId);
      if (rawMap) {
        const [myHousehold, zones, shelterOccupancies] = await Promise.all([
          householdService.getMyHousehold().catch(() => null),
          disasterId ? disasterService.getAffectedZones(disasterId).catch(() => []) : Promise.resolve([]),
          disasterId ? beforeApi.getShelterOccupancy(disasterId).catch(() => []) : Promise.resolve([]),
        ]);

        const center = rawMap.center || rawMap.registeredHome;
        let homeLat = Number(center?.latitude ?? myHousehold?.latitude ?? 12.9352);
        let homeLon = Number(center?.longitude ?? myHousehold?.longitude ?? 77.6245);
        if (!isValidCoordinate(homeLat, homeLon)) {
          homeLat = 12.9352;
          homeLon = 77.6245;
        }

        const homeName = center?.buildingNameOrNumber || myHousehold?.name || `${storedUser?.name || 'Citizen'}'s Residence`;
        const homeAddress = center?.address
          ? `${center.address}${center.city ? `, ${center.city}` : ''}`
          : (myHousehold?.address || 'Bengaluru');
        const members = Array.isArray(myHousehold?.members)
          ? myHousehold.members
          : Array.isArray(center?.members)
          ? center.members
          : [];
        const membersCount = myHousehold?.members?.length ?? members.length ?? 1;

        const registeredHome = {
          id: center?.householdId || myHousehold?.id || 'home',
          name: homeName,
          address: homeAddress,
          latitude: homeLat,
          longitude: homeLon,
          membersCount,
          members,
        };

        const occupancyMap = new Map<string, any>();
        if (Array.isArray(shelterOccupancies)) {
          shelterOccupancies.forEach((occ: any) => {
            if (occ && occ.id) occupancyMap.set(occ.id, occ);
          });
        }

        const rawShelters = Array.isArray(rawMap.shelters) ? rawMap.shelters : [];
        const shelters = rawShelters
          .filter((s: any) => s && isValidCoordinate(s.latitude, s.longitude))
          .map((s: any) => {
            const occ = occupancyMap.get(s.id);
            const capacity = Number(s.capacity ?? occ?.capacity ?? 500);
            const expectedArrivals = occ ? Number(occ.expectedArrivals ?? 0) : 0;
            const remainingCapacity = occ
              ? Number(occ.remainingCapacity ?? (capacity - expectedArrivals))
              : capacity;
            const status = occ?.status || s.status || 'AVAILABLE';
            const distanceKm = Number.isFinite(Number(s.distanceKm)) ? Number(s.distanceKm) : 0;

            return {
              id: s.id,
              name: s.name || 'Shelter',
              address: s.address || '',
              latitude: Number(s.latitude),
              longitude: Number(s.longitude),
              capacity,
              contactNumber: s.contactNumber || '',
              status,
              distanceKm,
              expectedArrivals,
              remainingCapacity,
              occupancyPercentage:
                occ?.occupancyPercentage ??
                (capacity > 0 ? Math.round((expectedArrivals / capacity) * 100) : 0),
            };
          });

        const rawHospitals = Array.isArray(rawMap.hospitals)
          ? rawMap.hospitals
          : Array.isArray(rawMap.facilities?.hospitals)
          ? rawMap.facilities.hospitals
          : [];
        const rawFire = Array.isArray(rawMap.fireStations)
          ? rawMap.fireStations
          : Array.isArray(rawMap.facilities?.fireStations)
          ? rawMap.facilities.fireStations
          : [];
        const rawPolice = Array.isArray(rawMap.policeStations)
          ? rawMap.policeStations
          : Array.isArray(rawMap.facilities?.policeStations)
          ? rawMap.facilities.policeStations
          : [];
        const rawCheckpoints = Array.isArray(rawMap.checkpoints)
          ? rawMap.checkpoints
          : Array.isArray(rawMap.facilities?.checkpoints)
          ? rawMap.facilities.checkpoints
          : [];

        const facilities = {
          hospitals: rawHospitals
            .filter((f: any) => f && isValidCoordinate(f.latitude, f.longitude))
            .map((f: any) => mapFacility(f, 'HOSPITAL')),
          fireStations: rawFire
            .filter((f: any) => f && isValidCoordinate(f.latitude, f.longitude))
            .map((f: any) => mapFacility(f, 'FIRE_STATION')),
          policeStations: rawPolice
            .filter((f: any) => f && isValidCoordinate(f.latitude, f.longitude))
            .map((f: any) => mapFacility(f, 'POLICE_STATION')),
          checkpoints: rawCheckpoints
            .filter((f: any) => f && isValidCoordinate(f.latitude, f.longitude))
            .map((f: any) => mapFacility(f, 'CHECKPOINT')),
        };

        const onlineResponse: CitizenMapResponse = {
          registeredHome,
          radiusKm: Number(rawMap.radiusKm || 5.0),
          shelters,
          facilities,
          roads: [],
          zones: Array.isArray(zones) ? zones : [],
          osmStatus: rawMap.osmStatus || { source: 'OpenStreetMap' },
          source: 'server',
          lastSyncedAt: now,
          isStale: false,
        };

        if (userId) {
          await offlineCacheService.persistCitizenMap(userId, onlineResponse);
        }

        return onlineResponse;
      }
    } catch (networkErr) {
      console.info('[mapService] Online citizen map fetch failed, using compositional offline fallback:', networkErr);
    }

    // 2. COMPOSITIONAL OFFLINE FALLBACK
    // A) Check user-scoped cached citizen map for THIS user (Strict User Isolation)
    const userMapRes = userId ? await offlineCacheService.getCitizenMapWithFallback(userId) : null;
    const cachedUserMap = userMapRes?.ok ? userMapRes.data.data : null;

    // B) Compositional components from IndexedDB:
    const [cachedHhRes, cachedSheltersRes, cachedHospitalsRes, cachedZonesRes] = await Promise.all([
      userId ? offlineCacheService.getHouseholdWithFallback(userId) : Promise.resolve(null),
      offlineCacheService.getSheltersWithFallback(),
      offlineCacheService.getHospitalsWithFallback(),
      disasterId ? offlineCacheService.getMapDataWithFallback(disasterId) : offlineCacheService.getMapDataWithFallback(''),
    ]);

    const myHh = cachedHhRes?.ok ? cachedHhRes.data.data : null;
    const publicShelters = cachedSheltersRes?.ok ? cachedSheltersRes.data.data : [];
    const publicHospitals = cachedHospitalsRes?.ok ? cachedHospitalsRes.data.data.hospitals : [];
    const publicZones = cachedZonesRes?.ok ? cachedZonesRes.data.data : [];

    // Derive home location strictly from user's household or user's cached map
    let registeredHome = cachedUserMap?.registeredHome || null;
    if (myHh && isValidCoordinate(myHh.latitude, myHh.longitude)) {
      registeredHome = {
        id: myHh.id,
        name: myHh.name || `${storedUser?.name || 'Citizen'}'s Residence`,
        address: myHh.address || 'Bengaluru',
        latitude: myHh.latitude,
        longitude: myHh.longitude,
        membersCount: myHh.members?.length || 1,
        members: myHh.members || [],
      };
    } else if (!registeredHome) {
      registeredHome = {
        id: userId || 'citizen-home',
        name: `${storedUser?.name || 'Citizen'}'s Residence`,
        address: 'Bengaluru',
        latitude: 12.9716,
        longitude: 77.5946,
        membersCount: 1,
        members: [],
      };
    }

    const sheltersList = (cachedUserMap?.shelters?.length ? cachedUserMap.shelters : publicShelters).map((s: any) => ({
      ...s,
      distanceKm: s.distanceKm || 0,
      expectedArrivals: s.expectedArrivals || 0,
      remainingCapacity: s.remainingCapacity ?? s.capacity,
      occupancyPercentage: s.occupancyPercentage || 0,
    }));

    const facilities = {
      hospitals: (cachedUserMap?.facilities?.hospitals?.length
        ? cachedUserMap.facilities.hospitals
        : publicHospitals.map((h) => ({
            id: h.id,
            name: h.name,
            type: 'HOSPITAL' as const,
            address: h.address,
            latitude: h.latitude,
            longitude: h.longitude,
            contactNumber: h.contactNumber,
            emergencyContact: h.contactNumber,
            emergencyContactIsDemo: true,
            phone: h.contactNumber,
            distanceKm: h.distanceKm || 0,
            source: 'Offline Cache',
          }))),
      fireStations: cachedUserMap?.facilities?.fireStations || [],
      policeStations: cachedUserMap?.facilities?.policeStations || [],
      checkpoints: cachedUserMap?.facilities?.checkpoints || [],
    };

    const zones = (cachedUserMap?.zones?.length ? cachedUserMap.zones : publicZones);

    const hasAnyCachedData = Boolean(
      cachedUserMap ||
      (myHh && isValidCoordinate(myHh.latitude, myHh.longitude)) ||
      publicShelters.length > 0 ||
      publicHospitals.length > 0 ||
      publicZones.length > 0
    );

    const snapshotTimestamp =
      cachedUserMap?.lastSyncedAt ||
      cachedZonesRes?.data?.lastSyncedAt ||
      cachedSheltersRes?.data?.lastSyncedAt ||
      cachedHospitalsRes?.data?.lastSyncedAt ||
      myHh?.lastSyncedAt;

    const isStale = isSnapshotStale(snapshotTimestamp);

    return {
      registeredHome,
      radiusKm: 5.0,
      shelters: sheltersList,
      facilities,
      roads: cachedUserMap?.roads || [],
      zones,
      osmStatus: { source: 'Offline Cache' },
      source: hasAnyCachedData ? 'cache' : 'none',
      lastSyncedAt: snapshotTimestamp,
      isStale,
    };
  },

  async getRescuerMap(disasterId?: string): Promise<RescuerMapResponse> {
    const now = new Date().toISOString();

    // 1. ONLINE ATTEMPT
    try {
      const [rawRescuer, shelters, facilities, zones] = await Promise.all([
        beforeApi.getRescuerMap(disasterId).catch(() => null),
        disasterId
          ? beforeApi.getShelterOccupancy(disasterId).catch(() => [])
          : beforeApi.getShelters().catch(() => []),
        beforeApi.getFacilities().catch(() => []),
        disasterId ? disasterService.getAffectedZones(disasterId).catch(() => []) : Promise.resolve([]),
      ]);

      if (rawRescuer) {
        const rawHouses = Array.isArray(rawRescuer.houses)
          ? rawRescuer.houses
          : Array.isArray(rawRescuer.households)
          ? rawRescuer.households
          : [];

        const safeHouses = rawHouses.filter((h: any) => {
          const lat = h?.latitude ?? h?.registeredHomeLocation?.latitude;
          const lng = h?.longitude ?? h?.registeredHomeLocation?.longitude;
          return isValidCoordinate(lat, lng);
        });

        const rawFacList: any[] = Array.isArray(facilities)
          ? facilities
          : Array.isArray((facilities as any)?.facilities)
          ? (facilities as any).facilities
          : Array.isArray((facilities as any)?.data?.facilities)
          ? (facilities as any).data.facilities
          : [];

        const facilityMap = new Map<string, any>();
        rawFacList.forEach((f: any) => {
          if (f && isValidCoordinate(f.latitude, f.longitude)) {
            const key = f.id || `${f.name}-${f.latitude}-${f.longitude}`;
            facilityMap.set(key, f);
          }
        });

        const onlineResponse: RescuerMapResponse = {
          households: safeHouses,
          shelters: Array.isArray(shelters) ? shelters : [],
          facilities: Array.from(facilityMap.values()),
          roads: Array.isArray(rawRescuer.roads) ? rawRescuer.roads : [],
          zones: Array.isArray(zones) ? zones : [],
          emergencyRequests: Array.isArray(rawRescuer.emergencyRequests) ? rawRescuer.emergencyRequests : [],
          source: 'server',
          lastSyncedAt: now,
          isStale: false,
        };

        await offlineCacheService.persistRescuerMap(onlineResponse);
        return onlineResponse;
      }
    } catch (networkErr) {
      console.info('[mapService] Online rescuer map fetch failed, using compositional offline fallback:', networkErr);
    }

    // 2. COMPOSITIONAL OFFLINE FALLBACK
    const [cachedRescuerRes, cachedSheltersRes, cachedHospitalsRes, cachedZonesRes] = await Promise.all([
      offlineCacheService.getRescuerMapWithFallback(),
      offlineCacheService.getSheltersWithFallback(),
      offlineCacheService.getHospitalsWithFallback(),
      disasterId ? offlineCacheService.getMapDataWithFallback(disasterId) : offlineCacheService.getMapDataWithFallback(''),
    ]);

    const cachedRescuer = cachedRescuerRes?.ok ? cachedRescuerRes.data.data : null;
    const publicShelters = cachedSheltersRes?.ok ? cachedSheltersRes.data.data : [];
    const publicHospitals = cachedHospitalsRes?.ok ? cachedHospitalsRes.data.data.hospitals : [];
    const publicZones = cachedZonesRes?.ok ? cachedZonesRes.data.data : [];

    const shelters = cachedRescuer?.shelters?.length ? cachedRescuer.shelters : publicShelters;
    const zones = cachedRescuer?.zones?.length ? cachedRescuer.zones : publicZones;
    const facilities = cachedRescuer?.facilities?.length
      ? cachedRescuer.facilities
      : publicHospitals.map((h) => ({
          id: h.id,
          name: h.name,
          type: 'HOSPITAL' as const,
          address: h.address,
          latitude: h.latitude,
          longitude: h.longitude,
          contactNumber: h.contactNumber,
          emergencyContact: h.contactNumber,
          emergencyContactIsDemo: true,
          phone: h.contactNumber,
          distanceKm: h.distanceKm || 0,
          source: 'Offline Cache',
        }));

    const hasAnyData = Boolean(
      cachedRescuer ||
      publicShelters.length > 0 ||
      publicHospitals.length > 0 ||
      publicZones.length > 0
    );

    const snapshotTimestamp =
      cachedRescuer?.lastSyncedAt ||
      cachedZonesRes?.data?.lastSyncedAt ||
      cachedSheltersRes?.data?.lastSyncedAt ||
      cachedHospitalsRes?.data?.lastSyncedAt;

    const isStale = isSnapshotStale(snapshotTimestamp);

    return {
      households: cachedRescuer?.households || [],
      shelters,
      facilities,
      roads: cachedRescuer?.roads || [],
      zones,
      emergencyRequests: cachedRescuer?.emergencyRequests || [],
      source: hasAnyData ? 'cache' : 'none',
      lastSyncedAt: snapshotTimestamp,
      isStale,
    };
  },

  async getDuringMapRequests() {
    return duringApi.getMapRequests();
  },
};
