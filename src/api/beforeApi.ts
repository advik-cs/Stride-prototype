import { BEFORE_API_BASE_URL, ApiError } from './config';

/**
 * Standard HTTP helper for BEFORE Backend
 */
async function beforeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('stride_before_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${BEFORE_API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const errors = json?.errors || json?.error?.details || json?.details;
      let msg = json?.message || json?.error?.message || json?.error || `Request failed with status ${res.status}`;
      if (Array.isArray(errors) && errors.length > 0) {
        const detailsStr = errors
          .map((e: any) => {
            if (typeof e === 'string') return e;
            const field = e.field || (Array.isArray(e.path) ? e.path.join('.') : e.path);
            return `${field ? `[${field}] ` : ''}${e.message || JSON.stringify(e)}`;
          })
          .join('; ');
        msg = `${msg}: ${detailsStr}`;
      }
      console.error(`[beforeApi] ${options.method || 'GET'} ${url} failed (${res.status}):`, { msg, errors, body: options.body });
      throw new ApiError(msg, res.status, errors);
    }

    // Unpack { success: true, data: ... } if present, otherwise return json
    return (json && json.data !== undefined ? json.data : json) as T;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || 'Network communication failure with BEFORE backend.', 0);
  }
}

export interface BeforeUser {
  id: string;
  name: string;
  mobileNumber: string;
  role: 'CITIZEN' | 'RESCUER';
  createdAt?: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  name: string;
  age: number;
  relationship: string;
  category: 'ADULT' | 'CHILD' | 'ELDERLY';
}

export interface ReconfirmationItemInput {
  householdMemberId: string;
  action: 'SAME_PLAN' | 'CHANGE_LOCATION' | 'NOT_SURE';
  expectedLocationType?: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN';
  shelterId?: string | null;
  otherCity?: string | null;
  notes?: string;
}

export interface BatchReconfirmationPayload {
  reconfirmations: ReconfirmationItemInput[];
}

export interface RegisteredHomeLocation {
  id: string;
  buildingNameOrNumber: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

export interface Household {
  id: string;
  householdCode: string;
  createdByUserId: string;
  registeredHomeLocationId?: string;
  registeredHomeLocation?: RegisteredHomeLocation;
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  members: HouseholdMember[];
  stats?: {
    totalMembers: number;
    adults: number;
    children: number;
    elderly: number;
  };
}

export interface DisasterEvent {
  id: string;
  type: 'FLOOD' | 'CYCLONE' | 'EARTHQUAKE' | 'LANDSLIDE' | 'OTHER';
  title: string;
  description: string;
  alertLevel: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  predictedStartTime: string;
  predictedEndTime: string;
  status: 'PREDICTED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  createdByUserId?: string;
  affectedZones?: any[];
}

export interface Shelter {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
  contactNumber: string;
  status: string;
}

export interface ShelterOccupancy extends Shelter {
  expectedArrivals: number;
  remainingCapacity: number;
  occupancyPercentage: number;
  status: 'AVAILABLE' | 'NEAR_CAPACITY' | 'FULL' | 'OVER_CAPACITY' | 'ACTIVE' | 'CLOSED';
}

export interface BuildingIntelligence {
  buildingName: string;
  address: string;
  latitude: number;
  longitude: number;
  isAffected: boolean;
  riskLevel: string;
  zoneName: string;
  registeredPopulation: number;
  adults: number;
  children: number;
  elderly: number;
  expectedHome: number;
  expectedShelter: number;
  expectedElsewhere: number;
  unknown: number;
  expectedOccupancy: number;
  confirmedSafe: number;
  inDistress: number;
  unaccounted: number;
  activeRequests: any[];
}

export const beforeApi = {
  // Auth
  async signup(data: {
    name: string;
    testIdentityNumber: string;
    mobileNumber: string;
    password?: string;
    role?: 'CITIZEN' | 'RESCUER';
  }) {
    return beforeRequest<{ token: string; user: BeforeUser }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        password: data.password || 'StrongPassword123!',
        role: data.role || 'CITIZEN',
      }),
    });
  },

  async login(data: { mobileNumber: string; password?: string }) {
    return beforeRequest<{ token: string; user: BeforeUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        mobileNumber: data.mobileNumber,
        password: data.password || 'StrongPassword123!',
      }),
    });
  },

  async getMe() {
    return beforeRequest<{ user: BeforeUser }>('/auth/me');
  },

  // Household
  async getMyHousehold(): Promise<Household | null> {
    try {
      const res = await beforeRequest<any>('/households/me');
      if (!res) return null;
      // Normalize location properties if flattened
      return {
        ...res,
        name: res.registeredHomeLocation?.buildingNameOrNumber || res.householdCode || 'My Home',
        address: res.registeredHomeLocation?.address || 'Registered Residence',
        latitude: res.registeredHomeLocation?.latitude || 13.0827,
        longitude: res.registeredHomeLocation?.longitude || 80.2707,
        members: res.members || [],
      };
    } catch {
      return null;
    }
  },

  async createHousehold(data: {
    buildingNameOrNumber: string;
    address: string;
    city?: string;
    state?: string;
    latitude: number;
    longitude: number;
    members?: Array<{ name: string; age: number; relationship: string }>;
  }) {
    return beforeRequest<Household>('/households', {
      method: 'POST',
      body: JSON.stringify({
        buildingNameOrNumber: data.buildingNameOrNumber,
        address: data.address,
        city: data.city || 'Chennai',
        state: data.state || 'Tamil Nadu',
        latitude: data.latitude,
        longitude: data.longitude,
        members: data.members || [],
      }),
    });
  },

  async addMember(householdId: string, member: { name: string; age: number; relationship: string }) {
    return beforeRequest<HouseholdMember>(`/households/${householdId}/members`, {
      method: 'POST',
      body: JSON.stringify(member),
    });
  },

  async updateMember(householdId: string, memberId: string, data: Partial<HouseholdMember>) {
    return beforeRequest<HouseholdMember>(`/households/${householdId}/members/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteMember(householdId: string, memberId: string) {
    return beforeRequest<{ message: string }>(`/households/${householdId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },

  async updateHousehold(householdId: string, data: { name?: string; address?: string; city?: string; state?: string }) {
    return beforeRequest<Household>(`/households/${householdId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getHouseholdOnboardingStatus(): Promise<{ completed: boolean }> {
    try {
      return await beforeRequest<{ completed: boolean }>('/households/onboarding-status');
    } catch {
      try {
        return await beforeRequest<{ completed: boolean }>('/citizen/onboarding-status');
      } catch {
        return { completed: false };
      }
    }
  },

  async completeHouseholdOnboarding(): Promise<{ success: boolean; completed: boolean }> {
    try {
      return await beforeRequest<{ success: boolean; completed: boolean }>('/households/onboarding-complete', {
        method: 'POST',
      });
    } catch {
      try {
        return await beforeRequest<{ success: boolean; completed: boolean }>('/citizen/onboarding-complete', {
          method: 'POST',
        });
      } catch {
        return { success: false, completed: false };
      }
    }
  },

  // Disasters
  async getDisasters(): Promise<DisasterEvent[]> {
    return beforeRequest<DisasterEvent[]>('/disasters');
  },

  async getDisasterById(id: string): Promise<DisasterEvent> {
    return beforeRequest<DisasterEvent>(`/disasters/${id}`);
  },

  async createDisaster(data: Partial<DisasterEvent>): Promise<DisasterEvent> {
    return beforeRequest<DisasterEvent>('/disasters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getZones(disasterId: string) {
    return beforeRequest<any[]>(`/disasters/${disasterId}/zones`);
  },

  async addZone(disasterId: string, data: any) {
    return beforeRequest<any>(`/disasters/${disasterId}/zones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getZoneSummary(disasterId: string) {
    return beforeRequest<any>(`/disasters/${disasterId}/zone-summary`);
  },

  // Shelters
  async getShelters(): Promise<Shelter[]> {
    const res = await beforeRequest<any>('/shelters');
    const list = Array.isArray(res) ? res : (res?.shelters || []);
    return list.map((s: any) => ({
      id: s.id || s.shelterId,
      name: s.name || 'Shelter',
      address: s.address || '',
      latitude: Number(s.latitude) || 13.08,
      longitude: Number(s.longitude) || 80.27,
      capacity: Number(s.capacity) || 0,
      contactNumber: s.contactNumber || '',
      status: s.status || 'AVAILABLE',
    }));
  },

  async createShelter(data: Partial<Shelter>): Promise<Shelter> {
    return beforeRequest<Shelter>('/shelters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateShelter(id: string, data: Partial<Shelter>): Promise<Shelter> {
    return beforeRequest<Shelter>(`/shelters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getShelterOccupancy(disasterId: string): Promise<ShelterOccupancy[]> {
    const data = await beforeRequest<any>(`/disasters/${disasterId}/shelter-occupancy`);
    const list = Array.isArray(data) ? data : (data?.shelters || []);
    return list.map((s: any) => ({
      id: s.id || s.shelterId,
      name: s.name || 'Shelter',
      address: s.address || '',
      latitude: Number(s.latitude) || 13.08,
      longitude: Number(s.longitude) || 80.27,
      capacity: Number(s.capacity) || 0,
      contactNumber: s.contactNumber || '',
      expectedArrivals: Number(s.expectedArrivals ?? s.expectedCount ?? 0),
      remainingCapacity: Number(s.remainingCapacity ?? Math.max(0, (s.capacity || 0) - (s.expectedArrivals || 0))),
      occupancyPercentage: Number(s.occupancyPercentage ?? s.occupancyRatePercent ?? 0),
      status: s.status || 'AVAILABLE',
    }));
  },

  // Expected Locations
  async getExpectedLocations(disasterId: string): Promise<any[]> {
    const raw = await beforeRequest<any>(`/disasters/${disasterId}/expected-locations`);
    const list = Array.isArray(raw) ? raw : (raw?.plans || []);
    return list.map((item: any) => ({
      ...item,
      householdMemberId: item.householdMemberId || item.memberId,
      expectedLocationType: item.expectedLocationType || item.expectedType || 'HOME',
      expectedType: item.expectedLocationType || item.expectedType || 'HOME',
    }));
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
  ) {
    const locList = locations.map((loc) => {
      const memberId = loc.memberId || loc.householdMemberId;
      const rawType = (loc.expectedType || loc.expectedLocationType || 'HOME') as string;
      const expectedType = rawType === 'NOT_SURE' ? 'UNKNOWN' : rawType;

      const item: any = {
        memberId,
        householdMemberId: memberId,
        expectedType,
        expectedLocationType: expectedType,
      };

      if (expectedType === 'SHELTER') {
        if (loc.shelterId) {
          item.shelterId = loc.shelterId;
        }
      } else if (expectedType === 'OTHER_CITY') {
        item.otherCity = (loc.otherCity && loc.otherCity.trim()) || 'Outside Affected Area';
      }

      return item;
    });

    return beforeRequest<any>(`/disasters/${disasterId}/expected-locations`, {
      method: 'POST',
      body: JSON.stringify({ locations: locList }),
    });
  },

  // Reconfirmation (30h)
  async getMyReconfirmationStatus(disasterId: string) {
    return beforeRequest<any>(`/disasters/${disasterId}/reconfirmation/my-status`);
  },

  async getReconfirmationsStatus(disasterId: string) {
    return beforeRequest<any>(`/disasters/${disasterId}/reconfirmations/status`);
  },

  async submitReconfirmation(
    disasterId: string,
    payload: BatchReconfirmationPayload | ReconfirmationItemInput[]
  ) {
    const body = Array.isArray(payload) ? { reconfirmations: payload } : payload;
    return beforeRequest<any>(`/disasters/${disasterId}/reconfirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Buildings Census
  async getBuildingIntelligence(disasterId: string): Promise<BuildingIntelligence[]> {
    const raw = await beforeRequest<any>(`/disasters/${disasterId}/buildings`);
    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.buildings)
      ? raw.buildings
      : Array.isArray(raw?.data?.buildings)
      ? raw.data.buildings
      : [];

    return list.map((b) => ({
      buildingName: b.buildingNameOrNumber || b.buildingName || b.name || 'Structure',
      address: b.address || '',
      latitude: b.latitude || 12.9716,
      longitude: b.longitude || 77.5946,
      isAffected: Boolean(b.affectedZoneInfo?.isAffected ?? b.isAffected),
      riskLevel: b.affectedZoneInfo?.highestAlertLevel || b.riskLevel || (b.affectedZoneInfo?.isAffected ? 'HIGH' : 'SAFE'),
      zoneName: b.affectedZoneInfo?.zones?.[0]?.zoneName || b.zoneName || (b.affectedZoneInfo?.isAffected ? 'Danger Zone' : 'Safe Area'),
      registeredPopulation: b.registeredPopulation ?? b.totalMembers ?? 0,
      adults: b.adults ?? 0,
      children: b.children ?? 0,
      elderly: b.elderly ?? 0,
      expectedHome: b.expectedHomeOccupancy ?? b.expectedHome ?? b.expectedOccupancy ?? 0,
      expectedShelter: b.expectedShelterPopulation ?? b.expectedShelter ?? 0,
      expectedElsewhere: b.expectedOtherCityPopulation ?? b.expectedElsewhere ?? 0,
      unknown: b.unknownPopulation ?? b.unknown ?? 0,
      expectedOccupancy: b.expectedHomeOccupancy ?? b.expectedOccupancy ?? b.expectedHome ?? 0,
      confirmedSafe: b.confirmedSafe ?? 0,
      inDistress: b.inDistress ?? 0,
      unaccounted: b.unaccounted !== undefined
        ? b.unaccounted
        : Math.max(0, (b.registeredPopulation ?? 0) - (b.confirmedSafe ?? 0) - (b.inDistress ?? 0)),
      activeRequests: b.activeRequests || [],
    }));
  },

  // Maps & Facilities
  async getCitizenMap(disasterId?: string) {
    return beforeRequest<any>(`/map/citizen${disasterId ? `?disasterId=${disasterId}` : ''}`);
  },

  async getRescuerMap(disasterId?: string) {
    return beforeRequest<any>(`/map/rescuer${disasterId ? `?disasterId=${disasterId}` : ''}`);
  },

  async getFacilities(type?: string) {
    return beforeRequest<any[]>(`/facilities${type ? `?type=${type}` : ''}`);
  },

  // Notifications
  async getNotifications() {
    return beforeRequest<any[]>('/notifications');
  },

  async markNotificationRead(id: string) {
    return beforeRequest<any>(`/notifications/${id}/read`, { method: 'PUT' });
  },
};
