import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Waves,
  CheckCircle2,
  Crosshair,
  Truck,
  Ship,
  Info,
  LayoutGrid,
  TrendingUp,
  Filter,
} from 'lucide-react';

export interface BuildingRiskData {
  id: string;
  buildingName: string;
  address: string;
  zoneName: string;
  expectedOccupancy: number;
  confirmedSafe: number;
  inDistress: number;
  unaccounted: number; // X-axis (0 to 45)
  waterDepthMeters: number; // Y-axis option 1 (0 to 4.0m)
  radarDeltaDb: number; // Y-axis option 2 (-1.0 to -6.5 dB)
  priorityScore: number; // Bubble size (0 - 100)
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  vulnerabilities: {
    elderly: number;
    children: number;
    disabled: number;
    criticalMedical: boolean;
  };
  assignedTeam: string | null;
  status: 'WAITING_DISPATCH' | 'DISPATCHED' | 'ON_SCENE' | 'EVACUATED';
  recommendedUnit: 'HEAVY_BOAT' | 'AMPHIBIOUS' | 'AIR_HOIST' | 'WADING_CREW' | 'DRONE_SURVEILLANCE';
  lastUpdated: string;
}

const INITIAL_BUILDINGS: BuildingRiskData[] = [
  {
    id: 'BLD-401',
    buildingName: 'Riverside Gardens Tower A',
    address: '142 Coastal Marine Drive',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 68,
    confirmedSafe: 12,
    inDistress: 24,
    unaccounted: 32,
    waterDepthMeters: 3.4,
    radarDeltaDb: -5.8,
    priorityScore: 96,
    riskLevel: 'CRITICAL',
    vulnerabilities: { elderly: 11, children: 8, disabled: 4, criticalMedical: true },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'HEAVY_BOAT',
    lastUpdated: '1 min ago',
  },
  {
    id: 'BLD-402',
    buildingName: 'St. Jude Senior Care Facility',
    address: '88 Riverview Expressway',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 54,
    confirmedSafe: 8,
    inDistress: 26,
    unaccounted: 20,
    waterDepthMeters: 2.9,
    radarDeltaDb: -5.2,
    priorityScore: 98,
    riskLevel: 'CRITICAL',
    vulnerabilities: { elderly: 24, children: 0, disabled: 9, criticalMedical: true },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'AMPHIBIOUS',
    lastUpdated: 'Just now',
  },
  {
    id: 'BLD-403',
    buildingName: 'Sunrise Montessori School',
    address: '19 Bayfront Road',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 75,
    confirmedSafe: 42,
    inDistress: 15,
    unaccounted: 18,
    waterDepthMeters: 2.2,
    radarDeltaDb: -4.4,
    priorityScore: 89,
    riskLevel: 'CRITICAL',
    vulnerabilities: { elderly: 2, children: 34, disabled: 1, criticalMedical: false },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'HEAVY_BOAT',
    lastUpdated: '3 mins ago',
  },
  {
    id: 'BLD-404',
    buildingName: 'Marina View Condominiums',
    address: '77 Harbour Basin Blvd',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 50,
    confirmedSafe: 14,
    inDistress: 12,
    unaccounted: 24,
    waterDepthMeters: 2.6,
    radarDeltaDb: -4.9,
    priorityScore: 86,
    riskLevel: 'CRITICAL',
    vulnerabilities: { elderly: 6, children: 7, disabled: 2, criticalMedical: false },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'HEAVY_BOAT',
    lastUpdated: '4 mins ago',
  },
  {
    id: 'BLD-405',
    buildingName: 'Municipal Pump Substation 4',
    address: '3 Basin Canal Road',
    zoneName: 'Zone A - Coastal Flood Basin',
    expectedOccupancy: 8,
    confirmedSafe: 5,
    inDistress: 1,
    unaccounted: 2,
    waterDepthMeters: 3.5,
    radarDeltaDb: -6.1,
    priorityScore: 48,
    riskLevel: 'MEDIUM',
    vulnerabilities: { elderly: 0, children: 0, disabled: 0, criticalMedical: false },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'DRONE_SURVEILLANCE',
    lastUpdated: '6 mins ago',
  },
  {
    id: 'BLD-406',
    buildingName: 'East Canal Logistics Hub',
    address: '10 Industrial Marsh Link',
    zoneName: 'Zone B - Lowland Riverine',
    expectedOccupancy: 14,
    confirmedSafe: 9,
    inDistress: 1,
    unaccounted: 4,
    waterDepthMeters: 2.7,
    radarDeltaDb: -4.7,
    priorityScore: 42,
    riskLevel: 'MEDIUM',
    vulnerabilities: { elderly: 0, children: 0, disabled: 0, criticalMedical: false },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'DRONE_SURVEILLANCE',
    lastUpdated: '8 mins ago',
  },
  {
    id: 'BLD-407',
    buildingName: 'Central Wholesale Market',
    address: '500 Lower Market Street',
    zoneName: 'Zone B - Lowland Riverine',
    expectedOccupancy: 110,
    confirmedSafe: 50,
    inDistress: 22,
    unaccounted: 38,
    waterDepthMeters: 0.9,
    radarDeltaDb: -2.3,
    priorityScore: 74,
    riskLevel: 'HIGH',
    vulnerabilities: { elderly: 12, children: 14, disabled: 3, criticalMedical: false },
    assignedTeam: 'Wading Team Charlie-2',
    status: 'DISPATCHED',
    recommendedUnit: 'WADING_CREW',
    lastUpdated: '2 mins ago',
  },
  {
    id: 'BLD-408',
    buildingName: 'Greenwood Community Center',
    address: '22 Community Plaza',
    zoneName: 'Zone B - Lowland Riverine',
    expectedOccupancy: 64,
    confirmedSafe: 36,
    inDistress: 7,
    unaccounted: 21,
    waterDepthMeters: 0.8,
    radarDeltaDb: -2.0,
    priorityScore: 66,
    riskLevel: 'HIGH',
    vulnerabilities: { elderly: 8, children: 9, disabled: 2, criticalMedical: false },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'WADING_CREW',
    lastUpdated: '5 mins ago',
  },
  {
    id: 'BLD-409',
    buildingName: 'Oakridge Business Park Bldg 3',
    address: '304 Innovation Boulevard',
    zoneName: 'Zone C - Urban Core',
    expectedOccupancy: 40,
    confirmedSafe: 33,
    inDistress: 2,
    unaccounted: 5,
    waterDepthMeters: 0.5,
    radarDeltaDb: -1.4,
    priorityScore: 26,
    riskLevel: 'LOW',
    vulnerabilities: { elderly: 1, children: 0, disabled: 0, criticalMedical: false },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'WADING_CREW',
    lastUpdated: '12 mins ago',
  },
  {
    id: 'BLD-410',
    buildingName: 'Highland Ridge Apartments',
    address: '12 Summit Heights Road',
    zoneName: 'Zone D - Uplands & Peripheral',
    expectedOccupancy: 35,
    confirmedSafe: 32,
    inDistress: 0,
    unaccounted: 3,
    waterDepthMeters: 0.2,
    radarDeltaDb: -0.7,
    priorityScore: 16,
    riskLevel: 'LOW',
    vulnerabilities: { elderly: 2, children: 1, disabled: 0, criticalMedical: false },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'WADING_CREW',
    lastUpdated: '15 mins ago',
  },
  {
    id: 'BLD-411',
    buildingName: 'Crestline Medical Clinic',
    address: '74 Ridge Hospital Way',
    zoneName: 'Zone B - Lowland Riverine',
    expectedOccupancy: 38,
    confirmedSafe: 18,
    inDistress: 6,
    unaccounted: 14,
    waterDepthMeters: 1.8,
    radarDeltaDb: -3.8,
    priorityScore: 78,
    riskLevel: 'CRITICAL',
    vulnerabilities: { elderly: 7, children: 2, disabled: 4, criticalMedical: true },
    assignedTeam: null,
    status: 'WAITING_DISPATCH',
    recommendedUnit: 'AMPHIBIOUS',
    lastUpdated: '2 mins ago',
  },
];

const QUADRANT_CONFIG = {
  Q1: {
    id: 'Q1',
    title: 'Q1 · Critical Heavy Rescue',
    shortTitle: 'Q1: Critical Rescue',
    color: '#f43f5e',
    borderClass: 'border-rose-500/50',
    bgClass: 'bg-rose-500/10',
    textClass: 'text-rose-400',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    cardBorder: 'border-rose-500/30 hover:border-rose-400',
    cardActive: 'bg-rose-950/40 border-rose-400 text-white shadow-md shadow-rose-950/50',
    tag: '🚨 LETHAL RISK (Deep Water & Trapped)',
    actionDesc: 'Mandatory Zodiac boats & Amphibious heavy transport',
  },
  Q2: {
    id: 'Q2',
    title: 'Q2 · Hazard Surveillance',
    shortTitle: 'Q2: Hazard Watch',
    color: '#f59e0b',
    borderClass: 'border-amber-500/40',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-400',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    cardBorder: 'border-amber-500/30 hover:border-amber-400',
    cardActive: 'bg-amber-950/40 border-amber-500 text-white shadow-md shadow-amber-950/50',
    tag: '⚠️ HAZARD RISK (Deep Water, Low Civilians)',
    actionDesc: 'Drone thermal inspections & structural monitoring',
  },
  Q4: {
    id: 'Q4',
    title: 'Q4 · Rapid Ground Evacuation',
    shortTitle: 'Q4: Ground Evacuation',
    color: '#06b6d4',
    borderClass: 'border-cyan-500/40',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-400',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    cardBorder: 'border-cyan-500/30 hover:border-cyan-400',
    cardActive: 'bg-cyan-950/40 border-cyan-500 text-white shadow-md shadow-cyan-950/50',
    tag: '🚶 EVACUATION RISK (Shallow Water, High Trapped)',
    actionDesc: 'Rapid ground wading crews & high-clearance buses',
  },
  Q3: {
    id: 'Q3',
    title: 'Q3 · Routine Monitoring',
    shortTitle: 'Q3: Routine Patrol',
    color: '#10b981',
    borderClass: 'border-emerald-500/40',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    cardBorder: 'border-emerald-500/30 hover:border-emerald-400',
    cardActive: 'bg-emerald-950/40 border-emerald-500 text-white shadow-md shadow-emerald-950/50',
    tag: '🟢 LOW RISK (Shallow Water, Low Civilians)',
    actionDesc: 'Regular phone check-ins & passive logs',
  },
} as const;

interface BuildingRiskMatrixProps {
  className?: string;
}

export const BuildingRiskMatrix: React.FC<BuildingRiskMatrixProps> = ({ className = '' }) => {
  const [buildings, setBuildings] = useState<BuildingRiskData[]>(INITIAL_BUILDINGS);
  const [viewMode, setViewMode] = useState<'SCATTER' | 'QUADRANT_GRID'>('SCATTER');
  const [yAxisMetric, setYAxisMetric] = useState<'DEPTH' | 'RADAR'>('DEPTH');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [quadrantFilter, setQuadrantFilter] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('BLD-401');
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Quadrant Cutoff Thresholds
  const xCutoff = 12; // Unaccounted threshold (>= 12 is high trapped group)
  const yCutoff = yAxisMetric === 'DEPTH' ? 1.5 : 3.5;

  const filteredBuildings = useMemo(() => {
    return buildings.filter((b) => selectedZone === 'ALL' || b.zoneName === selectedZone);
  }, [buildings, selectedZone]);

  const selectedBuilding = useMemo(() => {
    return buildings.find((b) => b.id === selectedBuildingId) || buildings[0];
  }, [buildings, selectedBuildingId]);

  const getQuadrant = (b: BuildingRiskData): 'Q1' | 'Q2' | 'Q3' | 'Q4' => {
    const yVal = yAxisMetric === 'DEPTH' ? b.waterDepthMeters : Math.abs(b.radarDeltaDb);
    const isHighX = b.unaccounted >= xCutoff;
    const isHighY = yVal >= yCutoff;

    if (isHighX && isHighY) return 'Q1';
    if (!isHighX && isHighY) return 'Q2';
    if (!isHighX && !isHighY) return 'Q3';
    return 'Q4';
  };

  const groupedQuadrants = useMemo(() => {
    const q1: BuildingRiskData[] = [];
    const q2: BuildingRiskData[] = [];
    const q3: BuildingRiskData[] = [];
    const q4: BuildingRiskData[] = [];

    filteredBuildings.forEach((b) => {
      const q = getQuadrant(b);
      if (q === 'Q1') q1.push(b);
      else if (q === 'Q2') q2.push(b);
      else if (q === 'Q3') q3.push(b);
      else q4.push(b);
    });

    return { q1, q2, q3, q4 };
  }, [filteredBuildings, yAxisMetric, xCutoff, yCutoff]);

  const handleDispatch = (buildingId: string, unitName: string) => {
    setBuildings((prev) =>
      prev.map((b) =>
        b.id === buildingId
          ? {
              ...b,
              status: 'DISPATCHED',
              assignedTeam: unitName,
              lastUpdated: 'Just now',
            }
          : b
      )
    );

    const b = buildings.find((item) => item.id === buildingId);
    setToastMessage(`Dispatched ${unitName} to ${b?.buildingName || 'Building'}!`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // SVG Dimensions
  const SVG_WIDTH = 860;
  const SVG_HEIGHT = 450;
  const MARGIN_LEFT = 75;
  const MARGIN_RIGHT = 40;
  const MARGIN_TOP = 35;
  const MARGIN_BOTTOM = 60;
  const INNER_WIDTH = SVG_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const INNER_HEIGHT = SVG_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

  const MAX_X = 45;
  const MAX_Y = yAxisMetric === 'DEPTH' ? 4.0 : 7.0;

  const scaleX = (val: number) => MARGIN_LEFT + (Math.min(val, MAX_X) / MAX_X) * INNER_WIDTH;
  const scaleY = (val: number) => MARGIN_TOP + INNER_HEIGHT - (Math.min(val, MAX_Y) / MAX_Y) * INNER_HEIGHT;

  const cutoffXPos = scaleX(xCutoff);
  const cutoffYPos = scaleY(yCutoff);

  const selectedQuad = getQuadrant(selectedBuilding);
  const selectedConfig = QUADRANT_CONFIG[selectedQuad];

  return (
    <div className={`w-full bg-white border border-[#C8D9E6]/70 rounded-3xl p-5 sm:p-7 shadow-sm space-y-6 ${className}`}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#2F4156] text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-[#567C8D]/40">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#C8D9E6]/60 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
                  Building Risk Matrix
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  Priority Quadrants
                </span>
              </div>
              <p className="text-xs text-[#567C8D] mt-0.5">
                Every bubble represents a monitored structure. Quadrants prioritize immediate heavy boat vs ground rescue.
              </p>
            </div>
          </div>
        </div>

        {/* View Switchers & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scatter vs 2x2 Board */}
          <div className="flex items-center bg-[#F5EFEB] p-1 rounded-xl border border-[#C8D9E6] text-xs font-semibold">
            <button
              onClick={() => setViewMode('SCATTER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'SCATTER'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Scatter Matrix</span>
            </button>
            <button
              onClick={() => setViewMode('QUADRANT_GRID')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'QUADRANT_GRID'
                  ? 'bg-[#2F4156] text-white shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>2×2 Quadrant Board</span>
            </button>
          </div>

          {/* Metric Switcher */}
          <div className="flex items-center bg-[#F5EFEB] p-1 rounded-xl border border-[#C8D9E6] text-xs">
            <button
              onClick={() => setYAxisMetric('DEPTH')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                yAxisMetric === 'DEPTH'
                  ? 'bg-white text-cyan-700 font-bold shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <Waves className="w-3.5 h-3.5 text-cyan-600" />
              <span>Depth (m)</span>
            </button>
            <button
              onClick={() => setYAxisMetric('RADAR')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                yAxisMetric === 'RADAR'
                  ? 'bg-white text-purple-700 font-bold shadow-xs'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <span>Radar ΔdB</span>
            </button>
          </div>

          {/* Zone filter */}
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="bg-[#F5EFEB] border border-[#C8D9E6] text-xs text-[#2F4156] font-semibold rounded-xl px-3 py-2 outline-none focus:border-[#2F4156] cursor-pointer"
          >
            <option value="ALL">All Hazard Zones</option>
            <option value="Zone A - Coastal Flood Basin">Zone A - Coastal Flood Basin</option>
            <option value="Zone B - Lowland Riverine">Zone B - Lowland Riverine</option>
            <option value="Zone C - Urban Core">Zone C - Urban Core</option>
            <option value="Zone D - Uplands & Peripheral">Zone D - Uplands</option>
          </select>
        </div>
      </div>

      {/* QUICK QUADRANT FILTER STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[#F5EFEB]/70 p-2.5 rounded-xl border border-[#C8D9E6]">
        <div className="flex items-center gap-1.5 font-semibold text-[#2F4156]">
          <Filter className="w-3.5 h-3.5 text-indigo-600" />
          <span>Filter by Quadrant:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setQuadrantFilter('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              quadrantFilter === 'ALL'
                ? 'bg-[#2F4156] text-white shadow-xs'
                : 'bg-white text-[#567C8D] hover:text-[#2F4156] border border-[#C8D9E6]'
            }`}
          >
            All Sites ({filteredBuildings.length})
          </button>

          {/* Q1 Filter (Rose) */}
          <button
            onClick={() => setQuadrantFilter('Q1')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              quadrantFilter === 'Q1'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>🚨 {QUADRANT_CONFIG.Q1.shortTitle} ({groupedQuadrants.q1.length})</span>
          </button>

          {/* Q2 Filter (Amber) */}
          <button
            onClick={() => setQuadrantFilter('Q2')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              quadrantFilter === 'Q2'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>⚠️ {QUADRANT_CONFIG.Q2.shortTitle} ({groupedQuadrants.q2.length})</span>
          </button>

          {/* Q4 Filter (Cyan) */}
          <button
            onClick={() => setQuadrantFilter('Q4')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              quadrantFilter === 'Q4'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
            <span>🚶 {QUADRANT_CONFIG.Q4.shortTitle} ({groupedQuadrants.q4.length})</span>
          </button>

          {/* Q3 Filter (Emerald) */}
          <button
            onClick={() => setQuadrantFilter('Q3')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              quadrantFilter === 'Q3'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>🟢 {QUADRANT_CONFIG.Q3.shortTitle} ({groupedQuadrants.q3.length})</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: NATIVE SVG SCATTER MATRIX */}
      {viewMode === 'SCATTER' ? (
        <div className="relative w-full bg-slate-950 rounded-2xl border border-slate-800 p-3 sm:p-5 overflow-hidden shadow-inner">
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full h-auto select-none"
            style={{ maxHeight: '520px' }}
          >
            {/* Quadrant Background Shading */}
            <rect
              x={cutoffXPos}
              y={MARGIN_TOP}
              width={MARGIN_LEFT + INNER_WIDTH - cutoffXPos}
              height={cutoffYPos - MARGIN_TOP}
              fill="rgba(244, 63, 94, 0.09)"
              stroke="rgba(244, 63, 94, 0.35)"
              strokeDasharray="4 4"
            />
            <rect
              x={MARGIN_LEFT}
              y={MARGIN_TOP}
              width={cutoffXPos - MARGIN_LEFT}
              height={cutoffYPos - MARGIN_TOP}
              fill="rgba(245, 158, 11, 0.06)"
              stroke="rgba(245, 158, 11, 0.25)"
              strokeDasharray="4 4"
            />
            <rect
              x={MARGIN_LEFT}
              y={cutoffYPos}
              width={cutoffXPos - MARGIN_LEFT}
              height={MARGIN_TOP + INNER_HEIGHT - cutoffYPos}
              fill="rgba(16, 185, 129, 0.05)"
              stroke="rgba(16, 185, 129, 0.2)"
              strokeDasharray="4 4"
            />
            <rect
              x={cutoffXPos}
              y={cutoffYPos}
              width={MARGIN_LEFT + INNER_WIDTH - cutoffXPos}
              height={MARGIN_TOP + INNER_HEIGHT - cutoffYPos}
              fill="rgba(6, 182, 212, 0.06)"
              stroke="rgba(6, 182, 212, 0.25)"
              strokeDasharray="4 4"
            />

            {/* Quadrant Header Labels */}
            <g pointerEvents="none">
              <text x={MARGIN_LEFT + 12} y={MARGIN_TOP + 20} fill="#f59e0b" fontSize="11" fontWeight="bold">
                ⚠️ Q2: HAZARD SURVEILLANCE
              </text>
              <text x={MARGIN_LEFT + 12} y={MARGIN_TOP + 34} fill="#fcd34d" fontSize="9.5" opacity="0.8">
                Deep Water (&ge;{yCutoff}m) &bull; Low Trapped (&lt;{xCutoff})
              </text>

              <text
                x={MARGIN_LEFT + INNER_WIDTH - 12}
                y={MARGIN_TOP + 20}
                textAnchor="end"
                fill="#f43f5e"
                fontSize="12"
                fontWeight="900"
              >
                🚨 Q1: CRITICAL HEAVY RESCUE
              </text>
              <text
                x={MARGIN_LEFT + INNER_WIDTH - 12}
                y={MARGIN_TOP + 35}
                textAnchor="end"
                fill="#fda4af"
                fontSize="10"
                fontWeight="bold"
              >
                Deep Water (&ge;{yCutoff}m) & High Trapped (&ge;{xCutoff}) &bull; Boats & Amphibious
              </text>

              <text x={MARGIN_LEFT + 12} y={MARGIN_TOP + INNER_HEIGHT - 28} fill="#10b981" fontSize="11" fontWeight="bold">
                🟢 Q3: ROUTINE PATROL
              </text>
              <text x={MARGIN_LEFT + 12} y={MARGIN_TOP + INNER_HEIGHT - 14} fill="#6ee7b7" fontSize="9.5" opacity="0.8">
                Shallow Water (&lt;{yCutoff}m) &bull; Low Trapped (&lt;{xCutoff})
              </text>

              <text
                x={MARGIN_LEFT + INNER_WIDTH - 12}
                y={MARGIN_TOP + INNER_HEIGHT - 28}
                textAnchor="end"
                fill="#06b6d4"
                fontSize="11"
                fontWeight="bold"
              >
                🚶 Q4: GROUND EVACUATION
              </text>
              <text
                x={MARGIN_LEFT + INNER_WIDTH - 12}
                y={MARGIN_TOP + INNER_HEIGHT - 14}
                textAnchor="end"
                fill="#67e8f9"
                fontSize="9.5"
                opacity="0.8"
              >
                Shallow Water (&lt;{yCutoff}m) &bull; High Trapped (&ge;{xCutoff}) &bull; Wading Crews
              </text>
            </g>

            {/* Cutoff Lines */}
            <line
              x1={cutoffXPos}
              y1={MARGIN_TOP}
              x2={cutoffXPos}
              y2={MARGIN_TOP + INNER_HEIGHT}
              stroke="#f43f5e"
              strokeWidth="1.75"
              strokeDasharray="4 4"
            />
            <line
              x1={MARGIN_LEFT}
              y1={cutoffYPos}
              x2={MARGIN_LEFT + INNER_WIDTH}
              y2={cutoffYPos}
              stroke="#f43f5e"
              strokeWidth="1.75"
              strokeDasharray="4 4"
            />

            <text x={cutoffXPos + 6} y={MARGIN_TOP + 50} fill="#f43f5e" fontSize="10" fontWeight="bold">
              Trapped Cutoff (12)
            </text>
            <text x={MARGIN_LEFT + 12} y={cutoffYPos - 6} fill="#f43f5e" fontSize="10" fontWeight="bold">
              {yAxisMetric === 'DEPTH' ? 'Depth Cutoff (1.5m)' : 'SAR Cutoff (3.5 dB)'}
            </text>

            {/* Axes */}
            <line
              x1={MARGIN_LEFT}
              y1={MARGIN_TOP + INNER_HEIGHT}
              x2={MARGIN_LEFT + INNER_WIDTH}
              y2={MARGIN_TOP + INNER_HEIGHT}
              stroke="#475569"
              strokeWidth="1.5"
            />
            <line
              x1={MARGIN_LEFT}
              y1={MARGIN_TOP}
              x2={MARGIN_LEFT}
              y2={MARGIN_TOP + INNER_HEIGHT}
              stroke="#475569"
              strokeWidth="1.5"
            />

            {/* Ticks */}
            {[0, 10, 20, 30, 40].map((tick) => {
              const xPos = scaleX(tick);
              return (
                <g key={`xtick-${tick}`}>
                  <line x1={xPos} y1={MARGIN_TOP + INNER_HEIGHT} x2={xPos} y2={MARGIN_TOP + INNER_HEIGHT + 5} stroke="#64748b" />
                  <text
                    x={xPos}
                    y={MARGIN_TOP + INNER_HEIGHT + 18}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="10.5"
                    fontFamily="monospace"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {(yAxisMetric === 'DEPTH' ? [0, 1.0, 2.0, 3.0, 4.0] : [0, 1.5, 3.0, 4.5, 6.0]).map((tick) => {
              const yPos = scaleY(tick);
              return (
                <g key={`ytick-${tick}`}>
                  <line x1={MARGIN_LEFT - 5} y1={yPos} x2={MARGIN_LEFT} y2={yPos} stroke="#64748b" />
                  <text
                    x={MARGIN_LEFT - 8}
                    y={yPos + 3.5}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {tick.toFixed(1)}{yAxisMetric === 'DEPTH' ? 'm' : 'dB'}
                  </text>
                </g>
              );
            })}

            {/* Axis Titles */}
            <text
              x={MARGIN_LEFT + INNER_WIDTH / 2}
              y={SVG_HEIGHT - 12}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="12"
              fontWeight="bold"
            >
              Number of Unaccounted / Trapped People Inside Structure ➔
            </text>

            <text
              x={-(MARGIN_TOP + INNER_HEIGHT / 2)}
              y={20}
              transform="rotate(-90)"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="12"
              fontWeight="bold"
            >
              {yAxisMetric === 'DEPTH'
                ? '▲ Floodwater Inundation Depth (meters)'
                : '▲ Sentinel-1 SAR Radar ΔdB Drop (reflection loss)'}
            </text>

            {/* BUBBLE NODES */}
            {filteredBuildings.map((b) => {
              const q = getQuadrant(b);
              const isFilteredOut = quadrantFilter !== 'ALL' && quadrantFilter !== q;
              const yVal = yAxisMetric === 'DEPTH' ? b.waterDepthMeters : Math.abs(b.radarDeltaDb);
              const cx = scaleX(b.unaccounted);
              const cy = scaleY(yVal);
              const radius = Math.max(11, Math.min(24, 10 + (b.priorityScore / 100) * 14));
              const color = QUADRANT_CONFIG[q].color;
              const isSelected = selectedBuildingId === b.id;
              const isHovered = hoveredBuildingId === b.id;

              return (
                <g
                  key={b.id}
                  onClick={() => setSelectedBuildingId(b.id)}
                  onMouseEnter={() => setHoveredBuildingId(b.id)}
                  onMouseLeave={() => setHoveredBuildingId(null)}
                  className="cursor-pointer"
                  style={{
                    opacity: isFilteredOut ? 0.15 : 1,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius + 4.5}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                    />
                  )}

                  <circle cx={cx} cy={cy} r={radius + 2} fill={color} opacity={isHovered ? 0.45 : 0.22} />

                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={color}
                    stroke="#090d16"
                    strokeWidth="2"
                    opacity={b.status === 'DISPATCHED' ? 0.6 : 0.95}
                  />

                  <text
                    x={cx}
                    y={cy + 3.5}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    {b.priorityScore}
                  </text>

                  {(isSelected || isHovered) && (
                    <g pointerEvents="none">
                      <rect
                        x={cx - 65}
                        y={cy - radius - 22}
                        width="130"
                        height="18"
                        rx="4"
                        fill="#0f172a"
                        stroke={color}
                        strokeWidth="1.5"
                      />
                      <text
                        x={cx}
                        y={cy - radius - 10}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="9.5"
                        fontWeight="bold"
                      >
                        {b.buildingName.length > 18 ? b.buildingName.slice(0, 16) + '...' : b.buildingName}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        /* VIEW 2: 2×2 TACTICAL QUADRANT BOARD */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top-Left: Q2 */}
          <div className="bg-[#F8FAFC] border border-amber-300 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#C8D9E6]/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <h3 className="font-bold text-sm text-amber-800">Q2 &bull; Hazard Surveillance</h3>
              </div>
              <span className="text-[11px] text-amber-800 font-bold px-2 py-0.5 rounded bg-amber-100">
                {groupedQuadrants.q2.length} Structures
              </span>
            </div>
            <p className="text-[11px] text-[#567C8D]">
              Deep water (&ge;{yCutoff}m) but low trapped count (&lt;{xCutoff}). Drone thermal inspections and structural monitoring.
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {groupedQuadrants.q2.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBuildingId(b.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedBuildingId === b.id
                      ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-xs'
                      : 'bg-white border-[#C8D9E6] text-[#2F4156] hover:border-amber-300'
                  }`}
                >
                  <div>
                    <span className="font-bold text-xs block">{b.buildingName}</span>
                    <span className="text-[10px] text-[#567C8D]">
                      {b.unaccounted} trapped &bull; {b.waterDepthMeters}m water
                    </span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    Score {b.priorityScore}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top-Right: Q1 */}
          <div className="bg-rose-50/50 border-2 border-rose-400 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-rose-200 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <h3 className="font-extrabold text-sm text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Q1 &bull; CRITICAL DISPATCH (HEAVY RESCUE)
                </h3>
              </div>
              <span className="text-xs text-rose-800 font-extrabold px-2.5 py-0.5 rounded-full bg-rose-100">
                {groupedQuadrants.q1.length} Lethal Sites
              </span>
            </div>
            <p className="text-[11px] text-rose-700 font-medium">
              High water (&ge;{yCutoff}m) AND high trapped count (&ge;{xCutoff}). <strong>Mandatory Zodiac boats & Amphibious vehicles.</strong>
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {groupedQuadrants.q1.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBuildingId(b.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedBuildingId === b.id
                      ? 'bg-rose-100 border-rose-500 text-rose-900 shadow-xs'
                      : 'bg-white border-rose-200 text-[#2F4156] hover:border-rose-400'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{b.buildingName}</span>
                      {b.status === 'DISPATCHED' && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                          Dispatched
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#567C8D]">
                      {b.unaccounted} trapped &bull; {b.waterDepthMeters}m depth &bull; {b.vulnerabilities.elderly + b.vulnerabilities.children} vulnerable
                    </span>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded bg-rose-600 text-white shadow-xs">
                    {b.priorityScore}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom-Left: Q3 */}
          <div className="bg-[#F8FAFC] border border-emerald-300 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#C8D9E6]/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <h3 className="font-bold text-sm text-emerald-800">Q3 &bull; Routine Monitoring</h3>
              </div>
              <span className="text-[11px] text-emerald-800 font-bold px-2 py-0.5 rounded bg-emerald-100">
                {groupedQuadrants.q3.length} Sites
              </span>
            </div>
            <p className="text-[11px] text-[#567C8D]">
              Low water (&lt;{yCutoff}m) and low trapped count (&lt;{xCutoff}). Regular phone checks and patrol logs.
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {groupedQuadrants.q3.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBuildingId(b.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedBuildingId === b.id
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-900 shadow-xs'
                      : 'bg-white border-[#C8D9E6] text-[#2F4156] hover:border-emerald-300'
                  }`}
                >
                  <div>
                    <span className="font-bold text-xs block">{b.buildingName}</span>
                    <span className="text-[10px] text-[#567C8D]">
                      {b.unaccounted} trapped &bull; {b.waterDepthMeters}m water
                    </span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Score {b.priorityScore}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom-Right: Q4 */}
          <div className="bg-[#F8FAFC] border border-cyan-300 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#C8D9E6]/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
                <h3 className="font-bold text-sm text-cyan-800">Q4 &bull; Rapid Ground Evacuation</h3>
              </div>
              <span className="text-[11px] text-cyan-800 font-bold px-2 py-0.5 rounded bg-cyan-100">
                {groupedQuadrants.q4.length} Sites
              </span>
            </div>
            <p className="text-[11px] text-[#567C8D]">
              Shallow water (&lt;{yCutoff}m) but high trapped count (&ge;{xCutoff}). Rapid ground wading teams and high-clearance buses.
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {groupedQuadrants.q4.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBuildingId(b.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedBuildingId === b.id
                      ? 'bg-cyan-100 border-cyan-400 text-cyan-900 shadow-xs'
                      : 'bg-white border-[#C8D9E6] text-[#2F4156] hover:border-cyan-300'
                  }`}
                >
                  <div>
                    <span className="font-bold text-xs block">{b.buildingName}</span>
                    <span className="text-[10px] text-[#567C8D]">
                      {b.unaccounted} trapped &bull; {b.waterDepthMeters}m water
                    </span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-800">
                    Score {b.priorityScore}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SELECTED STRUCTURE INSPECTOR */}
      {selectedBuilding && (
        <div
          className="bg-slate-950 rounded-2xl p-4 sm:p-5 shadow-inner space-y-4 border-2 transition-colors duration-200 text-white"
          style={{ borderColor: `${selectedConfig.color}80` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white text-base shadow-lg transition-colors"
                style={{ backgroundColor: selectedConfig.color }}
              >
                {selectedBuilding.priorityScore}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {selectedBuilding.buildingName}
                  </h3>
                  <span className="text-xs font-mono text-slate-400">({selectedBuilding.id})</span>
                  <span
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${selectedConfig.color}25`,
                      color: selectedConfig.color,
                      border: `1px solid ${selectedConfig.color}40`,
                    }}
                  >
                    {selectedConfig.title}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{selectedBuilding.address} &bull; {selectedBuilding.zoneName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  selectedBuilding.status === 'DISPATCHED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {selectedBuilding.status === 'DISPATCHED'
                  ? `Assigned: ${selectedBuilding.assignedTeam}`
                  : 'Awaiting Rescue Unit'}
              </span>
            </div>
          </div>

          {/* 4 Diagnostic Parameter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-semibold block">Trapped Balance</span>
              <div className="mt-1 space-y-0.5">
                <div className="flex justify-between font-bold" style={{ color: selectedConfig.color }}>
                  <span>Unaccounted:</span>
                  <span>{selectedBuilding.unaccounted} pers.</span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Confirmed Safe:</span>
                  <span>{selectedBuilding.confirmedSafe}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Expected Occupancy:</span>
                  <span>{selectedBuilding.expectedOccupancy}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-semibold block">Hydrological Danger</span>
              <div className="mt-1 space-y-0.5">
                <div className="flex justify-between font-bold text-cyan-400">
                  <span>Water Depth:</span>
                  <span>{selectedBuilding.waterDepthMeters} m</span>
                </div>
                <div className="flex justify-between font-mono text-purple-300 text-[11px]">
                  <span>Radar ΔdB Drop:</span>
                  <span>{selectedBuilding.radarDeltaDb} dB</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {selectedBuilding.waterDepthMeters >= 2.0 ? '🚨 First floor completely inundated' : 'Wadeable with caution'}
                </div>
              </div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-semibold block">High Vulnerability</span>
              <div className="mt-1 space-y-0.5">
                <div className="flex justify-between text-amber-300">
                  <span>Elderly (65+):</span>
                  <span>{selectedBuilding.vulnerabilities.elderly}</span>
                </div>
                <div className="flex justify-between text-purple-300">
                  <span>Children (&lt;18):</span>
                  <span>{selectedBuilding.vulnerabilities.children}</span>
                </div>
                <div className="flex justify-between text-blue-300">
                  <span>Disabled:</span>
                  <span>{selectedBuilding.vulnerabilities.disabled}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-semibold block">Recommended Unit</span>
                <span className="text-sm font-bold text-white mt-1 block">
                  {selectedBuilding.recommendedUnit === 'HEAVY_BOAT'
                    ? '🚤 Zodiac Motorized Boat'
                    : selectedBuilding.recommendedUnit === 'AMPHIBIOUS'
                    ? '🚛 Amphibious Heavy Truck'
                    : selectedBuilding.recommendedUnit === 'AIR_HOIST'
                    ? '🚁 Helicopter Air Hoist'
                    : selectedBuilding.recommendedUnit === 'DRONE_SURVEILLANCE'
                    ? '🛰 Drone Thermal Sweep'
                    : '🦺 Ground Wading Team'}
                </span>
              </div>
              <span className="text-[10px]" style={{ color: selectedConfig.color }}>
                {selectedConfig.actionDesc}
              </span>
            </div>
          </div>

          {/* Action Dispatch Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              1-click dispatch sends live GPS target coordinates to active emergency responder telemetry.
            </span>

            <div className="flex items-center gap-2">
              {selectedBuilding.status === 'WAITING_DISPATCH' ? (
                <>
                  <button
                    onClick={() => handleDispatch(selectedBuilding.id, 'Zodiac Boat Squad #3')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    <Ship className="w-4 h-4" />
                    <span>Dispatch Heavy Boat Squad</span>
                  </button>

                  <button
                    onClick={() => handleDispatch(selectedBuilding.id, 'Amphibious Truck Bravo')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2F4156] hover:bg-[#1C2541] text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Dispatch Amphibious Unit</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Assigned to {selectedBuilding.assignedTeam} &bull; En Route</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
