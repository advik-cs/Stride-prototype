import React, { useState, useEffect } from 'react';
import { User } from '../../services/authService.ts';
import { DisasterEvent } from '../../services/disasterService.ts';
import { DuringTab } from '../layout/DashboardLayout.tsx';
import { analyticsService, OperationalAnalyticsSummary, ANALYTICS_DEMO_DISCLAIMER } from '../../services/analyticsService.ts';
import { shelterService, ShelterOccupancy } from '../../services/shelterService.ts';
import { BuildingAccountabilityChart } from './BuildingAccountabilityChart.tsx';
import { BuildingRiskMatrix } from './BuildingRiskMatrix.tsx';
import { ShelterCapacityBulletChart } from './ShelterCapacityBulletChart.tsx';
import { VulnerableDemographicsChart } from './VulnerableDemographicsChart.tsx';
import {
  CheckCircle2,
  AlertTriangle,
  LifeBuoy,
  Building2,
  Users,
  Tent,
  Activity,
  Crosshair,
  TrendingUp,
  RefreshCw,
  Layers,
  ShieldCheck,
  Radio,
} from 'lucide-react';

interface LiveAnalyticsViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onNavigateTab?: (tab: DuringTab) => void;
}

export const LiveAnalyticsView: React.FC<LiveAnalyticsViewProps> = ({
  user,
  activeDisaster,
  onNavigateTab,
}) => {
  const [activeTab, setActiveTab] = useState<'ACCOUNTABILITY' | 'RISK_MATRIX' | 'DEMOGRAPHICS' | 'SHELTERS'>('ACCOUNTABILITY');
  const [summary, setSummary] = useState<OperationalAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const isAuthority = user.role === 'AUTHORITY';
  const isRescuer = user.role === 'RESCUER';

  useEffect(() => {
    loadSummary();
    const interval = setInterval(loadSummary, 8000);
    return () => clearInterval(interval);
  }, [activeDisaster?.id]);

  const loadSummary = async () => {
    try {
      const data = await analyticsService.getSummary(activeDisaster?.id);
      setSummary(data);
      setLastRefreshed(new Date());
    } catch {
      // Keep state intact on network failure
    } finally {
      setLoading(false);
    }
  };

  // Safe live shelter fetcher passing to ShelterCapacityBulletChart
  const fetchLiveShelters = async (disasterId: string): Promise<ShelterOccupancy[]> => {
    return shelterService.getShelterOccupancy(disasterId);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            <span className="text-xs font-extrabold text-red-600 uppercase tracking-wider">
              Live Incident Operations
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
              {isAuthority ? '🏛️ Authority Command Intelligence' : '🚑 Rescuer Tactical Field Matrix'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight mt-1">
            📊 Live Analytics
          </h1>
          <p className="text-sm font-medium text-[#567C8D] mt-1">
            Disaster & Rescue Intelligence &mdash; Real-time civilian accountability, flood risk matrix, demographic logistics, and shelter capacity tracking.
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-2xl bg-white border border-[#C8D9E6] p-1 text-xs font-semibold shadow-xs gap-1">
            <button
              onClick={() => setActiveTab('ACCOUNTABILITY')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'ACCOUNTABILITY'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              Civilian Accountability
            </button>
            <button
              onClick={() => setActiveTab('RISK_MATRIX')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'RISK_MATRIX'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              Building Risk Matrix
            </button>
            <button
              onClick={() => setActiveTab('DEMOGRAPHICS')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'DEMOGRAPHICS'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              Vulnerable Demographics & Supply Logistics
            </button>
            <button
              onClick={() => setActiveTab('SHELTERS')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'SHELTERS'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              Shelter Inflow
            </button>
          </div>

          <button
            onClick={loadSummary}
            disabled={loading}
            className="p-2.5 rounded-2xl bg-white border border-[#C8D9E6] hover:bg-[#F5EFEB] text-[#2F4156] transition shadow-xs cursor-pointer"
            title="Refresh analytics telemetry"
          >
            <RefreshCw className={`w-4 h-4 text-[#567C8D] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Basin Headcount */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {summary?.headcount.resolvedPercentage ?? 64}% Resolved
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            Confirmed Safe
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-emerald-700">
              {summary?.headcount.confirmedSafe ? summary.headcount.confirmedSafe : 246}
            </span>
            <span className="text-xs text-[#567C8D]">
              / {summary?.headcount.totalExpected || 540} expected
            </span>
          </div>
        </div>

        {/* Card 2: Active Distress */}
        <div className="bg-white rounded-3xl p-5 border border-rose-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500" />
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
              {summary?.requests.criticalPriority ?? 14} Critical
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            In Active Distress
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-rose-700">
              {summary?.headcount.inDistress ? summary.headcount.inDistress : 67}
            </span>
            <span className="text-xs text-[#567C8D]">urgent extractions</span>
          </div>
        </div>

        {/* Card 3: Unaccounted Balance */}
        <div className="bg-white rounded-3xl p-5 border border-amber-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Search Target
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            Unaccounted Balance
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-amber-700">
              {summary?.headcount.unaccounted ? summary.headcount.unaccounted : 162}
            </span>
            <span className="text-xs text-[#567C8D]">pending verification</span>
          </div>
        </div>

        {/* Card 4: Shelter Capacity Buffer */}
        <div className="bg-white rounded-3xl p-5 border border-indigo-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500" />
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-700">
              <Tent className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
              {summary?.shelters.occupancyRate ?? 76}% Occupied
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            Shelter Safe Buffer
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              {summary?.shelters.remainingBuffer ? summary.shelters.remainingBuffer.toLocaleString() : '440'}
            </span>
            <span className="text-xs text-[#567C8D]">available beds</span>
          </div>
        </div>
      </div>

      {/* Main Graphs Content Area */}
      <main className="space-y-8">
        {/* INDIVIDUAL ANALYTICS VIEWS */}
        {activeTab === 'ACCOUNTABILITY' && (
          <BuildingAccountabilityChart />
        )}

        {activeTab === 'RISK_MATRIX' && (
          <BuildingRiskMatrix />
        )}

        {activeTab === 'DEMOGRAPHICS' && (
          <VulnerableDemographicsChart activeZone={activeDisaster?.title || 'Active Operational Basin'} />
        )}

        {activeTab === 'SHELTERS' && (
          <ShelterCapacityBulletChart
            activeDisasterId={activeDisaster?.id}
            pollingIntervalMs={5000}
            fetchShelters={fetchLiveShelters}
          />
        )}
      </main>

      {/* Ground Truth & Analytical Model Disclaimer */}
      <div className="p-4 rounded-2xl bg-[#F5EFEB]/80 border border-[#C8D9E6] text-xs text-[#567C8D] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <span>{ANALYTICS_DEMO_DISCLAIMER}</span>
        </div>
        <span className="text-[11px] font-mono text-[#567C8D]">
          Telemetry Synced: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

export default LiveAnalyticsView;
