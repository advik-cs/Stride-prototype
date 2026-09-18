import { request } from './apiClient.ts';

export const ANALYTICS_DEMO_DISCLAIMER =
  '⚠️ SIMULATED SENSOR & CASUALTY GROUND TRUTH: Advanced SAR delta backscatter and building headcount data are telemetry models developed for STRIDE situational intelligence.';

export interface OperationalAnalyticsSummary {
  status: string;
  timestamp: string;
  disaster: {
    id: string;
    title: string;
    type: string;
    alertLevel: string;
    status: string;
  } | null;
  headcount: {
    totalExpected: number;
    confirmedSafe: number;
    inDistress: number;
    unaccounted: number;
    resolvedPercentage: number;
  };
  requests: {
    total: number;
    pending: number;
    assigned: number;
    safelyRescued: number;
    notFound: number;
    criticalPriority: number;
    highPriority: number;
    moderatePriority: number;
  };
  shelters: {
    totalShelters: number;
    totalCapacity: number;
    totalExpectedArrivals: number;
    remainingBuffer: number;
    occupancyRate: number;
    criticalSheltersCount: number;
    list: Array<{
      id: string;
      name: string;
      address: string;
      capacity: number;
      expectedArrivals: number;
      remainingCapacity: number;
      occupancyPercentage: number;
      status: string;
    }>;
  };
  demographics: {
    totalRegistered: number;
    children: number;
    elderly: number;
    adults: number;
    disabled: number;
  };
}

export const analyticsService = {
  async getSummary(disasterId?: string): Promise<OperationalAnalyticsSummary> {
    const query = disasterId ? `?disasterId=${encodeURIComponent(disasterId)}` : '';
    return request<OperationalAnalyticsSummary>(`/analytics/summary${query}`);
  },
};
