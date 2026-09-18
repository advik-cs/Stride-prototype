import React, { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import {
  CheckCircle2,
  Building2,
  RotateCcw,
  Sparkles,
  HeartPulse,
  PhoneCall,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';

export interface BuildingHeadcountRecord {
  id: string;
  buildingName: string;
  address: string;
  zoneName: string;
  expectedOccupancy: number;
  confirmedSafe: number;
  rescued: number;
  inDistress: number;
  unaccounted: number;
  priorityScore: number;
  vulnerabilities: {
    elderly: number;
    children: number;
    disabled: number;
    medicalUrgent: boolean;
  };
  lastCheckin: string;
}

const INITIAL_RECORDS: BuildingHeadcountRecord[] = [
  {
    id: 'BLD-401',
    buildingName: 'Riverside Gardens Tower A',
    address: '142 Coastal Marine Drive',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 68,
    confirmedSafe: 14,
    rescued: 12,
    inDistress: 10,
    unaccounted: 32,
    priorityScore: 96,
    vulnerabilities: { elderly: 11, children: 8, disabled: 4, medicalUrgent: true },
    lastCheckin: '2 mins ago',
  },
  {
    id: 'BLD-402',
    buildingName: 'St. Jude Senior Care Facility',
    address: '88 Riverview Expressway',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 54,
    confirmedSafe: 8,
    rescued: 10,
    inDistress: 16,
    unaccounted: 20,
    priorityScore: 98,
    vulnerabilities: { elderly: 24, children: 0, disabled: 9, medicalUrgent: true },
    lastCheckin: 'Just now',
  },
  {
    id: 'BLD-403',
    buildingName: 'Sunrise Montessori School',
    address: '19 Bayfront Road',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 75,
    confirmedSafe: 38,
    rescued: 14,
    inDistress: 5,
    unaccounted: 18,
    priorityScore: 89,
    vulnerabilities: { elderly: 2, children: 34, disabled: 1, medicalUrgent: false },
    lastCheckin: '4 mins ago',
  },
  {
    id: 'BLD-404',
    buildingName: 'Marina View Condominiums',
    address: '77 Harbour Basin Blvd',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 50,
    confirmedSafe: 14,
    rescued: 8,
    inDistress: 4,
    unaccounted: 24,
    priorityScore: 86,
    vulnerabilities: { elderly: 6, children: 7, disabled: 2, medicalUrgent: false },
    lastCheckin: '6 mins ago',
  },
  {
    id: 'BLD-407',
    buildingName: 'Central Wholesale Market',
    address: '500 Lower Market Street',
    zoneName: 'Zone B - Lowland Riverine',
    expectedOccupancy: 110,
    confirmedSafe: 45,
    rescued: 15,
    inDistress: 12,
    unaccounted: 38,
    priorityScore: 74,
    vulnerabilities: { elderly: 12, children: 14, disabled: 3, medicalUrgent: false },
    lastCheckin: '1 min ago',
  },
  {
    id: 'BLD-408',
    buildingName: 'Greenwood Community Center',
    address: '22 Community Plaza',
    zoneName: 'Zone B - Lowland Riverine',
    expectedOccupancy: 64,
    confirmedSafe: 28,
    rescued: 10,
    inDistress: 5,
    unaccounted: 21,
    priorityScore: 66,
    vulnerabilities: { elderly: 8, children: 9, disabled: 2, medicalUrgent: false },
    lastCheckin: '7 mins ago',
  },
  {
    id: 'BLD-411',
    buildingName: 'Crestline Medical Clinic',
    address: '74 Ridge Hospital Way',
    zoneName: 'Zone B - Lowland Riverine',
    expectedOccupancy: 38,
    confirmedSafe: 14,
    rescued: 6,
    inDistress: 4,
    unaccounted: 14,
    priorityScore: 78,
    vulnerabilities: { elderly: 7, children: 2, disabled: 4, medicalUrgent: true },
    lastCheckin: '3 mins ago',
  },
  {
    id: 'BLD-406',
    buildingName: 'East Canal Logistics Hub',
    address: '10 Industrial Marsh Link',
    zoneName: 'Zone B - Lowland Riverine',
    expectedOccupancy: 14,
    confirmedSafe: 7,
    rescued: 3,
    inDistress: 0,
    unaccounted: 4,
    priorityScore: 42,
    vulnerabilities: { elderly: 0, children: 0, disabled: 0, medicalUrgent: false },
    lastCheckin: '12 mins ago',
  },
  {
    id: 'BLD-409',
    buildingName: 'Oakridge Business Park Bldg 3',
    address: '304 Innovation Boulevard',
    zoneName: 'Zone C - Urban Core',
    expectedOccupancy: 40,
    confirmedSafe: 28,
    rescued: 7,
    inDistress: 0,
    unaccounted: 5,
    priorityScore: 26,
    vulnerabilities: { elderly: 1, children: 0, disabled: 0, medicalUrgent: false },
    lastCheckin: '15 mins ago',
  },
  {
    id: 'BLD-410',
    buildingName: 'Highland Ridge Apartments',
    address: '12 Summit Heights Road',
    zoneName: 'Zone D - Uplands & Peripheral',
    expectedOccupancy: 35,
    confirmedSafe: 28,
    rescued: 4,
    inDistress: 0,
    unaccounted: 3,
    priorityScore: 16,
    vulnerabilities: { elderly: 2, children: 1, disabled: 0, medicalUrgent: false },
    lastCheckin: '20 mins ago',
  },
  {
    id: 'BLD-405',
    buildingName: 'Municipal Pump Substation 4',
    address: '3 Basin Canal Road',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 8,
    confirmedSafe: 5,
    rescued: 1,
    inDistress: 0,
    unaccounted: 2,
    priorityScore: 48,
    vulnerabilities: { elderly: 0, children: 0, disabled: 0, medicalUrgent: false },
    lastCheckin: '8 mins ago',
  },
];

interface SliceConfig {
  key: 'SAFE' | 'RESCUED' | 'DISTRESS' | 'UNACCOUNTED';
  name: string;
  value: number;
  percentage: number;
  color: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  description: string;
  subtext: string;
}

interface BuildingAccountabilityChartProps {
  className?: string;
}

export const BuildingAccountabilityChart: React.FC<BuildingAccountabilityChartProps> = ({
  className = '',
}) => {
  const [records, setRecords] = useState<BuildingHeadcountRecord[]>(INITIAL_RECORDS);
  const [selectedScope, setSelectedScope] = useState<string>('BLD-401'); // 'ALL' or buildingId
  const [chartType, setChartType] = useState<'DONUT' | 'PIE'>('DONUT');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [hoveredSliceIndex, setHoveredSliceIndex] = useState<number | null>(null);
  const [selectedSliceIndex, setSelectedSliceIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filtered records based on zone selection
  const filteredRecords = useMemo(() => {
    return records.filter((r) => zoneFilter === 'ALL' || r.zoneName === zoneFilter);
  }, [records, zoneFilter]);

  // Aggregate basin totals across filtered records
  const basinAggregate = useMemo(() => {
    const totalExpected = filteredRecords.reduce((acc, r) => acc + r.expectedOccupancy, 0);
    const totalSafe = filteredRecords.reduce((acc, r) => acc + r.confirmedSafe, 0);
    const totalRescued = filteredRecords.reduce((acc, r) => acc + r.rescued, 0);
    const totalDistress = filteredRecords.reduce((acc, r) => acc + r.inDistress, 0);
    const totalUnaccounted = filteredRecords.reduce((acc, r) => acc + r.unaccounted, 0);
    const resolved = totalSafe + totalRescued;
    const resolvedPct = totalExpected > 0 ? ((resolved / totalExpected) * 100).toFixed(1) : '0';

    return {
      id: 'ALL',
      buildingName: 'Disaster Basin Aggregate (All Buildings)',
      address: `${filteredRecords.length} Monitored Structures in Basin`,
      zoneName: zoneFilter === 'ALL' ? 'Entire Disaster Basin' : zoneFilter,
      expectedOccupancy: totalExpected,
      confirmedSafe: totalSafe,
      rescued: totalRescued,
      inDistress: totalDistress,
      unaccounted: totalUnaccounted,
      priorityScore: Math.round(
        filteredRecords.reduce((acc, r) => acc + r.priorityScore, 0) / (filteredRecords.length || 1)
      ),
      vulnerabilities: {
        elderly: filteredRecords.reduce((acc, r) => acc + r.vulnerabilities.elderly, 0),
        children: filteredRecords.reduce((acc, r) => acc + r.vulnerabilities.children, 0),
        disabled: filteredRecords.reduce((acc, r) => acc + r.vulnerabilities.disabled, 0),
        medicalUrgent: filteredRecords.some((r) => r.vulnerabilities.medicalUrgent),
      },
      lastCheckin: 'Live Telemetry Syncing',
      resolvedPct,
    };
  }, [filteredRecords, zoneFilter]);

  // Active target data (either specific building or basin aggregate)
  const activeRecord = useMemo(() => {
    if (selectedScope === 'ALL') return basinAggregate;
    const found = records.find((r) => r.id === selectedScope);
    return found || basinAggregate;
  }, [selectedScope, records, basinAggregate]);

  // Generate pie slices data with color alignment and percentages
  const slices: SliceConfig[] = useMemo(() => {
    const total = activeRecord.expectedOccupancy || 1;
    const safe = activeRecord.confirmedSafe;
    const rescued = activeRecord.rescued;
    const distress = activeRecord.inDistress;
    const unaccounted = activeRecord.unaccounted;

    const calcPct = (val: number) => (val > 0 ? Number(((val / total) * 100).toFixed(1)) : 0);

    return [
      {
        key: 'SAFE',
        name: 'Confirmed Safe',
        value: safe,
        percentage: calcPct(safe),
        color: '#10b981', // Emerald
        textColor: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-50 dark:bg-emerald-500/10',
        borderColor: 'border-emerald-200 dark:border-emerald-500/30',
        description: 'Checked in Safe via SMS / STRIDE App',
        subtext: 'Accounted & out of risk',
      },
      {
        key: 'RESCUED',
        name: 'Rescued & Evacuated',
        value: rescued,
        percentage: calcPct(rescued),
        color: '#06b6d4', // Cyan
        textColor: 'text-cyan-600 dark:text-cyan-400',
        bgColor: 'bg-cyan-50 dark:bg-cyan-500/10',
        borderColor: 'border-cyan-200 dark:border-cyan-500/30',
        description: 'Transported to shelter by flood rescue units',
        subtext: 'Extracted by boats/trucks',
      },
      {
        key: 'DISTRESS',
        name: 'In Active Distress',
        value: distress,
        percentage: calcPct(distress),
        color: '#f43f5e', // Rose
        textColor: 'text-rose-600 dark:text-rose-400',
        bgColor: 'bg-rose-50 dark:bg-rose-500/10',
        borderColor: 'border-rose-200 dark:border-rose-500/30',
        description: 'Active 112/SOS beacons / roof waving',
        subtext: 'Immediate triage extraction',
      },
      {
        key: 'UNACCOUNTED',
        name: 'Still Unaccounted',
        value: unaccounted,
        percentage: calcPct(unaccounted),
        color: '#f59e0b', // Amber
        textColor: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-500/10',
        borderColor: 'border-amber-200 dark:border-amber-500/30',
        description: 'Silent / pending verification balance',
        subtext: 'Search & rescue target',
      },
    ];
  }, [activeRecord]);

  // Calculate resolution progress
  const resolvedCount = activeRecord.confirmedSafe + activeRecord.rescued;
  const resolvedPercentage =
    activeRecord.expectedOccupancy > 0
      ? ((resolvedCount / activeRecord.expectedOccupancy) * 100).toFixed(1)
      : '0.0';

  // Active slice object (prioritizes clicked/selected slice, falls back to hovered)
  const activeSlice =
    selectedSliceIndex !== null
      ? slices[selectedSliceIndex]
      : hoveredSliceIndex !== null
      ? slices[hoveredSliceIndex]
      : null;

  // Trigger automated voice/SMS reconfirmation
  const handleTriggerPing = () => {
    if (selectedScope === 'ALL') {
      setRecords((prev) =>
        prev.map((r) => {
          const shift = Math.min(1, r.unaccounted);
          return shift > 0
            ? {
                ...r,
                confirmedSafe: r.confirmedSafe + shift,
                unaccounted: r.unaccounted - shift,
                lastCheckin: 'Just now',
              }
            : r;
        })
      );
      setToastMessage('Broadcast check-in sent: multiple citizens checked in SAFE across basin!');
    } else {
      const b = records.find((r) => r.id === selectedScope);
      if (!b) return;
      const shift = Math.min(2, b.unaccounted);
      if (shift > 0) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === selectedScope
              ? {
                  ...r,
                  confirmedSafe: r.confirmedSafe + shift,
                  unaccounted: r.unaccounted - shift,
                  lastCheckin: 'Just now',
                }
              : r
          )
        );
        setToastMessage(`SMS ping answered: ${shift} residents at ${b.buildingName} confirmed SAFE!`);
      } else {
        setToastMessage(`All residents at ${b.buildingName} are already accounted for.`);
      }
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Log 1 evacuated civilian
  const handleLogRescue = () => {
    const targetId = selectedScope === 'ALL' ? 'BLD-401' : selectedScope;
    const b = records.find((r) => r.id === targetId);
    if (!b) return;

    if (b.unaccounted > 0 || b.inDistress > 0) {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id === targetId) {
            if (r.inDistress > 0) {
              return {
                ...r,
                rescued: r.rescued + 1,
                inDistress: r.inDistress - 1,
                lastCheckin: 'Just now',
              };
            }
            return {
              ...r,
              rescued: r.rescued + 1,
              unaccounted: r.unaccounted - 1,
              lastCheckin: 'Just now',
            };
          }
          return r;
        })
      );
      setToastMessage(`Rescue logged: 1 civilian evacuated from ${b.buildingName} to emergency shelter!`);
    } else {
      setToastMessage(`No pending civilians left to evacuate from ${b.buildingName}.`);
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleResetData = () => {
    setRecords(INITIAL_RECORDS);
    setToastMessage('Headcount data reset to initial ground truth.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className={`w-full bg-white border border-[#C8D9E6]/70 rounded-3xl p-5 sm:p-7 shadow-sm space-y-6 ${className}`}>
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#2F4156] text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 border border-[#567C8D]/40">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#C8D9E6]/60 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shadow-xs text-xl">
              🍩
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
                  Civilian Accountability Donut Chart
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Headcount Resolution
                </span>
              </div>
              <p className="text-xs text-[#567C8D] mt-0.5">
                Displays civilian breakdown per structure: <span className="text-emerald-700 font-semibold">Safe</span>,{' '}
                <span className="text-cyan-700 font-semibold">Rescued</span>, <span className="text-rose-700 font-semibold">In Distress</span>, and{' '}
                <span className="text-amber-700 font-bold">Unaccounted</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Structure Selector */}
          <div className="flex items-center gap-1.5 bg-[#F5EFEB] px-3 py-1.5 rounded-xl border border-[#C8D9E6] text-xs">
            <Building2 className="w-3.5 h-3.5 text-[#567C8D]" />
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-[#2F4156] font-semibold cursor-pointer max-w-[180px] sm:max-w-[220px] truncate"
            >
              <option value="ALL">🌍 Entire Basin ({records.length} Buildings Combined)</option>
              <optgroup label="Individual Structures">
                {records.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.buildingName} ({b.expectedOccupancy} ppl)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Donut vs Pie Chart Toggle */}
          <div className="flex items-center bg-[#F5EFEB] p-1 rounded-xl border border-[#C8D9E6] text-xs font-semibold">
            <button
              onClick={() => setChartType('DONUT')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartType === 'DONUT'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <span>🍩 Donut</span>
            </button>
            <button
              onClick={() => setChartType('PIE')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartType === 'PIE'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <span>🥧 Pie</span>
            </button>
          </div>

          {/* Zone Filter */}
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="bg-[#F5EFEB] border border-[#C8D9E6] text-xs text-[#2F4156] font-semibold rounded-xl px-3 py-2 outline-none focus:border-[#2F4156] cursor-pointer"
          >
            <option value="ALL">All Zones</option>
            <option value="Zone A - Coastal Flood Basin">Zone A - Coastal</option>
            <option value="Zone B - Lowland Riverine">Zone B - Riverine</option>
            <option value="Zone C - Urban Core">Zone C - Urban Core</option>
            <option value="Zone D - Uplands & Peripheral">Zone D - Uplands</option>
          </select>

          {/* Reset Simulation Button */}
          <button
            onClick={handleResetData}
            title="Reset to ground truth data"
            className="p-2 rounded-xl bg-[#F5EFEB] hover:bg-white text-[#567C8D] hover:text-[#2F4156] border border-[#C8D9E6] transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ACTIVE SUBJECT HEADER BANNER */}
      <div className="bg-[#F5EFEB]/60 border border-[#C8D9E6]/70 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-xs ${
              selectedScope === 'ALL'
                ? 'bg-[#2F4156]'
                : activeRecord.priorityScore >= 80
                ? 'bg-rose-600'
                : activeRecord.priorityScore >= 50
                ? 'bg-amber-600'
                : 'bg-emerald-600'
            }`}
          >
            {selectedScope === 'ALL' ? 'ALL' : activeRecord.id.replace('BLD-', '#')}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#2F4156] tracking-tight">{activeRecord.buildingName}</h3>
              {selectedScope !== 'ALL' && (
                <span className="text-xs font-mono text-[#567C8D]">({activeRecord.id})</span>
              )}
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white text-indigo-700 font-bold border border-[#C8D9E6]">
                {activeRecord.zoneName}
              </span>
            </div>
            <p className="text-xs text-[#567C8D] flex items-center gap-2 mt-0.5">
              <span>{activeRecord.address}</span>
              <span>&bull;</span>
              <span>Last activity: {activeRecord.lastCheckin}</span>
            </p>
          </div>
        </div>

        {/* Priority Score & Vulnerabilities Tag */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {selectedScope !== 'ALL' && (
            <span
              className={`px-3 py-1 rounded-full font-bold border ${
                activeRecord.priorityScore >= 80
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : activeRecord.priorityScore >= 50
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              Priority Score: {activeRecord.priorityScore} / 100
            </span>
          )}

          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-[#C8D9E6] text-[#2F4156] text-xs font-medium">
            <span title="Elderly">🧓 {activeRecord.vulnerabilities.elderly}</span>
            <span>&bull;</span>
            <span title="Children">👶 {activeRecord.vulnerabilities.children}</span>
            <span>&bull;</span>
            <span title="Disabled / Mobility impaired">♿ {activeRecord.vulnerabilities.disabled}</span>
            {activeRecord.vulnerabilities.medicalUrgent && (
              <>
                <span>&bull;</span>
                <span className="text-rose-600 font-bold flex items-center gap-1">
                  <HeartPulse className="w-3 h-3 inline" /> Urgent
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* HERO SECTION: DONUT CHART + CATEGORY CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Side: Donut / Pie Chart with Dynamic Center Badge & Outside Info Box */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center relative bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-inner">
          <div className="h-64 sm:h-72 w-full flex items-center justify-center relative select-none">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  cx="50%"
                  cy="50%"
                  innerRadius={chartType === 'DONUT' ? 76 : 0}
                  outerRadius={114}
                  paddingAngle={chartType === 'DONUT' ? 3 : 0}
                  dataKey="value"
                  nameKey="name"
                  animationDuration={400}
                  onClick={(_, index) => setSelectedSliceIndex(selectedSliceIndex === index ? null : index)}
                  onMouseEnter={(_, index) => setHoveredSliceIndex(index)}
                  onMouseLeave={() => setHoveredSliceIndex(null)}
                  cursor="pointer"
                >
                  {slices.map((entry, index) => {
                    const isSelected = selectedSliceIndex === index;
                    const isHovered = hoveredSliceIndex === index;
                    const isHighlighted = isSelected || isHovered;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke={isHighlighted ? '#ffffff' : '#090d16'}
                        strokeWidth={isSelected ? 4 : isHovered ? 2.5 : 1.5}
                        className="transition-all duration-200 cursor-pointer"
                        style={{
                          filter: isSelected ? `drop-shadow(0 0 10px ${entry.color})` : 'none',
                        }}
                      />
                    );
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Inner Center Label: ALWAYS displays the Master Total and never gets replaced */}
            {chartType === 'DONUT' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                  Total Expected
                </span>
                <span className="text-3xl font-black text-white font-mono tracking-tight my-0.5">
                  {activeRecord.expectedOccupancy}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-indigo-500/15 text-indigo-300 border-indigo-500/30">
                  {resolvedPercentage}% Resolved
                </span>
              </div>
            )}
          </div>

          {/* DEDICATED OUTER INFO BOX */}
          <div className="w-full mt-3">
            {activeSlice ? (
              <div
                className="w-full p-4 rounded-xl border-2 bg-slate-900 shadow-2xl relative transition-all duration-200"
                style={{ borderColor: activeSlice.color }}
              >
                {/* Outer Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: activeSlice.color }}
                    />
                    <span className="text-xs font-bold text-white tracking-wide">
                      {activeSlice.name}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedSliceIndex !== null ? 'Pinned Cohort' : 'Hovered Cohort'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                      style={{
                        borderColor: activeSlice.color + '60',
                        color: activeSlice.color,
                        backgroundColor: activeSlice.color + '18',
                      }}
                    >
                      {activeSlice.percentage}% of building
                    </span>
                    {selectedSliceIndex !== null && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSliceIndex(null);
                        }}
                        className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Close outer info box"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Headcount and status */}
                <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-800 pt-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-white">
                      {activeSlice.value}
                    </span>
                    <span className="text-xs text-slate-400">
                      citizens / {activeRecord.expectedOccupancy} total
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {activeSlice.subtext}
                  </span>
                </div>

                {/* Operational description */}
                <p className="text-[11px] text-slate-300 mt-1.5">
                  {activeSlice.description}
                </p>

                {/* Operational action link */}
                <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 text-[10px]">
                    {selectedSliceIndex !== null
                      ? 'Click slice again or ✕ to unpin.'
                      : 'Click slice to lock this info box.'}
                  </span>
                  {activeSlice.key === 'UNACCOUNTED' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerPing();
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer text-xs"
                    >
                      Ping this cohort →
                    </button>
                  )}
                  {(activeSlice.key === 'DISTRESS' || activeSlice.key === 'RESCUED') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLogRescue();
                      }}
                      className="text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer text-xs"
                    >
                      Dispatch rescue boat →
                    </button>
                  )}
                  {activeSlice.key === 'SAFE' && (
                    <span className="text-emerald-400 font-medium text-[10.5px]">
                      ✓ Check-in verified
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full p-3 rounded-xl border border-slate-800 bg-slate-900/60 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <span>👆</span>
                <span>Click any segment on the donut to pin cohort intelligence</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: 4 Detailed Status Category Cards */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {slices.map((s, index) => {
            const isSelected = selectedSliceIndex === index;
            const isHovered = hoveredSliceIndex === index;
            const isHighlighted = isSelected || isHovered;
            return (
              <div
                key={s.key}
                onClick={() => setSelectedSliceIndex(selectedSliceIndex === index ? null : index)}
                onMouseEnter={() => setHoveredSliceIndex(index)}
                onMouseLeave={() => setHoveredSliceIndex(null)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                  isHighlighted
                    ? `${s.bgColor} ${s.borderColor} shadow-md scale-[1.01] ring-1 ring-black/10`
                    : 'bg-[#F8FAFC] border-[#C8D9E6]/80 hover:border-[#567C8D]'
                }`}
              >
                {/* Colored Top Accent Line */}
                <div
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ backgroundColor: s.color }}
                />

                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-xs font-bold text-[#2F4156]">{s.name}</span>
                    </div>
                    <span className="text-[11px] text-[#567C8D] block">{s.subtext}</span>
                  </div>

                  {/* Percentage Pill */}
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${s.bgColor} ${s.textColor} ${s.borderColor}`}
                  >
                    {s.percentage}%
                  </span>
                </div>

                {/* Headcount Number */}
                <div className="mt-3 flex items-baseline justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-2xl sm:text-3xl font-black font-mono ${s.textColor}`}>
                      {s.value}
                    </span>
                    <span className="text-xs text-[#567C8D]">/ {activeRecord.expectedOccupancy}</span>
                  </div>
                  <span className="text-[10px] text-[#567C8D] font-mono">
                    {s.key === 'SAFE' && 'SMS Check-In'}
                    {s.key === 'RESCUED' && 'In Shelter'}
                    {s.key === 'DISTRESS' && 'SOS / High Risk'}
                    {s.key === 'UNACCOUNTED' && 'Non-Responsive'}
                  </span>
                </div>

                {/* Description */}
                <p className="text-[11px] text-[#567C8D] mt-2 border-t border-[#C8D9E6]/60 pt-2 line-clamp-1">
                  {s.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* MATHEMATICAL PROOF & BALANCE EQUATION */}
      <div className="bg-[#F5EFEB]/70 border border-[#C8D9E6]/80 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
          <div className="flex items-center gap-2 text-[#2F4156]">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="font-bold">Mathematical Civilian Balance Verification</span>
          </div>
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
            ✓ 100% Balanced ({activeRecord.expectedOccupancy} Expected = {slices.reduce((acc, s) => acc + s.value, 0)} Accounted)
          </span>
        </div>

        {/* The Equation Display */}
        <div className="bg-white rounded-xl p-3 border border-[#C8D9E6]/80 text-xs sm:text-sm font-mono flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-center shadow-xs">
          <div className="bg-[#2F4156] px-3 py-1 rounded-lg text-white font-bold">
            {activeRecord.expectedOccupancy} Expected
          </div>
          <span className="text-[#567C8D] font-black">=</span>
          <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-lg font-bold">
            {activeRecord.confirmedSafe} Safe
          </div>
          <span className="text-[#567C8D] font-black">+</span>
          <div className="bg-cyan-50 text-cyan-700 border border-cyan-200 px-3 py-1 rounded-lg font-bold">
            {activeRecord.rescued} Rescued
          </div>
          <span className="text-[#567C8D] font-black">+</span>
          <div className="bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded-lg font-bold">
            {activeRecord.inDistress} In Distress
          </div>
          <span className="text-[#567C8D] font-black">+</span>
          <div className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-lg font-bold">
            {activeRecord.unaccounted} Unaccounted
          </div>
        </div>

        {/* Operational Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#C8D9E6]/60">
          <div className="text-xs text-[#567C8D] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span>Interactive field commands immediately update Donut Chart slices:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleTriggerPing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#2F4156] hover:bg-[#1C2541] text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Broadcast Voice/SMS Check-in Ping</span>
            </button>

            <button
              onClick={handleLogRescue}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Log Evacuated Civilian</span>
            </button>
          </div>
        </div>
      </div>

      {/* QUICK BUILDING EXPLORER GRID */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs text-[#567C8D] font-semibold px-1">
          <span className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Select Any Structure to Render its Dedicated Donut Chart:</span>
          </span>
          <span>Showing {filteredRecords.length} structures</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRecords.map((b) => {
            const isSelected = selectedScope === b.id;
            const resPct = Math.round(((b.confirmedSafe + b.rescued) / b.expectedOccupancy) * 100);

            return (
              <div
                key={b.id}
                onClick={() => setSelectedScope(b.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                  isSelected
                    ? 'bg-indigo-50/50 border-indigo-500 shadow-sm ring-1 ring-indigo-500/50'
                    : 'bg-[#F8FAFC] border-[#C8D9E6]/70 hover:border-[#567C8D] hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-[#2F4156] line-clamp-1">{b.buildingName}</span>
                    </div>
                    <span className="text-[10px] text-[#567C8D] font-mono">
                      {b.id} &bull; {b.zoneName.split(' - ')[0]}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      resPct >= 70
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : resPct >= 40
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {resPct}% Resolved
                  </span>
                </div>

                {/* Micro Mini Progress Track */}
                <div className="space-y-1">
                  <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden flex p-0.5 border border-[#C8D9E6]">
                    <div
                      className="h-full bg-emerald-500 rounded-l-full"
                      style={{ width: `${(b.confirmedSafe / b.expectedOccupancy) * 100}%` }}
                    />
                    <div
                      className="h-full bg-cyan-500"
                      style={{ width: `${(b.rescued / b.expectedOccupancy) * 100}%` }}
                    />
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${(b.inDistress / b.expectedOccupancy) * 100}%` }}
                    />
                    <div
                      className="h-full bg-amber-500 rounded-r-full"
                      style={{ width: `${(b.unaccounted / b.expectedOccupancy) * 100}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#567C8D]">
                    <span>{b.expectedOccupancy} Total Expected</span>
                    <span className="text-amber-700 font-bold">{b.unaccounted} Unaccounted</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
