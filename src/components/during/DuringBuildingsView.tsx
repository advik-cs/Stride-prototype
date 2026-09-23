import React, { useState, useEffect } from 'react';
import { disasterService, BuildingIntelligence, DisasterEvent } from '../../services/disasterService.ts';
import { User } from '../../services/authService.ts';
import {
  Building2,
  Users,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  MapPin,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface DuringBuildingsViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onSelectBuildingForRescue?: (building: BuildingIntelligence) => void;
}

export const DuringBuildingsView: React.FC<DuringBuildingsViewProps> = ({
  user,
  activeDisaster,
  onSelectBuildingForRescue,
}) => {
  const [buildings, setBuildings] = useState<BuildingIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'DISTRESS' | 'SAFE'>('ALL');

  useEffect(() => {
    loadBuildings();
    const interval = setInterval(loadBuildings, 6000);
    return () => clearInterval(interval);
  }, [activeDisaster?.id]);

  const loadBuildings = async () => {
    if (!activeDisaster) return;
    try {
      const list = await disasterService.getBuildingIntelligence(activeDisaster.id);
      setBuildings(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = buildings.filter((b) => {
    const matchesSearch =
      b.buildingName.toLowerCase().includes(search.toLowerCase()) ||
      b.address.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (filter === 'DISTRESS') return b.inDistress > 0;
    if (filter === 'SAFE') return b.inDistress === 0 && b.confirmedSafe > 0;
    return true;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
            Building Situational Intelligence
          </h1>
          <p className="text-sm font-medium text-[#567C8D] mt-1">
            Combines pre-disaster expected occupancy with active safety reports. Structures requiring
            immediate response are highlighted in Red.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 text-[#567C8D] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search building address..."
              className="w-full sm:w-auto pl-9 pr-4 py-2.5 min-h-[44px] lg:min-h-0 lg:py-2 rounded-xl bg-white border border-[#C8D9E6] text-xs font-semibold text-[#2F4156] outline-none"
            />
          </div>

          <div className="p-1 rounded-xl bg-white border border-[#C8D9E6] flex items-center text-xs font-semibold overflow-x-auto no-scrollbar max-w-full">
            {(['ALL', 'DISTRESS', 'SAFE'] as const).map((mode) => (
              <button
                key={mode}
                id={`filter-buildings-${mode.toLowerCase()}`}
                type="button"
                onClick={() => setFilter(mode)}
                className={`px-3 py-2 min-h-[44px] lg:min-h-0 lg:py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  filter === mode
                    ? mode === 'DISTRESS'
                      ? 'bg-red-600 text-white font-bold'
                      : 'bg-[#2F4156] text-white font-bold'
                    : 'text-[#567C8D] hover:text-[#2F4156]'
                }`}
              >
                {mode === 'ALL'
                  ? 'All Buildings'
                  : mode === 'DISTRESS'
                  ? '⚠️ In Distress'
                  : '🟢 Safe'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid of Buildings */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((b, idx) => {
          const hasDistress = b.inDistress > 0;

          return (
            <div
              key={idx}
              className={`bg-white rounded-3xl p-5 sm:p-6 border shadow-sm hover:shadow-md transition flex flex-col justify-between ${
                hasDistress
                  ? 'border-red-500 ring-2 ring-red-200'
                  : 'border-[#C8D9E6]/70'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                        hasDistress
                          ? 'bg-red-50 text-red-600'
                          : 'bg-[#C8D9E6]/30 text-[#2F4156]'
                      }`}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#2F4156] leading-tight">
                        {b.buildingName}
                      </h3>
                      <p className="text-xs text-[#567C8D] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span>{b.address}</span>
                      </p>
                    </div>
                  </div>

                  {hasDistress ? (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-red-600 text-white flex-shrink-0 flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-3 h-3" />
                      CRITICAL
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 flex-shrink-0">
                      SECURE
                    </span>
                  )}
                </div>

                {/* BEFORE vs DURING comparative metrics */}
                <div className="mt-5 p-4 rounded-2xl bg-[#F5EFEB] border border-[#C8D9E6]/60">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-[#567C8D] font-bold uppercase text-[10px]">
                      BEFORE: Pre-disaster Occupancy
                    </span>
                    <span className="font-bold text-[#2F4156]">
                      {b.expectedOccupancy} Staying at Home
                    </span>
                  </div>
                  <div className="text-[11px] text-[#567C8D] flex items-center justify-between pt-1 border-t border-[#C8D9E6]/40">
                    <span>Registered Total: {b.registeredPopulation}</span>
                    <span>Shelter: {b.expectedShelter}</span>
                    <span>Elsewhere: {b.expectedElsewhere}</span>
                  </div>
                </div>

                {/* DURING Live Status 3 Metrics */}
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] font-bold uppercase text-emerald-800">
                      Safe
                    </span>
                    <p className="text-xl font-bold font-['Space_Grotesk',sans-serif] text-emerald-700 mt-0.5">
                      {b.confirmedSafe}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-red-50 border border-red-200">
                    <span className="text-[10px] font-bold uppercase text-red-800">
                      Distress
                    </span>
                    <p className="text-xl font-bold font-['Space_Grotesk',sans-serif] text-red-600 mt-0.5">
                      {b.inDistress}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200">
                    <span className="text-[10px] font-bold uppercase text-gray-700">
                      Unchecked
                    </span>
                    <p className="text-xl font-bold font-['Space_Grotesk',sans-serif] text-gray-800 mt-0.5">
                      {b.unaccounted}
                    </p>
                  </div>
                </div>

                {/* Active Distress Condition List if any */}
                {b.activeRequests && b.activeRequests.length > 0 && (
                  <div className="mt-4 p-3 rounded-2xl bg-red-50/70 border border-red-200 text-xs">
                    <p className="text-[11px] font-bold text-red-900 mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      Active Distress Calls ({b.activeRequests.length}):
                    </p>
                    <div className="space-y-1">
                      {b.activeRequests.map((req: any) => (
                        <div
                          key={req.id}
                          className="text-[11px] text-red-800 bg-white/80 p-1.5 rounded-lg border border-red-200 flex items-center justify-between"
                        >
                          <span className="font-semibold truncate max-w-[120px] xs:max-w-[140px] sm:max-w-[160px]">
                            {req.description || 'Assistance requested'}
                          </span>
                          <span className="font-extrabold px-1.5 py-0.2 rounded bg-red-600 text-white text-[10px]">
                            Score: {req.priorityScore}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Bottom */}
              <div className="mt-6 pt-3 border-t border-[#F5EFEB] flex items-center justify-between text-[11px] text-[#567C8D]">
                <span>Risk: {b.riskLevel}</span>
                <span className="font-bold text-[#2F4156]">{b.zoneName}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
