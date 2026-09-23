import { beforeApi, type Household, type HouseholdMember, type Shelter, type ShelterOccupancy, type DisasterEvent } from '../api/beforeApi';
import { request } from '../services/apiClient';
import type { Hospital, HospitalListResponse } from '../services/hospitalService';
import type { LiveWeatherData } from '../components/common/LiveWeatherCard';
import { getFloodRiskAssessment, getWindCompass } from '../components/common/LiveWeatherCard';
import { offlineStorageService } from './offlineStorageService';
import { isSnapshotStale } from './offlineDateUtils';
import {
  storageOk,
  storageErr,
  type StorageResult,
  type FallbackResult,
  type CachedDataResult,
  type HouseholdRecord,
  type HouseholdMemberRecord,
  type ShelterRecord,
  type HospitalRecord,
  type MapDataRecord,
  type HazardSnapshotRecord,
  type UserSessionRecord,
} from './types';
import type { UnifiedUser } from '../types/index';

/**
 * STRIDE Offline Cache & Hydration Service
 *
 * Provides online-first / cache-second data access across core reference and citizen datasets.
 * Enforces strict user isolation, staleness tracking, and non-destructive upserts.
 */
export const offlineCacheService = {
  // ==========================================================================
  // 1. Household & Members (Strict User Isolation)
  // ==========================================================================

  /**
   * Persists a normalized household and its members into IndexedDB.
   * Bound strictly to the authenticated `userId`.
   */
  async persistHousehold(household: Household, userId: string): Promise<StorageResult<string>> {
    const now = new Date().toISOString();
    const ownerId = household.createdByUserId || userId;

    const record: HouseholdRecord = {
      id: household.id,
      userId: ownerId,
      name: household.name || 'My Home',
      address: household.address || household.registeredHomeLocation?.address || '',
      city: household.registeredHomeLocation?.city || 'Bengaluru',
      state: household.registeredHomeLocation?.state || 'Karnataka',
      latitude: household.latitude || household.registeredHomeLocation?.latitude || 12.9716,
      longitude: household.longitude || household.registeredHomeLocation?.longitude || 77.5946,
      onboardingCompleted: Boolean((household as any).onboardingCompleted ?? true),
      lastSyncedAt: now,
    };

    const hhPut = await offlineStorageService.putHousehold(record);
    if (!hhPut.ok) return hhPut;

    if (household.members && household.members.length > 0) {
      const memberRecords: HouseholdMemberRecord[] = household.members.map((m) => ({
        id: m.id,
        householdId: household.id,
        name: m.name,
        age: m.age,
        relationship: m.relationship,
        category: (m.category as any) || 'ADULT',
        syncStatus: 'SYNCED',
      }));
      await offlineStorageService.putHouseholdMembers(memberRecords);
    }

    await offlineStorageService.putSyncMetadata({
      entityName: 'household',
      lastSyncTime: now,
      recordCount: 1,
      syncState: 'IDLE',
    });

    return storageOk(household.id);
  },

  /**
   * Retrieves the current user's household with online-first / cache-second strategy.
   * Enforces strict user isolation: never returns a household belonging to another user.
   */
  async getHouseholdWithFallback(userId?: string): Promise<FallbackResult<Household | null>> {
    const now = new Date().toISOString();

    // 1. ONLINE ATTEMPT
    try {
      const serverHh = await beforeApi.getMyHousehold();
      if (serverHh && serverHh.id) {
        const ownerId = serverHh.createdByUserId || userId || 'current-user';
        await this.persistHousehold(serverHh, ownerId);
        return storageOk({
          data: serverHh,
          source: 'server',
          lastSyncedAt: now,
          isStale: false,
        });
      }
    } catch (networkErr) {
      console.info('[offlineCacheService] Network fetch failed for household, attempting cache fallback:', networkErr);
    }

    // 2. OFFLINE CACHE FALLBACK
    if (!userId) {
      return storageOk({
        data: null,
        source: 'none',
      });
    }

    const cachedHhResult = await offlineStorageService.getHouseholdByUserId(userId);
    if (!cachedHhResult.ok) {
      return storageErr(
        cachedHhResult.error.code,
        `Failed to access offline storage: ${cachedHhResult.error.message}`,
        cachedHhResult.error.cause
      );
    }

    const cachedHh = cachedHhResult.data;
    if (!cachedHh) {
      return storageOk({
        data: null,
        source: 'none',
      });
    }

    // USER ISOLATION CHECK: Reject if record doesn't belong to current user
    if (cachedHh.userId !== userId) {
      return storageOk({
        data: null,
        source: 'none',
      });
    }

    // Retrieve members belonging strictly to this household
    const membersResult = await offlineStorageService.getHouseholdMembers(cachedHh.id);
    if (!membersResult.ok) {
      return storageErr(membersResult.error.code, membersResult.error.message, membersResult.error.cause);
    }

    const reconstructedMembers: HouseholdMember[] = (membersResult.data || []).map((m) => ({
      id: m.id,
      householdId: m.householdId,
      name: m.name,
      age: m.age,
      relationship: m.relationship,
      category: m.category,
    }));

    const reconstructedHousehold: Household = {
      id: cachedHh.id,
      householdCode: `HH-${cachedHh.id.slice(0, 8).toUpperCase()}`,
      createdByUserId: cachedHh.userId,
      name: cachedHh.name,
      address: cachedHh.address,
      latitude: cachedHh.latitude,
      longitude: cachedHh.longitude,
      members: reconstructedMembers,
      registeredHomeLocation: {
        id: `loc-${cachedHh.id}`,
        buildingNameOrNumber: cachedHh.name,
        address: cachedHh.address,
        city: cachedHh.city,
        state: cachedHh.state,
        latitude: cachedHh.latitude,
        longitude: cachedHh.longitude,
      },
    };

    return storageOk({
      data: reconstructedHousehold,
      source: 'cache',
      lastSyncedAt: cachedHh.lastSyncedAt,
      isStale: true,
    });
  },

  // ==========================================================================
  // 2. Shelters
  // ==========================================================================

  async persistShelters(shelters: (Shelter | ShelterOccupancy)[], disasterId?: string): Promise<StorageResult<void>> {
    const now = new Date().toISOString();
    const records: ShelterRecord[] = shelters.map((s) => {
      const anyS = s as any;
      const hasOcc = anyS.hasOccupancyData === true || typeof anyS.expectedArrivals === 'number' || typeof anyS.remainingCapacity === 'number';
      return {
        id: s.id,
        name: s.name,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        capacity: s.capacity,
        contactNumber: s.contactNumber,
        status: (s.status as any) || 'ACTIVE',
        lastSyncedAt: now,
        expectedArrivals: hasOcc && typeof anyS.expectedArrivals === 'number' ? anyS.expectedArrivals : undefined,
        remainingCapacity: hasOcc && typeof anyS.remainingCapacity === 'number' ? anyS.remainingCapacity : undefined,
        occupancyPercentage: hasOcc && typeof anyS.occupancyPercentage === 'number' ? anyS.occupancyPercentage : undefined,
        hasOccupancyData: hasOcc,
      };
    });

    const putRes = await offlineStorageService.putShelters(records);
    if (!putRes.ok) return putRes;

    // Persist full snapshot to appMetadata for disaster and latest fallback
    await offlineStorageService.putAppMetadata({
      key: 'latest_shelter_occupancy',
      value: {
        timestamp: now,
        disasterId: disasterId || null,
        occupancies: shelters,
      },
      updatedAt: now,
    });
    if (disasterId) {
      await offlineStorageService.putAppMetadata({
        key: `shelter_occupancy_${disasterId}`,
        value: {
          timestamp: now,
          occupancies: shelters,
        },
        updatedAt: now,
      });
    }

    await offlineStorageService.putSyncMetadata({
      entityName: 'shelters',
      lastSyncTime: now,
      recordCount: records.length,
      syncState: 'IDLE',
    });

    return storageOk(undefined);
  },

  async getSheltersWithFallback(disasterId?: string): Promise<FallbackResult<ShelterOccupancy[]>> {
    const now = new Date().toISOString();

    // 1. ONLINE ATTEMPT
    try {
      if (disasterId) {
        const liveOccupancy = await beforeApi.getShelterOccupancy(disasterId);
        if (Array.isArray(liveOccupancy) && liveOccupancy.length > 0) {
          const tagged: ShelterOccupancy[] = liveOccupancy.map((s) => ({
            ...s,
            hasOccupancyData: true,
            occupancyUnavailable: false,
          }));
          await this.persistShelters(tagged, disasterId);
          return storageOk({
            data: tagged,
            source: 'server',
            lastSyncedAt: now,
            isStale: false,
          });
        }
      } else {
        const serverShelters = await beforeApi.getShelters();
        if (Array.isArray(serverShelters) && serverShelters.length > 0) {
          await this.persistShelters(serverShelters);
          const mapped: ShelterOccupancy[] = serverShelters.map((s) => ({
            ...s,
            expectedArrivals: 0,
            remainingCapacity: s.capacity,
            occupancyPercentage: 0,
            hasOccupancyData: false,
            occupancyUnavailable: true,
            status: (s.status as any) || 'AVAILABLE',
          }));
          return storageOk({
            data: mapped,
            source: 'server',
            lastSyncedAt: now,
            isStale: false,
          });
        }
      }
    } catch (networkErr) {
      console.info('[offlineCacheService] Network fetch failed for shelters, attempting cache fallback:', networkErr);
    }

    // 2. OFFLINE CACHE FALLBACK
    const cachedResult = await offlineStorageService.getAllShelters();
    if (!cachedResult.ok) {
      return storageErr(cachedResult.error.code, cachedResult.error.message, cachedResult.error.cause);
    }

    const cachedShelters = cachedResult.data || [];
    if (cachedShelters.length === 0) {
      return storageOk({
        data: [],
        source: 'none',
      });
    }

    // Retrieve full snapshot from metadata if available
    let metadataOccupancyMap: Record<string, any> | null = null;
    if (disasterId) {
      const metaDisaster = await offlineStorageService.getAppMetadata(`shelter_occupancy_${disasterId}`);
      const occupancies = (metaDisaster.data?.value as any)?.occupancies;
      if (metaDisaster.ok && Array.isArray(occupancies)) {
        metadataOccupancyMap = {};
        for (const occ of occupancies) {
          metadataOccupancyMap[occ.id] = occ;
        }
      }
    }
    if (!metadataOccupancyMap) {
      const metaLatest = await offlineStorageService.getAppMetadata('latest_shelter_occupancy');
      const occupancies = (metaLatest.data?.value as any)?.occupancies;
      if (metaLatest.ok && Array.isArray(occupancies)) {
        metadataOccupancyMap = {};
        for (const occ of occupancies) {
          metadataOccupancyMap[occ.id] = occ;
        }
      }
    }

    const shelters: ShelterOccupancy[] = cachedShelters.map((s) => {
      const metaOcc = metadataOccupancyMap ? metadataOccupancyMap[s.id] : null;
      const hasOcc = s.hasOccupancyData === true || (metaOcc && (metaOcc.hasOccupancyData === true || typeof metaOcc.expectedArrivals === 'number'));

      if (hasOcc) {
        const exp = typeof s.expectedArrivals === 'number'
          ? s.expectedArrivals
          : (typeof metaOcc?.expectedArrivals === 'number' ? metaOcc.expectedArrivals : 0);
        const rem = typeof s.remainingCapacity === 'number'
          ? s.remainingCapacity
          : (typeof metaOcc?.remainingCapacity === 'number' ? metaOcc.remainingCapacity : (s.capacity - exp));
        const pct = typeof s.occupancyPercentage === 'number'
          ? s.occupancyPercentage
          : (typeof metaOcc?.occupancyPercentage === 'number' ? metaOcc.occupancyPercentage : 0);
        const status = s.status || metaOcc?.status || 'AVAILABLE';

        return {
          id: s.id,
          name: s.name,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          capacity: s.capacity,
          contactNumber: s.contactNumber,
          status: status as any,
          expectedArrivals: exp,
          remainingCapacity: rem,
          occupancyPercentage: pct,
          hasOccupancyData: true,
          occupancyUnavailable: false,
        };
      }

      return {
        id: s.id,
        name: s.name,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        capacity: s.capacity,
        contactNumber: s.contactNumber,
        status: (s.status as any) || 'AVAILABLE',
        expectedArrivals: 0,
        remainingCapacity: s.capacity,
        occupancyPercentage: 0,
        hasOccupancyData: false,
        occupancyUnavailable: true,
      };
    });

    const isStale = isSnapshotStale(cachedShelters[0]?.lastSyncedAt);

    return storageOk({
      data: shelters,
      source: 'cache',
      lastSyncedAt: cachedShelters[0]?.lastSyncedAt,
      isStale,
    });
  },

  // ==========================================================================
  // 3. Hospitals
  // ==========================================================================

  async persistHospitals(hospitals: Hospital[]): Promise<StorageResult<void>> {
    const now = new Date().toISOString();
    const records: HospitalRecord[] = hospitals.map((h) => ({
      id: h.id,
      name: h.name,
      address: h.address,
      latitude: h.latitude,
      longitude: h.longitude,
      contactNumber: h.contactNumber,
      totalBeds: h.totalBeds,
      availableBeds: h.availableBeds,
      icuBedsAvailable: h.icuBedsAvailable,
      specialities: h.specialities,
      doctors: h.doctors,
      disclaimer: h.disclaimer,
      lastSyncedAt: now,
    }));

    const putRes = await offlineStorageService.putHospitals(records);
    if (!putRes.ok) return putRes;

    await offlineStorageService.putSyncMetadata({
      entityName: 'hospitals',
      lastSyncTime: now,
      recordCount: records.length,
      syncState: 'IDLE',
    });

    return storageOk(undefined);
  },

  async getHospitalsWithFallback(options?: {
    lat?: number;
    lng?: number;
    radiusKm?: number;
    scope?: 'local' | 'all';
  }): Promise<FallbackResult<HospitalListResponse>> {
    const now = new Date().toISOString();

    // 1. ONLINE ATTEMPT
    try {
      const params = new URLSearchParams();
      if (options?.lat !== undefined) params.set('lat', String(options.lat));
      if (options?.lng !== undefined) params.set('lng', String(options.lng));
      if (options?.radiusKm !== undefined) params.set('radiusKm', String(options.radiusKm));
      if (options?.scope) params.set('scope', options.scope);

      const qs = params.toString();
      const serverRes = await request<HospitalListResponse>(`/hospitals${qs ? `?${qs}` : ''}`);

      if (serverRes && Array.isArray(serverRes.hospitals) && serverRes.hospitals.length > 0) {
        await this.persistHospitals(serverRes.hospitals);
        const serverResWithMeta: HospitalListResponse = {
          ...serverRes,
          source: 'server',
          lastSyncedAt: now,
          isStale: false,
        };
        return storageOk({
          data: serverResWithMeta,
          source: 'server',
          lastSyncedAt: now,
          isStale: false,
        });
      }
    } catch (networkErr) {
      console.info('[offlineCacheService] Network fetch failed for hospitals, attempting cache fallback:', networkErr);
    }

    // 2. OFFLINE CACHE FALLBACK
    const cachedResult = await offlineStorageService.getAllHospitals();
    if (!cachedResult.ok) {
      return storageErr(cachedResult.error.code, cachedResult.error.message, cachedResult.error.cause);
    }

    const cachedRecords = cachedResult.data || [];
    if (cachedRecords.length === 0) {
      const emptyResponse: HospitalListResponse = {
        role: 'CITIZEN',
        userLocation: null,
        scope: 'JURISDICTION_WIDE',
        totalCount: 0,
        disclaimer: '⚠️ DEMO DATA',
        hospitals: [],
        source: 'none',
      };
      return storageOk({
        data: emptyResponse,
        source: 'none',
      });
    }

    const hospitals: Hospital[] = cachedRecords.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      contactNumber: r.contactNumber,
      totalBeds: r.totalBeds,
      availableBeds: r.availableBeds,
      icuBedsTotal: Math.round(r.totalBeds * 0.15),
      icuBedsAvailable: r.icuBedsAvailable,
      emergencyDepartmentAvailable: r.availableBeds > 0,
      emergencyStatusText: r.availableBeds > 5 ? 'Operational' : 'Critical Capacity',
      specialities: r.specialities || [],
      doctors: r.doctors || [],
      facilityType: 'HOSPITAL',
      disclaimer: r.disclaimer,
    }));

    const isStale = isSnapshotStale(cachedRecords[0]?.lastSyncedAt);

    const cachedResponse: HospitalListResponse = {
      role: 'CITIZEN',
      userLocation: options?.lat && options?.lng ? { latitude: options.lat, longitude: options.lng } : null,
      scope: options?.scope === 'local' ? 'CITIZEN_LOCAL' : 'JURISDICTION_WIDE',
      totalCount: hospitals.length,
      disclaimer: cachedRecords[0]?.disclaimer || '⚠️ DEMO DATA',
      hospitals,
      source: 'cache',
      lastSyncedAt: cachedRecords[0]?.lastSyncedAt,
      isStale,
    };

    return storageOk({
      data: cachedResponse,
      source: 'cache',
      lastSyncedAt: cachedRecords[0]?.lastSyncedAt,
      isStale,
    });
  },

  // ==========================================================================
  // 4. Map & Disaster Data
  // ==========================================================================

  async persistMapData(
    disasterId: string,
    zones: Array<{
      id: string;
      name: string;
      riskLevel?: string;
      polygonGeoJson: string | any[];
      radiusKm?: number;
    }>
  ): Promise<StorageResult<void>> {
    const now = new Date().toISOString();
    for (const z of zones) {
      const record: MapDataRecord = {
        id: z.id,
        disasterId,
        name: z.name,
        riskLevel: (z.riskLevel as any) || 'HIGH',
        polygonGeoJson: z.polygonGeoJson,
        radiusKm: z.radiusKm || 5.0,
        lastSyncedAt: now,
      };
      await offlineStorageService.putMapData(record);
    }

    await offlineStorageService.putSyncMetadata({
      entityName: `mapData_${disasterId}`,
      lastSyncTime: now,
      recordCount: zones.length,
      syncState: 'IDLE',
    });

    return storageOk(undefined);
  },

  async getMapDataWithFallback(
    disasterId: string
  ): Promise<
    FallbackResult<
      Array<{
        id: string;
        disasterId: string;
        name: string;
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
        polygonGeoJson: string;
        radiusKm: number;
      }>
    >
  > {
    const now = new Date().toISOString();

    // 1. ONLINE ATTEMPT
    try {
      const rawZones = await beforeApi.getZones(disasterId);
      if (Array.isArray(rawZones) && rawZones.length > 0) {
        const normalized = rawZones.map((z: any) => ({
          id: z.id,
          disasterId: z.disasterId || disasterId,
          name: z.name,
          riskLevel: (z.riskLevel || z.alertLevel || 'HIGH') as 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME',
          polygonGeoJson:
            typeof z.polygonGeoJson === 'string'
              ? z.polygonGeoJson
              : typeof z.boundaryCoordinates === 'string'
              ? z.boundaryCoordinates
              : JSON.stringify(z.polygonGeoJson || z.boundaryCoordinates || []),
          radiusKm: Number(z.radiusKm) || 5.0,
        }));
        await this.persistMapData(disasterId, normalized);
        return storageOk({
          data: normalized,
          source: 'server',
          lastSyncedAt: now,
          isStale: false,
        });
      }
    } catch (networkErr) {
      console.info('[offlineCacheService] Network fetch failed for map data, attempting cache fallback:', networkErr);
    }

    // 2. OFFLINE CACHE FALLBACK
    let cachedZones: MapDataRecord[] = [];
    if (disasterId) {
      const cachedResult = await offlineStorageService.getMapDataByDisasterId(disasterId);
      if (!cachedResult.ok) {
        return storageErr(cachedResult.error.code, cachedResult.error.message, cachedResult.error.cause);
      }
      cachedZones = cachedResult.data || [];
    } else {
      const allResult = await offlineStorageService.getAllMapData();
      if (!allResult.ok) {
        return storageErr(allResult.error.code, allResult.error.message, allResult.error.cause);
      }
      cachedZones = allResult.data || [];
    }

    if (cachedZones.length === 0) {
      return storageOk({
        data: [],
        source: 'none',
      });
    }

    const mapped = cachedZones.map((z) => ({
      id: z.id,
      disasterId: z.disasterId,
      name: z.name,
      riskLevel: z.riskLevel,
      polygonGeoJson: typeof z.polygonGeoJson === 'string' ? z.polygonGeoJson : JSON.stringify(z.polygonGeoJson),
      radiusKm: z.radiusKm || 5.0,
    }));

    const isStale = isSnapshotStale(cachedZones[0]?.lastSyncedAt);

    return storageOk({
      data: mapped,
      source: 'cache',
      lastSyncedAt: cachedZones[0]?.lastSyncedAt,
      isStale,
    });
  },

  // ==========================================================================
  // 5. Hazard Snapshots & Weather
  // ==========================================================================

  /**
   * Persists the latest weather/hazard telemetry snapshot.
   * Computes expiration based on weather observation timestamp (hourly granularity).
   */
  async persistHazardSnapshot(
    lat: number,
    lon: number,
    data: LiveWeatherData
  ): Promise<StorageResult<string>> {
    const snapshotId = `hazard_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const recordedAt = data.time || new Date().toISOString();
    // Expiration is 1 hour after recorded observation time
    const expiresAt = new Date(new Date(recordedAt).getTime() + 60 * 60 * 1000).toISOString();
    const risk = getFloodRiskAssessment(data.precipitation, data.weatherCode);

    const record: HazardSnapshotRecord = {
      id: snapshotId,
      temperature: data.temperature,
      apparentTemperature: data.apparentTemperature,
      precipitation: data.precipitation,
      relativeHumidity: data.relativeHumidity,
      windSpeed: data.windSpeed,
      floodRiskLevel: risk.level,
      badge: risk.badge,
      recordedAt,
      expiresAt,
    };

    const putRes = await offlineStorageService.putHazardSnapshot(record);
    if (!putRes.ok) return putRes;

    return storageOk(snapshotId);
  },

  /**
   * Fetches weather online or retrieves cached snapshot if offline.
   * Staleness is determined accurately by comparing current time with `expiresAt`
   * rather than blindly marking every offline read stale.
   */
  async getHazardSnapshotWithFallback(
    lat: number,
    lon: number
  ): Promise<FallbackResult<LiveWeatherData | null>> {
    const snapshotId = `hazard_${lat.toFixed(2)}_${lon.toFixed(2)}`;

    // 1. ONLINE ATTEMPT
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,precipitation_probability,weather_code&forecast_hours=6&timezone=auto`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const current = json.current || {};
        const hourly = json.hourly || {};

        const nextHours = [];
        const times = hourly.time || [];
        const temps = hourly.temperature_2m || [];
        const pops = hourly.precipitation_probability || [];
        const codes = hourly.weather_code || [];

        for (let i = 0; i < Math.min(6, times.length); i++) {
          nextHours.push({
            time: times[i],
            temp: temps[i] ?? current.temperature_2m ?? 0,
            precipProb: pops[i] ?? 0,
            weatherCode: codes[i] ?? current.weather_code ?? 0,
          });
        }

        const windDeg = current.wind_direction_10m ?? 0;
        const liveData: LiveWeatherData = {
          temperature: current.temperature_2m ?? 0,
          apparentTemperature: current.apparent_temperature ?? current.temperature_2m ?? 0,
          windSpeed: current.wind_speed_10m ?? 0,
          windDirection: windDeg,
          windDirectionCardinal: getWindCompass(windDeg),
          precipitation: current.precipitation ?? 0,
          relativeHumidity: current.relative_humidity_2m ?? 0,
          weatherCode: current.weather_code ?? 0,
          time: current.time || new Date().toISOString(),
          hourly: nextHours,
        };

        await this.persistHazardSnapshot(lat, lon, liveData);
        return storageOk({
          data: liveData,
          source: 'server',
          lastSyncedAt: liveData.time,
          isStale: false,
        });
      }
    } catch (networkErr) {
      console.info('[offlineCacheService] Live weather fetch failed, attempting cache fallback:', networkErr);
    }

    // 2. OFFLINE CACHE FALLBACK
    const cachedResult = await offlineStorageService.getHazardSnapshot(snapshotId);
    if (!cachedResult.ok) {
      return storageErr(cachedResult.error.code, cachedResult.error.message, cachedResult.error.cause);
    }

    const snapshot = cachedResult.data;
    if (!snapshot) {
      return storageOk({
        data: null,
        source: 'none',
      });
    }

    // Determine staleness strictly from actual `expiresAt` timestamp (Refinement 3)
    const isStale = Date.now() > new Date(snapshot.expiresAt).getTime();

    const reconstructed: LiveWeatherData = {
      temperature: snapshot.temperature,
      apparentTemperature: snapshot.apparentTemperature,
      windSpeed: snapshot.windSpeed,
      windDirection: 0,
      windDirectionCardinal: 'N',
      precipitation: snapshot.precipitation,
      relativeHumidity: snapshot.relativeHumidity,
      weatherCode: 0, // Fallback code
      time: snapshot.recordedAt,
      hourly: [],
    };

    return storageOk({
      data: reconstructed,
      source: 'cache',
      lastSyncedAt: snapshot.recordedAt,
      isStale,
    });
  },

  // ==========================================================================
  // 6. User Session Metadata (Security-Restricted)
  // ==========================================================================

  /**
   * Persists non-secret user identity for offline authorization checks.
   * NEVER stores passwords, JWT secrets, or tokens.
   */
  async persistUserSession(
    user: UnifiedUser,
    householdId?: string
  ): Promise<StorageResult<string>> {
    const session: UserSessionRecord = {
      userId: user.id,
      name: user.name,
      role: user.role,
      mobileNumber: user.mobileNumber,
      testIdentityNumber: user.testIdentityNumber,
      householdId,
      lastAuthenticated: new Date().toISOString(),
    };

    return offlineStorageService.putUserSession(session);
  },

  async getCachedUserSession(userId: string): Promise<StorageResult<UserSessionRecord | null>> {
    return offlineStorageService.getUserSession(userId);
  },

  // ==========================================================================
  // 7. Disaster Events Reference Data
  // ==========================================================================

  async persistDisasters(disasters: DisasterEvent[]): Promise<StorageResult<void>> {
    const now = new Date().toISOString();
    const putRes = await offlineStorageService.putAppMetadata({
      key: 'cached_disasters',
      value: disasters,
      updatedAt: now,
    });
    if (!putRes.ok) return storageErr(putRes.error.code, putRes.error.message, putRes.error.cause);
    return storageOk(undefined);
  },

  async getDisastersWithFallback(): Promise<FallbackResult<DisasterEvent[]>> {
    const now = new Date().toISOString();

    // 1. ONLINE ATTEMPT
    try {
      const serverDisasters = await beforeApi.getDisasters();
      if (Array.isArray(serverDisasters) && serverDisasters.length > 0) {
        await this.persistDisasters(serverDisasters);
        return storageOk({
          data: serverDisasters,
          source: 'server',
          lastSyncedAt: now,
          isStale: false,
        });
      }
    } catch (networkErr) {
      console.info('[offlineCacheService] Network fetch failed for disasters, attempting cache fallback:', networkErr);
    }

    // 2. OFFLINE CACHE FALLBACK
    const metaRes = await offlineStorageService.getAppMetadata('cached_disasters');
    if (!metaRes.ok) {
      return storageErr(metaRes.error.code, metaRes.error.message, metaRes.error.cause);
    }

    const meta = metaRes.data;
    if (!meta || !Array.isArray(meta.value) || meta.value.length === 0) {
      return storageOk({
        data: [],
        source: 'none',
      });
    }

    const disasters = meta.value as DisasterEvent[];
    const isStale = isSnapshotStale(meta.updatedAt);

    return storageOk({
      data: disasters,
      source: 'cache',
      lastSyncedAt: meta.updatedAt,
      isStale,
    });
  },

  // ==========================================================================
  // 8. User-Scoped Citizen Map Cache (Strict Multi-User Isolation)
  // ==========================================================================

  async persistCitizenMap(userId: string, mapData: any): Promise<StorageResult<void>> {
    if (!userId || typeof userId !== 'string') {
      return storageErr('OPERATION_FAILED', 'userId is required for citizen map persistence');
    }
    const now = new Date().toISOString();
    const putRes = await offlineStorageService.putAppMetadata({
      key: `latest_citizen_map_${userId}`,
      value: mapData,
      updatedAt: now,
    });
    if (!putRes.ok) return storageErr(putRes.error.code, putRes.error.message, putRes.error.cause);
    return storageOk(undefined);
  },

  async getCitizenMapWithFallback(userId?: string | null): Promise<FallbackResult<any>> {
    if (!userId || typeof userId !== 'string') {
      return storageOk({
        data: null,
        source: 'none',
      });
    }

    const metaRes = await offlineStorageService.getAppMetadata(`latest_citizen_map_${userId}`);
    if (!metaRes.ok) {
      return storageErr(metaRes.error.code, metaRes.error.message, metaRes.error.cause);
    }

    const meta = metaRes.data;
    if (!meta || !meta.value) {
      return storageOk({
        data: null,
        source: 'none',
      });
    }

    const isStale = isSnapshotStale(meta.updatedAt);
    return storageOk({
      data: meta.value,
      source: 'cache',
      lastSyncedAt: meta.updatedAt,
      isStale,
    });
  },

  // ==========================================================================
  // 9. Command & Rescuer Map Cache
  // ==========================================================================

  async persistRescuerMap(mapData: any): Promise<StorageResult<void>> {
    const now = new Date().toISOString();
    const putRes = await offlineStorageService.putAppMetadata({
      key: 'latest_rescuer_map',
      value: mapData,
      updatedAt: now,
    });
    if (!putRes.ok) return storageErr(putRes.error.code, putRes.error.message, putRes.error.cause);
    return storageOk(undefined);
  },

  async getRescuerMapWithFallback(): Promise<FallbackResult<any>> {
    const metaRes = await offlineStorageService.getAppMetadata('latest_rescuer_map');
    if (!metaRes.ok) {
      return storageErr(metaRes.error.code, metaRes.error.message, metaRes.error.cause);
    }

    const meta = metaRes.data;
    if (!meta || !meta.value) {
      return storageOk({
        data: null,
        source: 'none',
      });
    }

    const isStale = isSnapshotStale(meta.updatedAt);
    return storageOk({
      data: meta.value,
      source: 'cache',
      lastSyncedAt: meta.updatedAt,
      isStale,
    });
  },
};
