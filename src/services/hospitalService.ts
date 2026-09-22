import { request } from './apiClient.ts';
import { offlineCacheService } from '../offline/cacheService';

export const DEMO_DATA_DISCLAIMER =
  '⚠️ DEMO DATA: Bed and doctor availability is simulated for the STRIDE prototype and does not represent live hospital capacity.';

export interface HospitalDoctor {
  name: string;
  speciality: string;
  onDuty: boolean;
  contact?: string;
}

export interface Hospital {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contactNumber: string;
  totalBeds: number;
  availableBeds: number; // Demo simulated
  icuBedsTotal: number;
  icuBedsAvailable: number; // Demo simulated
  emergencyDepartmentAvailable: boolean; // Demo simulated
  emergencyStatusText: string;
  specialities: string[];
  doctors: HospitalDoctor[]; // Demo simulated
  facilityType: 'HOSPITAL';
  disclaimer: string;
  distanceKm?: number;
  isWithinCitizenPerimeter?: boolean;
}

export interface HospitalListResponse {
  role: 'CITIZEN' | 'AUTHORITY' | 'RESCUER';
  userLocation: { latitude: number; longitude: number } | null;
  scope: 'CITIZEN_LOCAL' | 'JURISDICTION_WIDE';
  totalCount: number;
  disclaimer: string;
  hospitals: Hospital[];
}

export const hospitalService = {
  async getHospitals(options?: {
    lat?: number;
    lng?: number;
    radiusKm?: number;
    scope?: 'local' | 'all';
  }): Promise<HospitalListResponse> {
    const res = await offlineCacheService.getHospitalsWithFallback(options);
    if (res.ok) {
      return res.data.data;
    }
    const params = new URLSearchParams();
    if (options?.lat !== undefined) params.set('lat', String(options.lat));
    if (options?.lng !== undefined) params.set('lng', String(options.lng));
    if (options?.radiusKm !== undefined) params.set('radiusKm', String(options.radiusKm));
    if (options?.scope) params.set('scope', options.scope);

    const qs = params.toString();
    return request<HospitalListResponse>(`/hospitals${qs ? `?${qs}` : ''}`);
  },

  async getHospitalById(
    id: string,
    options?: { lat?: number; lng?: number }
  ): Promise<Hospital> {
    const params = new URLSearchParams();
    if (options?.lat !== undefined) params.set('lat', String(options.lat));
    if (options?.lng !== undefined) params.set('lng', String(options.lng));

    const qs = params.toString();
    return request<Hospital>(`/hospitals/${id}${qs ? `?${qs}` : ''}`);
  },
};
