import { beforeApi, DisasterEvent, BuildingIntelligence } from '../api/beforeApi';
import { offlineCacheService } from '../offline/cacheService';

export type { DisasterEvent, BuildingIntelligence };

export interface AffectedZone {
  id: string;
  disasterId: string;
  name: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  polygonGeoJson: string;
  radiusKm: number;
}

export interface AffectedZonesWithMetaResponse {
  zones: AffectedZone[];
  source: 'server' | 'cache' | 'none';
  lastSyncedAt?: string;
  isStale?: boolean;
}

export const disasterService = {
  async getDisasters(): Promise<DisasterEvent[]> {
    const res = await offlineCacheService.getDisastersWithFallback();
    if (res.ok) {
      return res.data.data;
    }
    throw new Error(res.error.message);
  },

  async getDisasterById(id: string): Promise<DisasterEvent> {
    return beforeApi.getDisasterById(id);
  },

  async createDisaster(data: Partial<DisasterEvent>): Promise<DisasterEvent> {
    return beforeApi.createDisaster(data);
  },

  async updateDisaster(id: string, data: Partial<DisasterEvent>): Promise<DisasterEvent> {
    return beforeApi.createDisaster({ ...data, id });
  },

  async getAffectedZones(disasterId: string): Promise<AffectedZone[]> {
    const cachedRes = await offlineCacheService.getMapDataWithFallback(disasterId);
    if (cachedRes.ok) {
      return cachedRes.data.data;
    }
    throw new Error(cachedRes.error.message);
  },

  async getAffectedZonesWithMeta(disasterId: string): Promise<AffectedZonesWithMetaResponse> {
    const cachedRes = await offlineCacheService.getMapDataWithFallback(disasterId);
    if (!cachedRes.ok) {
      throw new Error(cachedRes.error.message);
    }
    return {
      zones: cachedRes.data.data,
      source: cachedRes.data.source,
      lastSyncedAt: cachedRes.data.lastSyncedAt,
      isStale: cachedRes.data.isStale,
    };
  },

  async addAffectedZone(disasterId: string, data: Partial<AffectedZone>): Promise<AffectedZone> {
    const res = await beforeApi.addZone(disasterId, {
      name: data.name,
      alertLevel: data.riskLevel || 'HIGH',
      boundaryCoordinates: data.polygonGeoJson ? JSON.parse(data.polygonGeoJson) : [],
    });
    return {
      id: res.id,
      disasterId,
      name: res.name,
      riskLevel: res.alertLevel || 'HIGH',
      polygonGeoJson: data.polygonGeoJson || '[]',
      radiusKm: 5.0,
    };
  },

  async getAffectedHouseholds(disasterId: string): Promise<any[]> {
    return beforeApi.getZoneSummary(disasterId);
  },

  async setExpectedLocations(
    disasterId: string,
    locations: Array<{
      householdMemberId?: string;
      memberId?: string;
      expectedLocationType?: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN';
      expectedType?: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN';
      shelterId?: string | null;
      otherCity?: string | null;
    }>
  ): Promise<any> {
    return beforeApi.setExpectedLocations(disasterId, locations);
  },

  async getExpectedLocations(disasterId: string): Promise<any[]> {
    return beforeApi.getExpectedLocations(disasterId);
  },

  async getBuildingIntelligence(disasterId: string): Promise<BuildingIntelligence[]> {
    return beforeApi.getBuildingIntelligence(disasterId);
  },

  async getZoneSummary(disasterId: string): Promise<any> {
    return beforeApi.getZoneSummary(disasterId);
  },

  async submitReconfirmation(
    disasterId: string,
    payload: any
  ): Promise<any> {
    return beforeApi.submitReconfirmation(disasterId, payload);
  },

  async getReconfirmationStatus(disasterId: string, role?: string): Promise<any> {
    if (role === 'RESCUER') {
      return beforeApi.getReconfirmationsStatus(disasterId);
    }
    return beforeApi.getMyReconfirmationStatus(disasterId);
  },
};
