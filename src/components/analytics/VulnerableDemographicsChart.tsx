import React, { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  Baby,
  HeartPulse,
  Accessibility,
  Package,
  ShieldCheck,
  Truck,
  PlusCircle,
} from 'lucide-react';

export interface DemographicSegment {
  name: string;
  key: 'CHILD' | 'ELDERLY' | 'DISABLED' | 'ADULT';
  count: number;
  percentage: number;
  color: string;
  fillGradient: string;
  icon: string;
  riskWeight: string;
  logisticsNeed: string;
  recommendedSupplies: {
    item: string;
    quantity: number;
    unit: string;
  }[];
}

interface VulnerableDemographicsChartProps {
  className?: string;
  activeZone?: string;
  onSupplyExport?: () => void;
}

const BASELINE_POPULATION = {
  totalRegistered: 1240,
  children: 285,    // < 18 years
  elderly: 215,     // 65+ years
  disabled: 68,     // Mobility/Sensory disabled
  adults: 672,      // 18-64 general adults
};

export const VulnerableDemographicsChart: React.FC<VulnerableDemographicsChartProps> = ({
  className = '',
  activeZone = 'Zone A - Riverfront Sector',
  onSupplyExport,
}) => {
  const [data, setData] = useState(BASELINE_POPULATION);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'REGISTERED' | 'SOS_ACTIVE'>('REGISTERED');

  const currentCounts = useMemo(() => {
    if (viewMode === 'SOS_ACTIVE') {
      return {
        total: 184,
        children: 46,
        elderly: 38,
        disabled: 18,
        adults: 82,
      };
    }
    return {
      total: data.totalRegistered,
      children: data.children,
      elderly: data.elderly,
      disabled: data.disabled,
      adults: data.adults,
    };
  }, [viewMode, data]);

  const segments: DemographicSegment[] = useMemo(() => {
    const total = currentCounts.total;
    const calcPct = (cnt: number) => (total > 0 ? Math.round((cnt / total) * 100) : 0);

    return [
      {
        name: 'Elderly (65+ Yrs)',
        key: 'ELDERLY',
        count: currentCounts.elderly,
        percentage: calcPct(currentCounts.elderly),
        color: '#f59e0b',
        fillGradient: 'from-amber-500 to-amber-600',
        icon: '🧓',
        riskWeight: '+20 pts / person',
        logisticsNeed: 'Oxygen concentrators, insulin refrigeration, chronic BP meds, stair-evac chairs',
        recommendedSupplies: [
          { item: 'Portable Oxygen Cylinders', quantity: Math.ceil(currentCounts.elderly * 0.15), unit: 'cylinders' },
          { item: 'Geriatric Medical Kits & BP Monitors', quantity: currentCounts.elderly, unit: 'kits' },
          { item: 'High-Calorie Soft Ration Packs', quantity: currentCounts.elderly * 3, unit: 'meals/day' },
        ],
      },
      {
        name: 'Infants & Children (<18)',
        key: 'CHILD',
        count: currentCounts.children,
        percentage: calcPct(currentCounts.children),
        color: '#0284c7',
        fillGradient: 'from-sky-400 to-blue-500',
        icon: '👶',
        riskWeight: '+20 pts / person',
        logisticsNeed: 'Pediatric trauma packs, baby formula, pediatric life vests, clean hydration',
        recommendedSupplies: [
          { item: 'Pediatric First Aid & ORS Packs', quantity: currentCounts.children, unit: 'packs' },
          { item: 'Infant Formula & Dry Food Supplies', quantity: Math.ceil(currentCounts.children * 0.4 * 3), unit: 'units' },
          { item: 'Child Life Jackets / Float Rings', quantity: Math.ceil(currentCounts.children * 0.5), unit: 'vests' },
        ],
      },
      {
        name: 'Persons with Disabilities',
        key: 'DISABLED',
        count: currentCounts.disabled,
        percentage: calcPct(currentCounts.disabled),
        color: '#9333ea',
        fillGradient: 'from-purple-500 to-indigo-600',
        icon: '♿',
        riskWeight: '+20 pts / person',
        logisticsNeed: 'All-terrain evacuation stretchers, folding wheelchairs, accessible boat transfer',
        recommendedSupplies: [
          { item: 'Heavy-Duty Folding Wheelchairs', quantity: Math.ceil(currentCounts.disabled * 0.6), unit: 'chairs' },
          { item: 'Floating Rescue Stretchers', quantity: Math.ceil(currentCounts.disabled * 0.4), unit: 'stretchers' },
          { item: 'Sensory Emergency Signal Flares', quantity: currentCounts.disabled, unit: 'beacons' },
        ],
      },
      {
        name: 'Able-bodied Adults (18-64)',
        key: 'ADULT',
        count: currentCounts.adults,
        percentage: calcPct(currentCounts.adults),
        color: '#059669',
        fillGradient: 'from-emerald-500 to-teal-500',
        icon: '🧑',
        riskWeight: '+10 pts / person',
        logisticsNeed: 'Standard survival rations, water purification kits, volunteer rescue vests',
        recommendedSupplies: [
          { item: 'Standard Clean Water Rations', quantity: currentCounts.adults * 4, unit: 'liters/day' },
          { item: 'MRE Emergency Food Rations', quantity: currentCounts.adults * 2, unit: 'packs/day' },
          { item: 'Sanitation & Emergency Blankets', quantity: currentCounts.adults, unit: 'kits' },
        ],
      },
    ];
  }, [currentCounts]);

  const vulnerableTotal = currentCounts.children + currentCounts.elderly + currentCounts.disabled;
  const vulnerablePct = currentCounts.total > 0 ? Math.round((vulnerableTotal / currentCounts.total) * 100) : 0;

  const currentSegment =
    selectedSegmentIndex !== null
      ? segments[selectedSegmentIndex]
      : activeSegmentIndex !== null
      ? segments[activeSegmentIndex]
      : null;

  const handleSimulateIntake = () => {
    setData((prev) => ({
      totalRegistered: prev.totalRegistered + 4,
      children: prev.children + 1,
      elderly: prev.elderly + 1,
      disabled: Math.random() > 0.6 ? prev.disabled + 1 : prev.disabled,
      adults: prev.adults + 2,
    }));
  };

  return (
    <div className={`w-full bg-white border border-[#C8D9E6]/70 rounded-3xl p-5 sm:p-7 shadow-sm text-[#2F4156] space-y-6 ${className}`}>
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#C8D9E6]/60">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shadow-xs text-xl">
            🧬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
                Vulnerable Demographics & Supply Logistics
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                Triage Donut
              </span>
            </div>
            <p className="text-xs text-[#567C8D] flex items-center gap-2 mt-0.5">
              <span>Population composition informing medical & mobility pre-staging</span>
              <span className="w-1 h-1 rounded-full bg-slate-400" />
              <span className="text-purple-700 font-semibold">{activeZone}</span>
            </p>
          </div>
        </div>

        {/* View Switcher & Simulation */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-[#F5EFEB] p-1 border border-[#C8D9E6] text-xs font-semibold">
            <button
              onClick={() => setViewMode('REGISTERED')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'REGISTERED'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              Baseline Census
            </button>
            <button
              onClick={() => setViewMode('SOS_ACTIVE')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'SOS_ACTIVE'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
              <span>Active SOS Intake</span>
            </button>
          </div>

          <button
            onClick={handleSimulateIntake}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#F5EFEB] hover:bg-white text-[#2F4156] border border-[#C8D9E6] transition-all active:scale-95 cursor-pointer"
            title="Simulate registration of family with child and elder"
          >
            <PlusCircle className="w-3.5 h-3.5 text-indigo-600" />
            <span>Simulate Census</span>
          </button>
        </div>
      </div>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 my-4">
        <div className="bg-[#F5EFEB]/70 border border-[#C8D9E6]/70 rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#567C8D] font-bold flex justify-between">
            <span>Total Census</span>
            <Users className="w-3.5 h-3.5 text-[#567C8D]" />
          </div>
          <div className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] mt-1">
            {currentCounts.total.toLocaleString()}
          </div>
          <div className="text-xs text-[#567C8D] mt-0.5">Individuals registered</div>
        </div>

        <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-purple-700 font-bold flex justify-between">
            <span>High Vulnerability</span>
            <HeartPulse className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-purple-800 mt-1">
            {vulnerableTotal.toLocaleString()}
            <span className="text-xs font-semibold text-purple-700 ml-1.5">({vulnerablePct}%)</span>
          </div>
          <div className="text-xs text-purple-700/80 mt-0.5">Children + Elderly + Disabled</div>
        </div>

        <div className="bg-[#F5EFEB]/70 border border-[#C8D9E6]/70 rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-sky-700 font-bold flex justify-between">
            <span>Pediatric Demographics</span>
            <Baby className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-sky-800 mt-1">
            {currentCounts.children.toLocaleString()}
          </div>
          <div className="text-xs text-[#567C8D] mt-0.5">Ages 0-17 pediatric care</div>
        </div>

        <div className="bg-[#F5EFEB]/70 border border-[#C8D9E6]/70 rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-purple-700 font-bold flex justify-between">
            <span>Mobility Support Needed</span>
            <Accessibility className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-purple-800 mt-1">
            {currentCounts.disabled.toLocaleString()}
          </div>
          <div className="text-xs text-[#567C8D] mt-0.5">Non-ambulatory evacuees</div>
        </div>
      </div>

      {/* Main Content Grid: Chart on Left, Interactive Category Cards on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Donut Chart Container */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center relative bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-inner">
          <div className="h-64 sm:h-72 w-full flex items-center justify-center relative select-none">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segments}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="count"
                  animationDuration={400}
                  onClick={(_, index) => setSelectedSegmentIndex(selectedSegmentIndex === index ? null : index)}
                  onMouseEnter={(_, index) => setActiveSegmentIndex(index)}
                  onMouseLeave={() => setActiveSegmentIndex(null)}
                  cursor="pointer"
                >
                  {segments.map((entry, index) => {
                    const isSelected = selectedSegmentIndex === index;
                    const isHovered = activeSegmentIndex === index;
                    const isHighlighted = isSelected || isHovered;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke={isHighlighted ? '#ffffff' : '#0f172a'}
                        strokeWidth={isSelected ? 4 : isHovered ? 2.5 : 2}
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

            {/* Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                Vulnerable
              </span>
              <span className="text-3xl font-black text-white font-mono tracking-tight my-0.5">
                {vulnerablePct}%
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-purple-500/20 text-purple-300 border-purple-500/30">
                High Priority
              </span>
            </div>
          </div>

          {/* Dedicated Outer Info Box */}
          <div className="w-full mt-3">
            {currentSegment ? (
              <div
                className="w-full p-4 rounded-xl border-2 bg-slate-900 shadow-xl relative transition-all duration-200 text-white"
                style={{ borderColor: currentSegment.color }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{currentSegment.icon}</span>
                    <span className="text-xs font-bold text-white tracking-wide">
                      {currentSegment.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedSegmentIndex !== null ? 'Pinned Cohort' : 'Hovered Cohort'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                      style={{
                        borderColor: currentSegment.color + '60',
                        color: currentSegment.color,
                        backgroundColor: currentSegment.color + '20',
                      }}
                    >
                      {currentSegment.percentage}% of census
                    </span>
                    {selectedSegmentIndex !== null && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSegmentIndex(null);
                        }}
                        className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Close outer info box"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-800 pt-2">
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-2xl font-black text-white">
                      {currentSegment.count.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400">citizens registered</span>
                  </div>
                  <span className="text-[11px] text-amber-400 font-medium">
                    Triage Weight: {currentSegment.riskWeight}
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 mt-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 font-semibold">Logistics Need: </span>
                  <span>{currentSegment.logisticsNeed}</span>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between text-[10.5px]">
                  <span className="text-slate-400 truncate max-w-[240px]">
                    Supplies: {currentSegment.recommendedSupplies.map((s) => `${s.quantity} ${s.unit} ${s.item}`).join(', ')}
                  </span>
                  <span className="text-slate-500 italic">
                    {selectedSegmentIndex !== null ? 'Click slice again to unpin' : 'Click slice to lock this info box'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-full p-3 rounded-xl border border-slate-800 bg-slate-900/50 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <span>👆</span>
                <span>Click any segment on the donut to view logistics details</span>
              </div>
            )}
          </div>
        </div>

        {/* Breakdown Cards */}
        <div className="lg:col-span-7 space-y-2.5">
          {segments.map((segment, idx) => {
            const isSelected = selectedSegmentIndex === idx;
            const isHovered = activeSegmentIndex === idx;
            const isHighlighted = isSelected || isHovered;
            return (
              <div
                key={segment.key}
                onClick={() => setSelectedSegmentIndex(selectedSegmentIndex === idx ? null : idx)}
                onMouseEnter={() => setActiveSegmentIndex(idx)}
                onMouseLeave={() => setActiveSegmentIndex(null)}
                className={`border rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-xs ${
                  isHighlighted
                    ? 'bg-purple-50/50 border-purple-400 shadow-md scale-[1.01]'
                    : 'bg-[#F8FAFC] border-[#C8D9E6]/70 hover:border-[#567C8D] hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-3.5 h-3.5 rounded-md shadow-xs"
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="text-sm font-bold text-[#2F4156] flex items-center gap-1.5">
                      <span>{segment.icon}</span>
                      <span>{segment.name}</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-[#C8D9E6] text-[#567C8D]">
                      {segment.riskWeight}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 font-mono">
                    <span className="text-base font-bold text-[#2F4156]">
                      {segment.count.toLocaleString()}
                    </span>
                    <span className="text-xs text-[#567C8D]">
                      ({segment.percentage}%)
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#567C8D] mt-1.5 pl-6 flex items-start gap-1">
                  <span className="font-semibold text-[#2F4156]">Logistics Need:</span>
                  <span>{segment.logisticsNeed}</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Section: Automated Logistics Pre-Staging Manifest */}
      <div className="mt-6 pt-5 border-t border-[#C8D9E6]/60">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#2F4156]">
              Automated Zone Logistics Manifest (Recommended Pre-Staged Supplies)
            </h3>
          </div>
          <span className="text-xs text-[#567C8D]">
            Calculated automatically from demographics census
          </span>
        </div>

        {/* Supply Recommendations Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {segments.flatMap((s) => s.recommendedSupplies).slice(0, 4).map((sup, i) => (
            <div
              key={i}
              className="bg-[#F8FAFC] border border-[#C8D9E6]/70 rounded-2xl p-4 flex flex-col justify-between shadow-xs"
            >
              <div className="flex items-center justify-between text-xs text-[#567C8D]">
                <span className="truncate max-w-[170px] font-semibold">{sup.item}</span>
                <Package className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                  {sup.quantity.toLocaleString()}
                </span>
                <span className="text-[11px] text-[#567C8D] font-medium">
                  {sup.unit}
                </span>
              </div>
              <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-indigo-600 h-full rounded-full"
                  style={{ width: `${Math.min(100, (sup.quantity / 300) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between text-[11px] text-[#567C8D] pt-4 border-t border-[#C8D9E6]/60">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Complies with NDMA vulnerable citizen disaster protocol</span>
        </span>
        <span>Demographics census updated real-time</span>
      </div>
    </div>
  );
};

export default VulnerableDemographicsChart;
