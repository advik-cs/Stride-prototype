import React, { useState, useEffect } from 'react';
import { DisasterEvent } from '../../services/disasterService.ts';
import { householdService, Household } from '../../services/householdService.ts';
import { shelterService, ShelterOccupancy } from '../../services/shelterService.ts';
import { User } from '../../services/authService.ts';
import { BeforeTab } from '../layout/DashboardLayout.tsx';
import {
  Users,
  Tent,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Shield,
  MapPin,
  Clock,
  Building2,
  ExternalLink,
  Activity,
} from 'lucide-react';

interface BeforeDashboardViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onNavigateTab: (tab: BeforeTab) => void;
}

export const BeforeDashboardView: React.FC<BeforeDashboardViewProps> = ({
  user,
  activeDisaster,
  onNavigateTab,
}) => {
  const [household, setHousehold] = useState<Household | null>(null);
  const [shelters, setShelters] = useState<ShelterOccupancy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeDisaster?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const hh = await householdService.getMyHousehold().catch(() => null);
      if (hh) setHousehold(hh);

      if (activeDisaster) {
        const sList = await shelterService.getShelterOccupancy(activeDisaster.id).catch(() => []);
        setShelters(sList);
      }
    } finally {
      setLoading(false);
    }
  };

  const totalMembers = household?.members?.length || 0;
  const adults = household?.members?.filter((m) => m.category === 'ADULT').length || 0;
  const children = household?.members?.filter((m) => m.category === 'CHILD').length || 0;
  const elderly = household?.members?.filter((m) => m.category === 'ELDERLY').length || 0;
  const isAuthority = user.role === 'AUTHORITY';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
          Before Disaster
        </h1>
        <p className="text-sm font-medium text-[#567C8D] mt-1">
          Prepare, plan and stay informed.
        </p>
      </div>

      {/* Active Threat Alert Banner */}
      {activeDisaster && (
        <div className="bg-white rounded-3xl p-6 border border-[#C8D9E6] shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-red-600" />
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0 text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-600 text-white tracking-wider">
                  {activeDisaster.alertLevel} ALERT
                </span>
                <span className="text-xs font-semibold text-[#567C8D]">
                  {activeDisaster.type} EVENT
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#2F4156] mt-1">
                {activeDisaster.title}
              </h2>
              <p className="text-xs text-[#567C8D] mt-1 max-w-2xl leading-relaxed">
                {activeDisaster.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-center">
            <button
              type="button"
              onClick={() => onNavigateTab('threats')}
              className="px-4 py-2 rounded-xl bg-[#F5EFEB] hover:bg-[#C8D9E6]/30 text-xs font-bold text-[#2F4156] transition flex items-center gap-1.5"
            >
              <span>Threat Intel</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {!isAuthority && (
              <button
                type="button"
                onClick={() => onNavigateTab('reconfirmation')}
                className="px-4 py-2 rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <span>Reconfirm Plan</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#C8D9E6]" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAuthority ? 'lg:grid-cols-4' : 'lg:grid-cols-3 xl:grid-cols-5'} gap-6`}>
        {/* Card 1: Registered Household (NON-AUTHORITY ONLY) */}
        {!isAuthority && (
          <div className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/60 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#C8D9E6]/30 flex items-center justify-center text-[#2F4156]">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Verified
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
              Registered Household
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                {totalMembers}
              </span>
              <span className="text-xs font-semibold text-[#567C8D]">Members</span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F5EFEB] flex items-center justify-between text-[11px] text-[#567C8D]">
              <span>{adults} Adults</span>
              <span>{children} Children</span>
              <span>{elderly} Elderly</span>
            </div>
          </div>
        )}

        {/* Card 2: 5km Radius Readiness */}
        <div className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/60 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#567C8D]/15 flex items-center justify-center text-[#567C8D]">
              <MapPin className="w-5 h-5" />
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('map')}
              className="text-[11px] font-bold text-[#567C8D] hover:text-[#2F4156] flex items-center gap-1"
            >
              Open Map <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            Geographic Coverage
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              5.0
            </span>
            <span className="text-xs font-semibold text-[#567C8D]">km Radius Scope</span>
          </div>
          <div className="mt-4 pt-3 border-t border-[#F5EFEB] text-[11px] text-[#567C8D] flex items-center justify-between">
            <span>{isAuthority ? 'Coverage: Sector Jurisdiction' : `Home: ${household?.name || 'Registered Home'}`}</span>
            <span className="text-[#2F4156] font-bold">Active</span>
          </div>
        </div>

        {/* Card 3: Shelters Status */}
        <div className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/60 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#F5EFEB] flex items-center justify-center text-[#2F4156]">
              <Tent className="w-5 h-5" />
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('shelters')}
              className="text-[11px] font-bold text-[#567C8D] hover:text-[#2F4156] flex items-center gap-1"
            >
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            Shelter Information
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              {shelters.length || 4}
            </span>
            <span className="text-xs font-semibold text-[#567C8D]">Safe Centers</span>
          </div>
          <div className="mt-4 pt-3 border-t border-[#F5EFEB] text-[11px] text-[#567C8D] flex items-center justify-between">
            <span>Available: {shelters.filter((s) => s.status === 'AVAILABLE').length}</span>
            <span className="text-amber-600 font-bold">
              Near full: {shelters.filter((s) => s.status === 'NEAR_CAPACITY' || s.status === 'OVER_CAPACITY').length}
            </span>
          </div>
        </div>

        {/* Card: Hospital Information (ALL ROLES) */}
        <div className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/60 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <Activity className="w-5 h-5" />
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('hospitals')}
              className="text-[11px] font-bold text-[#567C8D] hover:text-[#2F4156] flex items-center gap-1"
            >
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            Hospital Information
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              10
            </span>
            <span className="text-xs font-semibold text-[#567C8D]">Medical Facilities</span>
          </div>
          <div className="mt-4 pt-3 border-t border-[#F5EFEB] text-[11px] text-[#567C8D] flex items-center justify-between">
            <span>24/7 Emergency Care</span>
            <span className="text-emerald-700 font-bold">
              Active Trauma
            </span>
          </div>
        </div>

        {/* Card 4: Reconfirmation Window (CITIZEN ONLY) */}
        {!isAuthority && (
          <div className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/60 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#C8D9E6]/40 flex items-center justify-center text-[#2F4156]">
                <Clock className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('reconfirmation')}
                className="text-[11px] font-bold text-[#567C8D] hover:text-[#2F4156] flex items-center gap-1"
              >
                Verify <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
              30-Hour Window
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                18h
              </span>
              <span className="text-xs font-semibold text-[#567C8D]">Until Forecast</span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F5EFEB] text-[11px] text-[#567C8D] flex items-center justify-between">
              <span>Plan: Recorded</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            </div>
          </div>
        )}

        {/* Card 4 (Authority Alternative): Monitored Buildings */}
        {isAuthority && (
          <div className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/60 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#C8D9E6]/40 flex items-center justify-center text-[#2F4156]">
                <Building2 className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('occupancy')}
                className="text-[11px] font-bold text-[#567C8D] hover:text-[#2F4156] flex items-center gap-1"
              >
                View <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
              Monitored Buildings
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                16
              </span>
              <span className="text-xs font-semibold text-[#567C8D]">Structures</span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F5EFEB] text-[11px] text-[#567C8D] flex items-center justify-between">
              <span>793 Registered Residents</span>
              <span className="text-emerald-700 font-bold">Active</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Action Navigation Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Preparedness Action Roadmap */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#C8D9E6]/60 shadow-sm">
          <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] mb-1">
            {isAuthority ? 'Authority Preparedness Actions' : 'Household Preparedness Checklist'}
          </h3>
          <p className="text-xs text-[#567C8D] mb-6">
            {isAuthority
              ? 'Review safe shelter information and monitor building occupancy.'
              : "Ensure your family's evacuation plan is updated before the disaster onset."}
          </p>

          <div className="space-y-3">
            {!isAuthority && (
              <div
                className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/70 flex items-center justify-between transition"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#2F4156]">
                      1. Household Safety Plan Registered
                    </h4>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      Completed during initial onboarding
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
                  Completed
                </span>
              </div>
            )}

            <div
              onClick={() => onNavigateTab('shelters')}
              className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-[#F5EFEB] border border-[#C8D9E6]/40 flex items-center justify-between cursor-pointer transition"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#2F4156] shadow-sm">
                  <Tent className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#2F4156]">
                    {isAuthority ? '1. Review Shelter Information & Capacities' : '2. Check Designated Shelter Capacities'}
                  </h4>
                  <p className="text-[11px] text-[#567C8D]">
                    {isAuthority
                      ? 'Review safe shelter capacities, operational status, and available beds'
                      : 'Find safe shelters with available beds before they become full'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#567C8D]" />
            </div>

            <div
              onClick={() => onNavigateTab('hospitals')}
              className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-[#F5EFEB] border border-[#C8D9E6]/40 flex items-center justify-between cursor-pointer transition"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-red-600 shadow-sm">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#2F4156]">
                    {isAuthority ? '2. Review Hospital & Medical Network' : '3. Check Nearby Hospital Information'}
                  </h4>
                  <p className="text-[11px] text-[#567C8D]">
                    {isAuthority
                      ? 'Review hospital locations, bed telemetry, and emergency departments'
                      : 'Explore nearby hospitals, emergency readiness, and doctor availability before onset'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#567C8D]" />
            </div>

            {!isAuthority ? (
              <div
                onClick={() => onNavigateTab('reconfirmation')}
                className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-[#F5EFEB] border border-[#C8D9E6]/40 flex items-center justify-between cursor-pointer transition"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#2F4156] shadow-sm">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#2F4156]">
                      4. Reconfirm 30-Hour Location Status
                    </h4>
                    <p className="text-[11px] text-[#567C8D]">
                      Validate that your emergency intentions have not changed
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#567C8D]" />
              </div>
            ) : (
              <div
                onClick={() => onNavigateTab('occupancy')}
                className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-[#F5EFEB] border border-[#C8D9E6]/40 flex items-center justify-between cursor-pointer transition"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#2F4156] shadow-sm">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#2F4156]">
                      3. Inspect Expected Building Occupancy
                    </h4>
                    <p className="text-[11px] text-[#567C8D]">
                      Monitor structural census, population distribution, and shelter demand
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#567C8D]" />
              </div>
            )}
          </div>
        </div>

        {/* Panel 2: Live Sensor & Zone Intelligence */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#C8D9E6]/60 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                Zone Sensor Intelligence
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#567C8D]/10 text-[#567C8D]">
                Real-time Trend
              </span>
            </div>
            <p className="text-xs text-[#567C8D] mb-6">
              Basin Delta Inundation Sector A • Sensor telemetry trend analysis
            </p>

            {/* Sensor Metric Rows */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-[#2F4156]">River Gauge Level (Basin Causeway)</span>
                  <span className="text-red-600 font-bold">4.8m (Warning: 5.0m)</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#F5EFEB] overflow-hidden">
                  <div className="h-full rounded-full bg-red-500 w-[85%]" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-[#2F4156]">Precipitation Rate (Next 12h)</span>
                  <span className="text-amber-600 font-bold">34 mm/hr</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#F5EFEB] overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500 w-[65%]" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-[#2F4156]">
                    {isAuthority ? 'Community Evacuation Readiness' : 'Community Reconfirmation Response'}
                  </span>
                  <span className="text-[#567C8D] font-bold">78% Verified</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#F5EFEB] overflow-hidden">
                  <div className="h-full rounded-full bg-[#567C8D] w-[78%]" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-[#F5EFEB] flex items-center justify-between">
            <span className="text-xs text-[#567C8D]">
              STRIDE telemetry model calibrated for coastal flood patterns
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('occupancy')}
              className="text-xs font-bold text-[#2F4156] hover:underline flex items-center gap-1"
            >
              Building Occupancy <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function ChevronRight(props: any) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
