import React, { useState, useEffect, useMemo } from 'react';
import {
  Tent,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  ShieldAlert,
  ArrowUpRight,
  Filter,
  Play,
  Pause,
  PlusCircle,
  Phone,
  MapPin,
  Info,
} from 'lucide-react';

export interface ShelterOccupancy {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
  expectedArrivals: number;
  remainingCapacity: number;
  occupancyPercentage: number;
  contactNumber?: string;
  status: 'AVAILABLE' | 'NEAR_CAPACITY' | 'FULL' | 'OVER_CAPACITY';
}

interface ShelterCapacityBulletChartProps {
  activeDisasterId?: string | null;
  /** Custom polling interval in milliseconds. Default is 5000ms (5s) */
  pollingIntervalMs?: number;
  /** Optional initial data or overrides */
  initialData?: ShelterOccupancy[];
  /** Callback when user clicks on a shelter row */
  onSelectShelter?: (shelter: ShelterOccupancy) => void;
  /** Optional custom API fetcher for live shelter occupancy */
  fetchShelters?: (disasterId: string) => Promise<ShelterOccupancy[]>;
  className?: string;
}

const DEFAULT_SAMPLE_SHELTERS: ShelterOccupancy[] = [
  {
    id: 'sh-1',
    name: 'Govt Higher Secondary School (West Zone)',
    address: 'Sector 4, River Road Outpost',
    latitude: 13.0827,
    longitude: 80.2707,
    capacity: 500,
    expectedArrivals: 435,
    remainingCapacity: 65,
    occupancyPercentage: 87,
    contactNumber: '+91 94441 20110',
    status: 'NEAR_CAPACITY',
  },
  {
    id: 'sh-2',
    name: 'Community Center & Sports Hall (North)',
    address: 'Kalyan Nagar Ground, Gate 2',
    latitude: 13.0911,
    longitude: 80.2812,
    capacity: 350,
    expectedArrivals: 368,
    remainingCapacity: 0,
    occupancyPercentage: 105,
    contactNumber: '+91 94441 20112',
    status: 'OVER_CAPACITY',
  },
  {
    id: 'sh-3',
    name: 'Red Cross Relief Cantonment B',
    address: 'Highland Ridge Area, Block 12',
    latitude: 13.0754,
    longitude: 80.2619,
    capacity: 600,
    expectedArrivals: 290,
    remainingCapacity: 310,
    occupancyPercentage: 48,
    contactNumber: '+91 94441 20115',
    status: 'AVAILABLE',
  },
  {
    id: 'sh-4',
    name: 'St. Teresa Parish Relief Outpost',
    address: 'Church Road, Evacuation Point 3',
    latitude: 13.0688,
    longitude: 80.2541,
    capacity: 250,
    expectedArrivals: 185,
    remainingCapacity: 65,
    occupancyPercentage: 74,
    contactNumber: '+91 94441 20119',
    status: 'AVAILABLE',
  },
];

export const ShelterCapacityBulletChart: React.FC<ShelterCapacityBulletChartProps> = ({
  activeDisasterId,
  pollingIntervalMs = 5000,
  initialData,
  onSelectShelter,
  fetchShelters,
  className = '',
}) => {
  const [shelters, setShelters] = useState<ShelterOccupancy[]>(initialData || DEFAULT_SAMPLE_SHELTERS);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'CRITICAL' | 'CAPACITY' | 'NAME'>('CRITICAL');
  const [simulatedInflowCount, setSimulatedInflowCount] = useState<number>(0);
  const [isLiveApiConnected, setIsLiveApiConnected] = useState<boolean>(false);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      if (fetchShelters && activeDisasterId) {
        const liveList = await fetchShelters(activeDisasterId);
        if (Array.isArray(liveList) && liveList.length > 0) {
          setShelters(liveList);
          setIsLiveApiConnected(true);
        }
      }
    } catch {
      // Keep baseline on failure
    } finally {
      setLastSyncTime(new Date());
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [activeDisasterId]);

  useEffect(() => {
    if (!isLiveActive) return;
    const interval = setInterval(refreshData, pollingIntervalMs);
    return () => clearInterval(interval);
  }, [isLiveActive, activeDisasterId, pollingIntervalMs]);

  const handleSimulateInflow = () => {
    setShelters((prev) => {
      const idx = Math.floor(Math.random() * prev.length);
      const addition = Math.floor(Math.random() * 8) + 3;
      return prev.map((item, i) => {
        if (i !== idx) return item;
        const newArrivals = item.expectedArrivals + addition;
        const newRem = Math.max(0, item.capacity - newArrivals);
        const newPct = Math.round((newArrivals / item.capacity) * 100);
        let newStatus: ShelterOccupancy['status'] = 'AVAILABLE';
        if (newPct > 100) newStatus = 'OVER_CAPACITY';
        else if (newPct >= 85) newStatus = 'FULL';
        else if (newPct >= 70) newStatus = 'NEAR_CAPACITY';

        return {
          ...item,
          expectedArrivals: newArrivals,
          remainingCapacity: newRem,
          occupancyPercentage: newPct,
          status: newStatus,
        };
      });
    });
    setSimulatedInflowCount((c) => c + 1);
    setLastSyncTime(new Date());
  };

  const stats = useMemo(() => {
    const totalCapacity = shelters.reduce((acc, s) => acc + s.capacity, 0);
    const totalArrivals = shelters.reduce((acc, s) => acc + s.expectedArrivals, 0);
    const totalRemaining = Math.max(0, totalCapacity - totalArrivals);
    const overallPercentage = totalCapacity > 0 ? Math.round((totalArrivals / totalCapacity) * 100) : 0;
    const criticalCount = shelters.filter((s) => s.occupancyPercentage >= 85).length;
    const overCapacityCount = shelters.filter((s) => s.expectedArrivals > s.capacity).length;

    return {
      totalCapacity,
      totalArrivals,
      totalRemaining,
      overallPercentage,
      criticalCount,
      overCapacityCount,
    };
  }, [shelters]);

  const processedShelters = useMemo(() => {
    return shelters
      .filter((s) => {
        if (filterStatus === 'ALL') return true;
        if (filterStatus === 'CRITICAL') return s.occupancyPercentage >= 85;
        if (filterStatus === 'AVAILABLE') return s.occupancyPercentage < 70;
        if (filterStatus === 'WARNING') return s.occupancyPercentage >= 70 && s.occupancyPercentage < 85;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'CRITICAL') return b.occupancyPercentage - a.occupancyPercentage;
        if (sortBy === 'CAPACITY') return b.capacity - a.capacity;
        if (sortBy === 'NAME') return a.name.localeCompare(b.name);
        return 0;
      });
  }, [shelters, filterStatus, sortBy]);

  return (
    <div className={`w-full bg-white border border-[#C8D9E6]/70 rounded-3xl p-5 sm:p-7 shadow-sm text-[#2F4156] space-y-6 ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#C8D9E6]/60">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-xs">
            <Tent className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
                Shelter Inflow vs. Capacity
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Bullet Triage
              </span>
            </div>
            <p className="text-xs text-[#567C8D] flex items-center gap-2 mt-0.5">
              <span>Predictive logistics & real-time intake telemetry</span>
              <span className="inline-block w-1 h-1 rounded-full bg-slate-400" />
              <span className="flex items-center gap-1 font-semibold">
                <span className={`w-2 h-2 rounded-full ${isLiveActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                <span className={isLiveActive ? 'text-emerald-700' : 'text-slate-500'}>
                  {isLiveActive ? (isLiveApiConnected ? 'Live Database Sync' : 'Live Sync Active') : 'Paused'}
                </span>
              </span>
            </p>
          </div>
        </div>

        {/* Live Controls & Simulation Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateInflow}
            title="Simulate incoming civilian registrations"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#2F4156] hover:bg-[#1C2541] text-white shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Simulate Inflow</span>
            {simulatedInflowCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950 font-bold">
                +{simulatedInflowCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsLiveActive(!isLiveActive)}
            className={`p-2 rounded-xl border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
              isLiveActive
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-[#F5EFEB] border-[#C8D9E6] text-[#567C8D] hover:bg-white'
            }`}
            title={isLiveActive ? 'Pause auto-sync' : 'Resume auto-sync'}
          >
            {isLiveActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-[#C8D9E6] bg-[#F5EFEB] text-[#2F4156] hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
            title="Manual refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        <div className="bg-[#F5EFEB]/70 border border-[#C8D9E6]/70 rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#567C8D] flex items-center justify-between font-bold">
            <span>Total Capacity</span>
            <Users className="w-3.5 h-3.5 text-[#567C8D]" />
          </div>
          <div className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] mt-1">
            {stats.totalCapacity.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#567C8D] mt-0.5">Across {shelters.length} facilities</div>
        </div>

        <div className="bg-[#F5EFEB]/70 border border-[#C8D9E6]/70 rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-amber-700 flex items-center justify-between font-bold">
            <span>Expected Inflow</span>
            <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-amber-700 mt-1">
            {stats.totalArrivals.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#567C8D] mt-0.5">
            {stats.overallPercentage}% system occupancy
          </div>
        </div>

        <div className="bg-[#F5EFEB]/70 border border-[#C8D9E6]/70 rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-emerald-700 flex items-center justify-between font-bold">
            <span>Remaining Buffer</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-emerald-700 mt-1">
            {stats.totalRemaining.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#567C8D] mt-0.5">Available beds remaining</div>
        </div>

        <div
          className={`border rounded-2xl p-4 transition-colors ${
            stats.criticalCount > 0
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-[#F5EFEB]/70 border-[#C8D9E6]/70 text-[#2F4156]'
          }`}
        >
          <div className="text-[11px] uppercase tracking-wider flex items-center justify-between font-bold">
            <span>Overflow Alerts</span>
            <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
          </div>
          <div className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-red-700 mt-1">
            {stats.criticalCount}
          </div>
          <div className="text-[11px] text-[#567C8D] mt-0.5">
            {stats.overCapacityCount > 0
              ? `${stats.overCapacityCount} over capacity!`
              : 'Near threshold (≥85%)'}
          </div>
        </div>
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs text-[#567C8D]">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="flex items-center gap-1 text-[#567C8D] mr-1 font-bold">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          {(['ALL', 'CRITICAL', 'WARNING', 'AVAILABLE'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setFilterStatus(filter)}
              className={`px-3 py-1.5 rounded-xl transition-colors font-semibold cursor-pointer ${
                filterStatus === filter
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'bg-[#F5EFEB] hover:bg-white text-[#567C8D] border border-[#C8D9E6]'
              }`}
            >
              {filter === 'ALL'
                ? 'All'
                : filter === 'CRITICAL'
                ? 'Critical (≥85%)'
                : filter === 'WARNING'
                ? 'Warning (70-84%)'
                : 'Safe (<70%)'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="font-semibold text-[#567C8D]">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-[#F5EFEB] border border-[#C8D9E6] rounded-xl px-2.5 py-1.5 text-xs text-[#2F4156] font-semibold focus:outline-none focus:border-[#2F4156] cursor-pointer"
          >
            <option value="CRITICAL">Highest Inflow %</option>
            <option value="CAPACITY">Total Capacity</option>
            <option value="NAME">Shelter Name</option>
          </select>
        </div>
      </div>

      {/* Bullet Legend */}
      <div className="flex flex-wrap items-center gap-4 px-3.5 py-2.5 bg-[#F5EFEB]/50 rounded-xl border border-[#C8D9E6] text-[11px] text-[#567C8D]">
        <span className="font-bold text-[#2F4156]">Bullet Chart Reference:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-2 rounded-sm bg-emerald-500" />
          <span>Optimal (0–70%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-2 rounded-sm bg-amber-500" />
          <span>Caution (70–85%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-2 rounded-sm bg-rose-500" />
          <span>Critical (85–100%+)</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-1.5 h-3.5 bg-[#2F4156] rounded-sm" />
          <span className="font-bold text-[#2F4156]">Capacity Threshold (100%)</span>
        </div>
      </div>

      {/* Shelters Bullet List */}
      <div className="space-y-4">
        {processedShelters.length === 0 ? (
          <div className="text-center py-8 text-sm text-[#567C8D]">
            No shelters matching current filter.
          </div>
        ) : (
          processedShelters.map((shelter) => {
            const isOver = shelter.expectedArrivals > shelter.capacity;
            const isCritical = shelter.occupancyPercentage >= 85;
            const barWidthPercent = Math.min(100, shelter.occupancyPercentage);

            return (
              <div
                key={shelter.id}
                onClick={() => onSelectShelter && onSelectShelter(shelter)}
                className="group relative bg-[#F8FAFC] hover:bg-white border border-[#C8D9E6]/80 hover:border-[#567C8D] rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-xs"
              >
                {/* Top Row */}
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2.5">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-[#2F4156] group-hover:text-indigo-700 transition-colors">
                        {shelter.name}
                      </h4>
                      {isOver && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3 h-3" /> OVERFLOW ({shelter.expectedArrivals - shelter.capacity} over)
                        </span>
                      )}
                      {!isOver && isCritical && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          NEAR CAPACITY
                        </span>
                      )}
                      {!isOver && !isCritical && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          SAFE BUFFER
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[#567C8D] mt-1">
                      <span className="flex items-center gap-1 truncate max-w-[280px]">
                        <MapPin className="w-3 h-3 text-[#567C8D]" /> {shelter.address}
                      </span>
                      {shelter.contactNumber && (
                        <span className="hidden sm:flex items-center gap-1 text-[#567C8D]">
                          <Phone className="w-3 h-3 text-[#567C8D]" /> {shelter.contactNumber}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side numbers */}
                  <div className="text-right flex items-baseline gap-2">
                    <span className="text-lg font-bold text-[#2F4156] font-mono">
                      {shelter.expectedArrivals.toLocaleString()}
                    </span>
                    <span className="text-xs text-[#567C8D] font-mono">
                      / {shelter.capacity.toLocaleString()} max
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                        isOver
                          ? 'text-red-700 bg-red-50 border border-red-200'
                          : isCritical
                          ? 'text-amber-700 bg-amber-50 border border-amber-200'
                          : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                      }`}
                    >
                      {shelter.occupancyPercentage}%
                    </span>
                  </div>
                </div>

                {/* The Bullet Chart Bar */}
                <div className="relative w-full h-7 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center">
                  <div className="absolute top-0 bottom-0 left-0 w-[70%] bg-emerald-500/15 border-r border-emerald-500/30" />
                  <div className="absolute top-0 bottom-0 left-[70%] w-[15%] bg-amber-500/15 border-r border-amber-500/30" />
                  <div className="absolute top-0 bottom-0 left-[85%] w-[15%] bg-rose-500/15" />

                  {/* Target 100% Line Marker */}
                  <div
                    className="absolute top-0 bottom-0 right-0 w-1.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] z-10"
                    title="100% Maximum Shelter Capacity"
                  />

                  {/* Actual Measure Bar */}
                  <div
                    style={{
                      width: `${barWidthPercent}%`,
                      height: '18px',
                      background: isOver
                        ? 'linear-gradient(90deg, #dc2626 0%, #ef4444 60%, #f87171 100%)'
                        : isCritical
                        ? 'linear-gradient(90deg, #f59e0b 0%, #f97316 60%, #ef4444 100%)'
                        : 'linear-gradient(90deg, #059669 0%, #10b981 50%, #14b8a6 100%)',
                    }}
                    className={`rounded-r-md transition-all duration-500 ease-out shadow-md z-0 relative ml-0.5 ${
                      isOver ? 'animate-pulse' : ''
                    }`}
                  >
                    {isOver && (
                      <div className="absolute inset-0 bg-white/25 animate-pulse rounded-r-md" />
                    )}
                  </div>
                </div>

                {/* Under-bar metadata */}
                <div className="flex items-center justify-between text-[11px] text-[#567C8D] mt-1.5">
                  <div className="flex items-center gap-1.5">
                    {isOver ? (
                      <span className="text-red-600 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Exceeds safe occupancy limit. Authorities must redirect evacuees!
                      </span>
                    ) : (
                      <span>
                        <strong className="text-[#2F4156]">{shelter.remainingCapacity}</strong> open slots remaining
                      </span>
                    )}
                  </div>

                  <div className="text-[#567C8D] flex items-center gap-1 group-hover:text-indigo-600 transition-colors">
                    <span>View evacuation route</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-[#567C8D] pt-4 border-t border-[#C8D9E6]/60">
        <span className="flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          <span>Real-time aggregation from citizen disaster registration portal</span>
        </span>
        <span>
          Last updated: {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

export default ShelterCapacityBulletChart;
