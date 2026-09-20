import { beforeApi, Household, HouseholdMember } from '../api/beforeApi';
import { authApi } from '../api/authApi';

export type { Household, HouseholdMember };

export const householdService = {
  async getMyHousehold(): Promise<Household> {
    const hh = await beforeApi.getMyHousehold();
    if (!hh) {
      const storedUser = authApi.getStoredUser();
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
    }
    return hh;
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

  async getOnboardingStatus(): Promise<{ completed: boolean }> {
    return beforeApi.getHouseholdOnboardingStatus();
  },

  async completeOnboarding(): Promise<{ success: boolean; completed: boolean }> {
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
