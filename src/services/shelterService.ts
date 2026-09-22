import { beforeApi, Shelter, ShelterOccupancy } from '../api/beforeApi';
import { offlineCacheService } from '../offline/cacheService';

export type { Shelter, ShelterOccupancy };

export const shelterService = {
  async getShelters(): Promise<Shelter[]> {
    const res = await offlineCacheService.getSheltersWithFallback();
    if (res.ok && res.data.data.length > 0) {
      return res.data.data;
    }
    return beforeApi.getShelters();
  },

  async getShelterOccupancy(disasterId: string): Promise<ShelterOccupancy[]> {
    try {
      const live = await beforeApi.getShelterOccupancy(disasterId);
      if (live && live.length > 0) {
        await offlineCacheService.persistShelters(live);
        return live;
      }
    } catch {
      const cached = await offlineCacheService.getSheltersWithFallback();
      if (cached.ok && cached.data.data.length > 0) {
        return cached.data.data.map((s) => ({
          ...s,
          expectedArrivals: 0,
          remainingCapacity: s.capacity,
          occupancyPercentage: 0,
          status: (s.status as any) || 'AVAILABLE',
        }));
      }
    }
    return beforeApi.getShelterOccupancy(disasterId);
  },

  async createShelter(data: Partial<Shelter>): Promise<Shelter> {
    return beforeApi.createShelter(data);
  },

  async updateShelter(id: string, data: Partial<Shelter>): Promise<Shelter> {
    return beforeApi.updateShelter(id, data);
  },
};
