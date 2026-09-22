import { beforeApi, Household, HouseholdMember } from '../api/beforeApi';
import { authApi } from '../api/authApi';
import { offlineCacheService } from '../offline/cacheService';

export type { Household, HouseholdMember };

export const householdService = {
  async getMyHousehold(): Promise<Household> {
    const storedUser = authApi.getStoredUser();
    const fallbackResult = await offlineCacheService.getHouseholdWithFallback(storedUser?.id);
    if (fallbackResult.ok && fallbackResult.data.data) {
      return fallbackResult.data.data;
    }

    const authName = storedUser?.name || 'Citizen User';
    // Fallback demo household if user has not created one yet
    return {
      id: 'demo-household-1',
      householdCode: 'HH-DEMO-01',
      createdByUserId: storedUser?.id || 'demo-user',
      name: `${authName}'s Residence`,
      address: '14/B Koramangala 4th Block, 1st Cross',
      latitude: 12.9348,
      longitude: 77.6253,
      members: [
        { id: 'm-1', householdId: 'demo-household-1', name: authName, age: 42, relationship: 'Self', category: 'ADULT' },
        { id: 'm-2', householdId: 'demo-household-1', name: 'Anita Malhotra', age: 39, relationship: 'Spouse', category: 'ADULT' },
        { id: 'm-3', householdId: 'demo-household-1', name: 'Rohan Malhotra', age: 10, relationship: 'Child', category: 'CHILD' },
        { id: 'm-4', householdId: 'demo-household-1', name: 'Savitri Devi', age: 68, relationship: 'Parent', category: 'ELDERLY' },
      ],
    };
  },

  async getHousehold(id: string): Promise<Household> {
    return this.getMyHousehold();
  },

  async updateHousehold(id: string, data: Partial<Household>): Promise<Household> {
    try {
      await beforeApi.updateHousehold(id, {
        name: data.name,
        address: data.address,
        city: data.registeredHomeLocation?.city || 'Bengaluru',
        state: data.registeredHomeLocation?.state || 'Karnataka',
      });
    } catch (e) {
      console.warn('Backend household update warning:', e);
    }
    return this.getMyHousehold();
  },

  /**
   * Check if household-member setup/update has already been handled for this authenticated session.
   * Scoped to the specific authenticated user ID to guarantee strict multi-user isolation.
   */
  isHouseholdSetupHandled(userId?: string | null): boolean {
    if (!userId || typeof userId !== 'string') return false;
    try {
      return localStorage.getItem(`stride_household_handled_${userId}`) === 'true';
    } catch {
      return false;
    }
  },

  /**
   * Mark household-member setup/update as handled (or unhandled) for this authenticated session.
   */
  setHouseholdSetupHandled(userId?: string | null, handled: boolean = true): void {
    if (!userId || typeof userId !== 'string') return;
    try {
      if (handled) {
        localStorage.setItem(`stride_household_handled_${userId}`, 'true');
      } else {
        localStorage.removeItem(`stride_household_handled_${userId}`);
      }
    } catch {
      // Ignore quota or access errors
    }
  },

  /**
   * Clear household-member setup handled state for the specified user or all users (e.g. on logout).
   */
  clearHouseholdSetupHandled(userId?: string | null): void {
    try {
      if (userId && typeof userId === 'string') {
        localStorage.removeItem(`stride_household_handled_${userId}`);
      } else {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('stride_household_handled_')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      }
    } catch {
      // Ignore storage access errors
    }
  },

  async getOnboardingStatus(userId?: string): Promise<{ completed: boolean }> {
    const targetUserId = userId || authApi.getStoredUser()?.id;
    if (targetUserId && this.isHouseholdSetupHandled(targetUserId)) {
      return { completed: true };
    }

    try {
      const res = await beforeApi.getHouseholdOnboardingStatus();
      if (res && res.completed && targetUserId) {
        this.setHouseholdSetupHandled(targetUserId, true);
      }
      return res;
    } catch {
      // If network fails (offline), check if we have local cached household data with onboardingCompleted or members
      if (targetUserId) {
        try {
          const cached = await offlineCacheService.getHouseholdWithFallback(targetUserId);
          if (cached.ok && cached.data.data) {
            const cachedData = cached.data.data as any;
            const isCompleted = Boolean(
              cachedData.onboardingCompleted ||
              (cachedData.members && cachedData.members.length > 0)
            );
            if (isCompleted) {
              this.setHouseholdSetupHandled(targetUserId, true);
              return { completed: true };
            }
          }
        } catch {
          // Ignore cache read error
        }
      }
      return { completed: false };
    }
  },

  async completeOnboarding(userId?: string): Promise<{ success: boolean; completed: boolean }> {
    const targetUserId = userId || authApi.getStoredUser()?.id;
    if (targetUserId) {
      this.setHouseholdSetupHandled(targetUserId, true);
    }
    return beforeApi.completeHouseholdOnboarding();
  },

  async addMember(
    householdId: string,
    member: { name: string; age: number; relationship: string; category?: string }
  ): Promise<HouseholdMember> {
    return beforeApi.addMember(householdId, member);
  },

  async updateMember(
    householdId: string,
    memberId: string,
    data: Partial<HouseholdMember>
  ): Promise<HouseholdMember> {
    return beforeApi.updateMember(householdId, memberId, data);
  },

  async deleteMember(householdId: string, memberId: string): Promise<{ message: string }> {
    return beforeApi.deleteMember(householdId, memberId);
  },

  async getDisasterOccupancy(disasterId: string): Promise<any> {
    return beforeApi.getExpectedLocations(disasterId);
  },
};
