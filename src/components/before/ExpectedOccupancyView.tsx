import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  disasterService,
  BuildingIntelligence,
  DisasterEvent,
  AffectedZone,
} from '../../services/disasterService.ts';
import { User } from '../../services/authService.ts';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  Building2,
  Users,
  Home,
  Tent,
  MapPin,
  AlertTriangle,
  ShieldCheck,
  Search,
  Filter,
  Loader2,
  Lock,
  Map as MapIcon,
  Layers,
  Crosshair,
  BarChart3,
  LayoutGrid,
  RefreshCw,
  Info,
} from 'lucide-react';

interface ExpectedOccupancyViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
}

export const ExpectedOccupancyView: React.FC<ExpectedOccupancyViewProps> = ({
  user,
  activeDisaster,
}) => {
  const { t } = useLanguage();
  const [buildings, setBuildings] = useState<BuildingIntelligence[]>([]);
  const [zones, setZones] = useState<AffectedZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState<'ALL' | 'RED' | 'ORANGE' | 'SAFE'>('ALL');
  const [viewMode, setViewMode] = useState<'SPLIT' | 'MAP' | 'CARDS'>('SPLIT');
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingIntelligence | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    loadData();
  }, [activeDisaster?.id]);

  const loadData = async () => {
    if (!activeDisaster) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [buildingList, zoneList] = await Promise.all([
        disasterService.getBuildingIntelligence(activeDisaster.id),
        disasterService.getAffectedZones(activeDisaster.id).catch(() => []),
      ]);
      setBuildings(buildingList);
      setZones(zoneList);
      if (buildingList.length > 0 && !selectedBuilding) {
        setSelectedBuilding(buildingList[0]);
      }
    } catch (e: any) {
      console.error('Failed to load building occupancy intelligence:', e);
      setErrorMessage(e?.message || 'Failed to load building occupancy intelligence');
      setBuildings([]);
      setZones([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter buildings based on search query and risk level filter
  const filteredBuildings = buildings.filter((b) => {
    const matchesSearch =
      b.buildingName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.zoneName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterRisk === 'RED') {
      return b.riskLevel === 'RED' || b.riskLevel === 'HIGH' || b.riskLevel === 'EXTREME';
    }
    if (filterRisk === 'ORANGE') {
      return b.riskLevel === 'ORANGE' || b.riskLevel === 'MEDIUM';
    }
    if (filterRisk === 'SAFE') {
      return b.riskLevel === 'SAFE' || b.riskLevel === 'LOW' || !b.isAffected;
    }
    return true;
  });

  // Calculate high-level summary KPIs
  const totalMonitored = buildings.length;
  const totalResidents = buildings.reduce((acc, b) => acc + b.registeredPopulation, 0);
  const totalInHome = buildings.reduce((acc, b) => acc + b.expectedOccupancy, 0);
  const totalShelter = buildings.reduce((acc, b) => acc + b.expectedShelter, 0);
  const redZoneBuildings = buildings.filter(
    (b) => b.riskLevel === 'RED' || b.riskLevel === 'HIGH' || b.riskLevel === 'EXTREME'
  ).length;
  const orangeZoneBuildings = buildings.filter(
    (b) => b.riskLevel === 'ORANGE' || b.riskLevel === 'MEDIUM'
  ).length;
  const safeZoneBuildings = buildings.filter(
    (b) => b.riskLevel === 'SAFE' || b.riskLevel === 'LOW' || !b.isAffected
  ).length;

  // Initialize and manage Leaflet map instance
  useEffect(() => {
    if (loading || !mapContainerRef.current) return;

    // Check if existing map instance is attached to a detached DOM node
    if (mapInstanceRef.current) {
      try {
        const container = mapInstanceRef.current.getContainer();
        if (!container || container !== mapContainerRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      } catch {
        mapInstanceRef.current = null;
      }
    }

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [12.9716, 77.6200], // Bengaluru Urban center
        zoom: 11,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    renderMapLayers();

    if (viewMode !== 'CARDS' && mapInstanceRef.current) {
      mapInstanceRef.current.invalidateSize();
      const t1 = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
      const t2 = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 300);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [loading, viewMode, buildings, zones, filterRisk]);

  // Handle automatic resize when container dimension changes
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mapInstanceRef.current && viewMode !== 'CARDS') {
        mapInstanceRef.current.invalidateSize();
      }
    });
    observer.observe(mapContainerRef.current);
    return () => {
      observer.disconnect();
    };
  }, [viewMode]);

  // Clean up map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const createBuildingIcon = (
    riskLevel: string,
    occupancy: number,
    isSelected: boolean
  ) => {
    const isRed = riskLevel === 'RED' || riskLevel === 'HIGH' || riskLevel === 'EXTREME';
    const isOrange = riskLevel === 'ORANGE' || riskLevel === 'MEDIUM';

    const bg = isRed ? '#DC2626' : isOrange ? '#EA580C' : '#059669';
    const label = isRed ? 'RED' : isOrange ? 'ORANGE' : 'SAFE';
    const size = isSelected ? 38 : 32;

    return L.divIcon({
      className: '',
      html: `
        <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="
            background-color: ${bg};
            width: ${size}px;
            height: ${size}px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            border: ${isSelected ? '3px solid #FCD34D' : '2px solid white'};
            transform: ${isSelected ? 'scale(1.12)' : 'scale(1)'};
            transition: transform 0.2s ease;
          ">
            <svg width="${size * 0.55}" height="${size * 0.55}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
          </div>
          <span style="
            position: absolute;
            bottom: -8px;
            background: #2F4156;
            color: #fff;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 5px;
            border-radius: 6px;
            white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0,0,0,0.25);
            border: 1px solid white;
          ">
            ${label} • 🏠${occupancy}
          </span>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
  };

  const renderMapLayers = () => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    markerMapRef.current.clear();

    // 1. Render Affected Flood Zones Polygons
    if (zones && zones.length > 0) {
      zones.forEach((zone) => {
        try {
          let coordsRaw: any[] = [];
          if (typeof zone.polygonGeoJson === 'string') {
            coordsRaw = JSON.parse(zone.polygonGeoJson);
          } else if (Array.isArray(zone.polygonGeoJson)) {
            coordsRaw = zone.polygonGeoJson;
          }

          if (!Array.isArray(coordsRaw) || coordsRaw.length === 0) return;

          // Invert [lng, lat] -> [lat, lng] if needed
          const leafletCoords: [number, number][] = coordsRaw
            .map((pt: any): [number, number] | null => {
              if (Array.isArray(pt) && pt.length >= 2) {
                const p0 = Number(pt[0]);
                const p1 = Number(pt[1]);
                if (p0 > 50 && p1 < 30) return [p1, p0]; // [lat, lng]
                return [p0, p1];
              }
              return null;
            })
            .filter((pt): pt is [number, number] => pt !== null);

          if (leafletCoords.length < 3) return;

          const isRed =
            zone.riskLevel === 'RED' || zone.riskLevel === 'HIGH' || zone.riskLevel === 'EXTREME';
          const isOrange = zone.riskLevel === 'ORANGE' || zone.riskLevel === 'MEDIUM';

          const strokeColor = isRed ? '#DC2626' : isOrange ? '#EA580C' : '#CA8A04';
          const fillColor = isRed ? '#DC2626' : isOrange ? '#F97316' : '#EAB308';

          const polygon = L.polygon(leafletCoords, {
            color: strokeColor,
            weight: 2.5,
            fillColor: fillColor,
            fillOpacity: 0.22,
          }).addTo(group);

          const zonePopup = `
            <div style="font-family: inherit; min-width: 220px; color: #2F4156; padding: 4px;">
              <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: ${
                isRed ? '#FEE2E2' : '#FFEDD5'
              }; color: ${strokeColor}; padding: 2px 7px; border-radius: 6px; display: inline-block; margin-bottom: 4px;">
                ${zone.riskLevel || 'HAZARD'} FLOOD ZONE
              </div>
              <h4 style="font-weight: 700; font-size: 13px; margin: 0 0 3px 0; color: #2F4156;">${
                zone.name
              }</h4>
              <p style="font-size: 11px; color: #567C8D; margin: 0;">
                Hydrological inundation corridor under active flood model.
              </p>
            </div>
          `;
          polygon.bindPopup(zonePopup);
        } catch (e) {
          console.warn('Failed to render zone polygon in ExpectedOccupancyView:', e);
        }
      });
    }

    // 2. Render Building Markers
    filteredBuildings.forEach((b) => {
      if (b.latitude === undefined || b.longitude === undefined) return;

      const isSelected = selectedBuilding?.buildingName === b.buildingName;
      const icon = createBuildingIcon(b.riskLevel, b.expectedOccupancy, isSelected);

      const marker = L.marker([b.latitude, b.longitude], {
        icon,
        zIndexOffset: isSelected ? 1000 : 500,
      }).addTo(group);

      const isRed = b.riskLevel === 'RED' || b.riskLevel === 'HIGH' || b.riskLevel === 'EXTREME';
      const isOrange = b.riskLevel === 'ORANGE' || b.riskLevel === 'MEDIUM';
      const badgeBg = isRed ? '#FEE2E2' : isOrange ? '#FFEDD5' : '#D1FAE5';
      const badgeColor = isRed ? '#DC2626' : isOrange ? '#EA580C' : '#059669';

      const popupHtml = `
        <div style="font-family: inherit; min-width: 220px; color: #2F4156; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: ${badgeBg}; color: ${badgeColor}; padding: 2px 7px; border-radius: 6px;">
              ${isRed ? 'RED ZONE' : isOrange ? 'ORANGE ZONE' : 'SAFE ZONE'}
            </span>
            <span style="font-size: 10px; color: #567C8D; font-weight: 600;">Census</span>
          </div>
          <h4 style="font-weight: 700; font-size: 14px; margin: 0 0 3px 0; color: #2F4156;">${b.buildingName}</h4>
          <p style="font-size: 11px; color: #567C8D; margin: 0 0 8px 0;">${b.address}</p>

          <div style="background: #F5EFEB; border: 1px solid #C8D9E6; border-radius: 8px; padding: 8px; margin-bottom: 8px; text-align: center;">
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #567C8D; letter-spacing: 0.5px;">Expected In-Home Occupancy</span>
            <div style="font-size: 18px; font-weight: 800; color: #2F4156; margin-top: 2px;">
              🏠 ${b.expectedOccupancy} <span style="font-size: 12px; font-weight: 600; color: #567C8D;">/ ${b.registeredPopulation} residents</span>
            </div>
            <div style="font-size: 10px; font-weight: 700; color: ${badgeColor}; margin-top: 2px;">
              ${Math.round((b.expectedOccupancy / (b.registeredPopulation || 1)) * 100)}% remaining at home
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; text-align: center; font-size: 10px; margin-bottom: 6px;">
            <div style="background: white; border: 1px solid #E5E7EB; border-radius: 6px; padding: 3px;">
              <span style="color: #567C8D; font-weight: 700;">Adults</span>
              <div style="font-weight: 800; color: #2F4156;">${b.adults}</div>
            </div>
            <div style="background: white; border: 1px solid #E5E7EB; border-radius: 6px; padding: 3px;">
              <span style="color: #D97706; font-weight: 700;">Children</span>
              <div style="font-weight: 800; color: #B45309;">${b.children}</div>
            </div>
            <div style="background: white; border: 1px solid #E5E7EB; border-radius: 6px; padding: 3px;">
              <span style="color: #7C3AED; font-weight: 700;">Elderly</span>
              <div style="font-weight: 800; color: #6D28D9;">${b.elderly}</div>
            </div>
          </div>

          <div style="font-size: 10.5px; color: #567C8D; border-top: 1px dashed #E5E7EB; padding-top: 6px;">
            <div>🎪 Evacuating to Shelter: <strong>${b.expectedShelter}</strong></div>
            <div>🚗 Out of City / Relatives: <strong>${b.expectedElsewhere}</strong></div>
            <div style="margin-top: 4px; font-size: 10px; color: #2F4156;">Zone: <strong>${b.zoneName}</strong></div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        setSelectedBuilding(b);
      });

      markerMapRef.current.set(b.buildingName, marker);
    });
  };

  const handleFocusBuildingOnMap = (b: BuildingIntelligence) => {
    setSelectedBuilding(b);
    if (viewMode === 'CARDS') {
      setViewMode('SPLIT');
    }
    if (mapContainerRef.current) {
      mapContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setTimeout(() => {
      if (mapInstanceRef.current && b.latitude && b.longitude) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.flyTo([b.latitude, b.longitude], 14, { animate: true, duration: 1.0 });
        const marker = markerMapRef.current.get(b.buildingName);
        if (marker) {
          marker.openPopup();
        }
      }
    }, 120);
  };

  const handleCenterBengaluru = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([12.9716, 77.6200], 11, { animate: true });
    }
  };

  // Strictly block Citizen access
  if (user.role === 'CITIZEN') {
    return (
      <div className="bg-white rounded-3xl p-8 border border-[#C8D9E6] text-center max-w-lg mx-auto mt-12 shadow-sm">
        <Lock className="w-12 h-12 text-[#567C8D] mx-auto mb-3" />
        <h2 className="text-xl font-bold text-[#2F4156]">Operational View Restricted</h2>
        <p className="text-xs text-[#567C8D] mt-2">
          Building-level expected occupancy telemetry and flood plain demographic intelligence are strictly reserved for Emergency Command Authorities and Rescuers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
              {t('shelters.occupancy') || t('navigation.occupancy') || 'Expected Occupancy'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#2F4156] text-white">
              COMMAND GIS
            </span>
          </div>
          <p className="text-sm font-medium text-[#567C8D] mt-1">
            Pre-disaster building intelligence & census telemetry across Bengaluru flood zones. Counts{' '}
            <strong className="text-[#2F4156]">ONLY residents staying at Home</strong> requiring active monitoring.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <div className="p-1 rounded-xl bg-white border border-[#C8D9E6] flex items-center text-xs font-semibold shadow-sm overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setViewMode('SPLIT')}
              className={`px-3 py-2 min-h-[44px] lg:min-h-0 lg:py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewMode === 'SPLIT'
                  ? 'bg-[#2F4156] text-white font-bold'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Unified View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('MAP')}
              className={`px-3 py-2 min-h-[44px] lg:min-h-0 lg:py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewMode === 'MAP'
                  ? 'bg-[#2F4156] text-white font-bold'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map Only</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`px-3 py-2 min-h-[44px] lg:min-h-0 lg:py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewMode === 'CARDS'
                  ? 'bg-[#2F4156] text-white font-bold'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards Grid</span>
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            title="Refresh Intelligence Data"
            className="p-2.5 min-w-[44px] min-h-[44px] rounded-xl bg-white border border-[#C8D9E6] text-[#567C8D] hover:text-[#2F4156] hover:bg-[#F5EFEB] transition shadow-sm flex items-center justify-center cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Monitored */}
        <div className="p-4 rounded-2xl bg-white border border-[#C8D9E6]/80 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#567C8D]">
            Monitored Buildings
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              {totalMonitored}
            </span>
            <span className="text-xs font-semibold text-[#567C8D]">16 Canonical</span>
          </div>
          <div className="mt-2 text-[10px] text-[#567C8D] font-medium">
            {totalResidents} total residents
          </div>
        </div>

        {/* Expected In-Home Occupancy */}
        <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/90 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
            Staying at Home
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-amber-900">
              {totalInHome}
            </span>
            <span className="text-xs font-semibold text-amber-700">
              ({totalResidents > 0 ? Math.round((totalInHome / totalResidents) * 100) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-[10px] text-amber-700 font-medium">
            Expected in-home occupants
          </div>
        </div>

        {/* RED Zone Buildings */}
        <div className="p-4 rounded-2xl bg-red-50/80 border border-red-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-800">
              RED Flood Plain
            </span>
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-red-700">
              {redZoneBuildings}
            </span>
            <span className="text-xs font-semibold text-red-600">Buildings</span>
          </div>
          <div className="mt-2 text-[10px] text-red-600 font-medium">
            High Severity Flood Zones
          </div>
        </div>

        {/* ORANGE Zone Buildings */}
        <div className="p-4 rounded-2xl bg-orange-50/80 border border-orange-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-800">
              ORANGE Overflow
            </span>
            <span className="w-2 h-2 rounded-full bg-orange-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-orange-700">
              {orangeZoneBuildings}
            </span>
            <span className="text-xs font-semibold text-orange-600">Buildings</span>
          </div>
          <div className="mt-2 text-[10px] text-orange-600 font-medium">
            Moderate Risk Basins
          </div>
        </div>

        {/* SAFE Area Buildings */}
        <div className="col-span-2 md:col-span-1 p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
              Safe High Ground
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-emerald-700">
              {safeZoneBuildings}
            </span>
            <span className="text-xs font-semibold text-emerald-600">Buildings</span>
          </div>
          <div className="mt-2 text-[10px] text-emerald-600 font-medium">
            Unaffected High Elevation
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-white rounded-2xl border border-[#C8D9E6]/70 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md w-full">
          <Search className="w-4 h-4 text-[#567C8D] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search building name, street, or zone..."
            className="w-full pl-9 pr-4 py-2.5 min-h-[44px] lg:min-h-0 lg:py-2 rounded-xl bg-[#F5EFEB]/50 border border-[#C8D9E6] text-xs font-semibold text-[#2F4156] outline-none placeholder-[#567C8D]/60 focus:border-[#567C8D] focus:bg-white transition"
          />
        </div>

        {/* Zone Pill Buttons */}
        <div className="flex items-center gap-1.5 text-xs font-semibold overflow-x-auto no-scrollbar max-w-full">
          <button
            type="button"
            onClick={() => setFilterRisk('ALL')}
            className={`px-3 py-2 min-h-[44px] lg:min-h-0 lg:py-1.5 rounded-xl transition whitespace-nowrap cursor-pointer ${
              filterRisk === 'ALL'
                ? 'bg-[#2F4156] text-white font-bold shadow-sm'
                : 'bg-[#F5EFEB]/70 text-[#567C8D] hover:bg-[#F5EFEB] hover:text-[#2F4156]'
            }`}
          >
            All Buildings ({buildings.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterRisk('RED')}
            className={`px-3 py-2 min-h-[44px] lg:min-h-0 lg:py-1.5 rounded-xl transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              filterRisk === 'RED'
                ? 'bg-red-600 text-white font-bold shadow-sm'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-600" />
            RED Zones ({redZoneBuildings})
          </button>
          <button
            type="button"
            onClick={() => setFilterRisk('ORANGE')}
            className={`px-3 py-2 min-h-[44px] lg:min-h-0 lg:py-1.5 rounded-xl transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              filterRisk === 'ORANGE'
                ? 'bg-orange-500 text-white font-bold shadow-sm'
                : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            ORANGE Zones ({orangeZoneBuildings})
          </button>
          <button
            type="button"
            onClick={() => setFilterRisk('SAFE')}
            className={`px-3 py-2 min-h-[44px] lg:min-h-0 lg:py-1.5 rounded-xl transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              filterRisk === 'SAFE'
                ? 'bg-emerald-600 text-white font-bold shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Safe Areas ({safeZoneBuildings})
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#C8D9E6]/60 p-12 text-center shadow-sm">
          <Loader2 className="w-10 h-10 animate-spin text-[#2F4156] mb-4" />
          <h3 className="text-lg font-bold text-[#2F4156]">
            Compiling Building Intelligence Telemetry...
          </h3>
          <p className="text-sm font-medium text-[#567C8D] mt-1">
            Evaluating pre-disaster census and home occupancy plans across Bengaluru flood zones
          </p>
        </div>
      )}

      {/* Error State */}
      {!loading && errorMessage && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-8 text-center max-w-2xl mx-auto shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-amber-900 mb-2">
            Intelligence Telemetry Unavailable
          </h3>
          <p className="text-sm text-amber-800 font-medium mb-4">
            {errorMessage}
          </p>
        </div>
      )}

      {/* Main Operational GIS Content */}
      {!loading && !errorMessage && (
        <div className="space-y-6">
          {/* Map Visualization (Always mounted in DOM when loaded; toggled with CSS) */}
          <div
            className={`bg-white rounded-3xl border border-[#C8D9E6]/80 overflow-hidden shadow-sm transition-all duration-300 ${
              viewMode === 'CARDS' ? 'hidden' : 'block'
            }`}
          >
            {/* Map Header with Controls */}
            <div className="px-5 py-3.5 border-b border-[#F5EFEB] flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-white to-[#F5EFEB]/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#2F4156] text-white flex items-center justify-center shadow-sm">
                  <MapIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#2F4156]">
                    Bengaluru Flood Plain & Building Telemetry GIS
                  </h2>
                  <p className="text-[11px] font-medium text-[#567C8D]">
                    Showing {filteredBuildings.length} buildings overlaid on active RED & ORANGE inundation zones
                  </p>
                </div>
              </div>

              {/* Map Legend & Center Button */}
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="hidden sm:flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-red-700">
                    <span className="w-3 h-3 rounded bg-red-600/30 border border-red-600" />
                    RED Zone
                  </span>
                  <span className="flex items-center gap-1.5 text-orange-700">
                    <span className="w-3 h-3 rounded bg-orange-500/30 border border-orange-500" />
                    ORANGE Zone
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    <span className="w-3 h-3 rounded-full bg-emerald-600" />
                    Safe Area
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCenterBengaluru}
                  className="px-3 py-1.5 rounded-xl bg-[#F5EFEB] text-[#2F4156] hover:bg-[#C8D9E6]/50 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Reset View</span>
                </button>
              </div>
            </div>

            {/* Map Canvas */}
            <div
              ref={mapContainerRef}
              style={{
                height: viewMode === 'MAP' ? '650px' : '440px',
                minHeight: viewMode === 'MAP' ? '500px' : '380px',
                width: '100%',
                position: 'relative',
                zIndex: 1,
              }}
              className="w-full transition-all duration-300"
            />
          </div>

          {/* Buildings Empty State */}
          {filteredBuildings.length === 0 && (
            <div className="bg-white rounded-3xl border border-[#C8D9E6]/60 p-12 text-center max-w-xl mx-auto shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#C8D9E6]/30 text-[#567C8D] flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[#2F4156]">
                No buildings matched your criteria
              </h3>
              <p className="text-xs font-medium text-[#567C8D] mt-1">
                Try selecting &quot;All Buildings&quot; or clearing your search query.
              </p>
            </div>
          )}

          {/* Buildings Cards Grid (Rendered in SPLIT or CARDS mode) */}
          {(viewMode === 'SPLIT' || viewMode === 'CARDS') && filteredBuildings.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#2F4156]">
                    Building Census & Occupancy Roster
                  </h2>
                  <span className="text-xs font-semibold text-[#567C8D]">
                    ({filteredBuildings.length} buildings)
                  </span>
                </div>
                <span className="text-xs font-medium text-[#567C8D]">
                  Click &quot;Focus on Map&quot; to inspect building coordinates and perimeter
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBuildings.map((b, idx) => {
                  const isRed = b.riskLevel === 'RED' || b.riskLevel === 'HIGH' || b.riskLevel === 'EXTREME';
                  const isOrange = b.riskLevel === 'ORANGE' || b.riskLevel === 'MEDIUM';
                  const isSelected = selectedBuilding?.buildingName === b.buildingName;

                  const cardBorder = isRed
                    ? 'border-red-300 ring-1 ring-red-200'
                    : isOrange
                    ? 'border-orange-300 ring-1 ring-orange-200'
                    : 'border-[#C8D9E6]/80';

                  const occupancyPercent = Math.round(
                    (b.expectedOccupancy / (b.registeredPopulation || 1)) * 100
                  );

                  return (
                    <div
                      key={idx}
                      className={`bg-white rounded-3xl p-5 sm:p-6 border shadow-sm hover:shadow-md transition flex flex-col justify-between ${cardBorder} ${
                        isSelected ? 'ring-2 ring-[#2F4156]' : ''
                      }`}
                    >
                      <div>
                        {/* Card Top: Name, Address, Risk Badge */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                                isRed
                                  ? 'bg-red-50 text-red-600'
                                  : isOrange
                                  ? 'bg-orange-50 text-orange-600'
                                  : 'bg-emerald-50 text-emerald-700'
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

                          {/* Zone Badge */}
                          {isRed ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-red-600 text-white flex-shrink-0 flex items-center gap-1 shadow-sm">
                              <AlertTriangle className="w-3 h-3" />
                              RED ZONE
                            </span>
                          ) : isOrange ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-orange-500 text-white flex-shrink-0 flex items-center gap-1 shadow-sm">
                              <AlertTriangle className="w-3 h-3" />
                              ORANGE ZONE
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 flex-shrink-0 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              SAFE AREA
                            </span>
                          )}
                        </div>

                        {/* PROMINENT EXPECTED OCCUPANCY (STAYING AT HOME) */}
                        <div className="mt-5 p-5 rounded-2xl bg-[#F5EFEB]/90 border border-[#C8D9E6]/70 text-center">
                          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[#567C8D]">
                            <span>Staying at Home</span>
                            <span
                              className={`font-bold ${
                                isRed ? 'text-red-700' : isOrange ? 'text-orange-700' : 'text-emerald-700'
                              }`}
                            >
                              {occupancyPercent}% remaining
                            </span>
                          </div>

                          <div className="flex items-center justify-center gap-2 mt-2">
                            <Home
                              className={`w-6 h-6 ${
                                isRed ? 'text-red-600' : isOrange ? 'text-orange-600' : 'text-[#2F4156]'
                              }`}
                            />
                            <span className="text-4xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                              {b.expectedOccupancy}
                            </span>
                            <span className="text-sm font-semibold text-[#567C8D]">
                              / {b.registeredPopulation} registered
                            </span>
                          </div>

                          {/* Progress bar of occupancy vs evacuation */}
                          <div className="w-full bg-[#C8D9E6]/50 rounded-full h-2 mt-3 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${
                                isRed ? 'bg-red-600' : isOrange ? 'bg-orange-500' : 'bg-emerald-600'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(5, occupancyPercent))}%` }}
                            />
                          </div>
                        </div>

                        {/* Demographic Breakdown */}
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="p-2.5 rounded-xl bg-white border border-[#C8D9E6]/50">
                            <span className="text-[10px] text-[#567C8D] font-bold uppercase">Adults</span>
                            <p className="font-bold text-[#2F4156] mt-0.5">{b.adults}</p>
                          </div>
                          <div className="p-2.5 rounded-xl bg-white border border-[#C8D9E6]/50">
                            <span className="text-[10px] text-amber-700 font-bold uppercase">Children</span>
                            <p className="font-bold text-amber-900 mt-0.5">{b.children}</p>
                          </div>
                          <div className="p-2.5 rounded-xl bg-white border border-[#C8D9E6]/50">
                            <span className="text-[10px] text-purple-700 font-bold uppercase">Elderly</span>
                            <p className="font-bold text-purple-900 mt-0.5">{b.elderly}</p>
                          </div>
                        </div>

                        {/* Evacuation & Location Plans */}
                        <div className="mt-4 space-y-2 text-xs text-[#567C8D]">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Tent className="w-3.5 h-3.5 text-[#059669]" />
                              Shelter Evacuees:
                            </span>
                            <span className="font-bold text-[#059669]">{b.expectedShelter}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#567C8D]" />
                              Other City / Relatives:
                            </span>
                            <span className="font-bold text-[#2F4156]">{b.expectedElsewhere}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-amber-600" />
                              Unknown / Unconfirmed:
                            </span>
                            <span className="font-bold text-amber-700">{b.unknown}</span>
                          </div>
                        </div>
                      </div>

                      {/* Card Footnote & Action */}
                      <div className="mt-5 pt-3.5 border-t border-[#F5EFEB] flex items-center justify-between">
                        <div className="text-[11px] text-[#567C8D] truncate max-w-[180px]">
                          <span className="block truncate font-medium">Zone: {b.zoneName}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleFocusBuildingOnMap(b)}
                          className="text-xs font-bold text-[#2F4156] hover:text-[#567C8D] flex items-center gap-1 transition cursor-pointer"
                        >
                          <Crosshair className="w-3.5 h-3.5 text-[#567C8D]" />
                          <span>Focus Map</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
