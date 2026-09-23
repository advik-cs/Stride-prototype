import { beforeApi, Shelter, ShelterOccupancy } from '../api/beforeApi';
import { offlineCacheService } from '../offline/cacheService';

export type { Shelter, ShelterOccupancy };

export interface SheltersWithMetaResponse {
  shelters: ShelterOccupancy[];
  source: 'server' | 'cache' | 'none';
  lastSyncedAt?: string;
  isStale?: boolean;
}

export const shelterService = {
  async getShelters(): Promise<Shelter[]> {
    const res = await offlineCacheService.getSheltersWithFallback();
    if (res.ok) {
      return res.data.data;
    }
    throw new Error(res.error.message);
  },

  async getShelterOccupancy(disasterId: string): Promise<ShelterOccupancy[]> {
    try {
      const live = await beforeApi.getShelterOccupancy(disasterId);
      if (live && live.length > 0) {
        const tagged = live.map((s) => ({
          ...s,
          hasOccupancyData: true,
          occupancyUnavailable: false,
        }));
        await offlineCacheService.persistShelters(tagged, disasterId);
        return tagged;
      }
    } catch (networkErr) {
      console.info('[shelterService] Live shelter occupancy fetch failed, checking cache:', networkErr);
    }

    const cached = await offlineCacheService.getSheltersWithFallback(disasterId);
    if (!cached.ok) {
      throw new Error(cached.error.message);
    }

    return cached.data.data || [];
  },

  async getSheltersWithMeta(disasterId?: string): Promise<SheltersWithMetaResponse> {
    const now = new Date().toISOString();
    if (disasterId) {
      try {
        const live = await beforeApi.getShelterOccupancy(disasterId);
        if (Array.isArray(live) && live.length > 0) {
          const tagged = live.map((s) => ({
            ...s,
            hasOccupancyData: true,
            occupancyUnavailable: false,
          }));
          await offlineCacheService.persistShelters(tagged, disasterId);
          return {
            shelters: tagged,
            source: 'server',
            lastSyncedAt: now,
            isStale: false,
          };
        }
      } catch (err) {
        console.info('[shelterService] Live occupancy failed, falling back to cache:', err);
      }
    } else {
      try {
        const live = await beforeApi.getShelters();
        if (Array.isArray(live) && live.length > 0) {
          await offlineCacheService.persistShelters(live);
          return {
            shelters: live.map((s) => ({
              ...s,
              expectedArrivals: 0,
              remainingCapacity: s.capacity,
              occupancyPercentage: 0,
              hasOccupancyData: false,
              occupancyUnavailable: true,
              status: (s.status as any) || 'AVAILABLE',
            })),
            source: 'server',
            lastSyncedAt: now,
            isStale: false,
          };
        }
      } catch (err) {
        console.info('[shelterService] Live shelters fetch failed, falling back to cache:', err);
      }
    }

    const cachedRes = await offlineCacheService.getSheltersWithFallback(disasterId);
    if (!cachedRes.ok) {
      throw new Error(cachedRes.error.message);
    }

    const cachedShelters = cachedRes.data.data || [];

    return {
      shelters: cachedShelters,
      source: cachedRes.data.source,
      lastSyncedAt: cachedRes.data.lastSyncedAt,
      isStale: cachedRes.data.isStale,
    };
  },

  async createShelter(data: Partial<Shelter>): Promise<Shelter> {
    return beforeApi.createShelter(data);
  },

  async updateShelter(id: string, data: Partial<Shelter>): Promise<Shelter> {
    return beforeApi.updateShelter(id, data);
  },
};
