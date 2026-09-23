import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { mapService, CitizenMapResponse, RescuerMapResponse } from '../../services/mapService.ts';
import { emergencyService, EmergencyRequest } from '../../services/emergencyService.ts';
import { duringApi } from '../../api/duringApi.ts';
import { DisasterEvent } from '../../services/disasterService.ts';
import { User } from '../../services/authService.ts';
import { DuringTab } from '../layout/DashboardLayout.tsx';
import { formatLastUpdated } from '../../offline/offlineDateUtils.ts';
import {
  Layers,
  LifeBuoy,
  AlertTriangle,
  Building2,
  Tent,
  Navigation,
  Cross,
  Clock,
  Radio,
  MapPin,
  CheckCircle2,
  Users,
  Shield,
  ArrowRight,
  Loader2,
  Home,
  LocateFixed,
  Phone,
  Flame,
  Activity,
  Check,
  Globe,
  Waves,
} from 'lucide-react';

const SATELLITE_TILE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SATELLITE_TILE_URL) ||
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const SATELLITE_ATTRIBUTION =
  'Esri, Maxar, Earthstar Geographics, and the GIS User Community';

/**
 * Configurable demonstration flooding parameters for hazard zones on the Satellite Map.
 * Red Zone demonstrates higher risk and more severe flooding (~75% coverage).
 * Orange Zone demonstrates moderate risk and less severe flooding (~32% coverage).
 */
export interface DemoZoneFloodConfig {
  id: string;
  name: string;
  riskLevel: 'RED' | 'ORANGE';
  alertLevelTitle: string;
  strokeColor: string;
  fillColor: string;
  floodWaterColor: string;
  floodWaterCoreColor?: string;
  floodCoveragePercent: number;
  scaleFactor: number;
  coreScaleFactor?: number;
  severityLabel: string;
  floodDepth: string;
  description: string;
  defaultCoordinates: [number, number][];
}

export const DEMO_ZONE_FLOOD_CONFIG: Record<'RED' | 'ORANGE', DemoZoneFloodConfig> = {
  RED: {
    id: 'demo-red-zone',
    name: 'Zone A - High Risk Drainage Basin (Koramangala & HSR)',
    riskLevel: 'RED',
    alertLevelTitle: 'High Risk Alert (Red Zone)',
    strokeColor: '#DC2626',
    fillColor: '#DC2626',
    floodWaterColor: '#0284C7', // Vivid deep cyan/blue
    floodWaterCoreColor: '#0369A1', // Deep core channel inundation
    floodCoveragePercent: 75,
    scaleFactor: 0.86, // ~74% area coverage inside zone boundaries
    coreScaleFactor: 0.52, // ~27% area deep water channel
    severityLabel: 'Critical Flood Inundation (~75% coverage)',
    floodDepth: '1.8m – 2.4m deep water / High velocity surface runoff',
    description: 'Critical flood inundation demo. Extreme breach vulnerability and major stormwater drain overflow.',
    defaultCoordinates: [
      [12.9450, 77.6100],
      [12.9450, 77.6600],
      [12.9000, 77.6600],
      [12.9000, 77.6100],
      [12.9450, 77.6100],
    ],
  },
  ORANGE: {
    id: 'demo-orange-zone',
    name: 'Zone B - Moderate Risk Overflow Perimeter',
    riskLevel: 'ORANGE',
    alertLevelTitle: 'Moderate Risk Advisory (Orange Zone)',
    strokeColor: '#EA580C',
    fillColor: '#EA580C',
    floodWaterColor: '#38BDF8', // Lighter sky blue
    floodCoveragePercent: 32,
    scaleFactor: 0.56, // ~31% area coverage inside zone boundaries
    severityLabel: 'Moderate Partial Inundation (~32% coverage)',
    floodDepth: '0.4m – 0.8m shallow water / Localized street ponding',
    description: 'Moderate flood inundation demo. Secondary perimeter overflow and peripheral backflow.',
    defaultCoordinates: [
      [12.9400, 77.6200],
      [12.9400, 77.6700],
      [12.8950, 77.6700],
      [12.8950, 77.6200],
      [12.9400, 77.6200],
    ],
  },
};

function isValidCoordinate(lat: any, lng: any): boolean {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180
  );
}

/**
 * Normalizes zone boundary coordinates into Leaflet [latitude, longitude] pairs.
 * Correctly detects and converts GeoJSON standard [lng, lat] pairs.
 */
export function parseZoneCoordinates(raw: any): [number, number][] {
  let coords = raw;
  if (typeof coords === 'string') {
    try {
      coords = JSON.parse(coords);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(coords)) return [];
  if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
    coords = coords[0];
  }

  return coords
    .map((pt: any): [number, number] | null => {
      if (!Array.isArray(pt) || pt.length < 2) return null;
      const p0 = Number(pt[0]);
      const p1 = Number(pt[1]);
      if (Number.isNaN(p0) || Number.isNaN(p1)) return null;

      // Detect GeoJSON standard [lng, lat] (India: lng ~ 70-85, lat ~ 8-35)
      if (isValidCoordinate(p1, p0) && p0 > 50 && p1 < 35 && p1 > 0) {
        return [p1, p0]; // Return [lat, lng]
      }
      if (isValidCoordinate(p0, p1)) {
        return [p0, p1];
      }
      return null;
    })
    .filter((pt): pt is [number, number] => pt !== null);
}

/**
 * Organic hydrologic floodplain templates in normalized [u, v] coordinates.
 * u: south-to-north axis in [0.04, 0.96]
 * v: west-to-east axis in [0.05, 0.95]
 * Models authentic fluvial inundation with meandering bends, natural constrictions,
 * broad alluvial floodplain expansions, and dendritic tributary fingers.
 */
export const RED_FLOOD_ORGANIC_TEMPLATE: [number, number][] = [
  // Southern river entry
  [0.05, 0.26],
  [0.08, 0.32],
  [0.12, 0.38],
  [0.10, 0.46],
  // Southeastern tributary inlet arm
  [0.07, 0.54],
  [0.06, 0.64],
  [0.08, 0.72],
  [0.14, 0.76],
  [0.18, 0.71],
  [0.19, 0.60],
  // Wide eastern alluvial plain
  [0.23, 0.68],
  [0.27, 0.80],
  [0.32, 0.89],
  [0.38, 0.94],
  [0.43, 0.93],
  [0.47, 0.86],
  // Natural topographic constriction
  [0.49, 0.74],
  [0.52, 0.68],
  // Northeastern dendritic tributary branch
  [0.55, 0.76],
  [0.60, 0.86],
  [0.66, 0.94],
  [0.72, 0.95],
  [0.78, 0.90],
  [0.82, 0.82],
  [0.79, 0.72],
  // Northern main river exit corridor
  [0.83, 0.66],
  [0.88, 0.63],
  [0.93, 0.58],
  [0.96, 0.48],
  [0.93, 0.40],
  [0.88, 0.38],
  // North-northwestern bank indentation
  [0.84, 0.36],
  [0.81, 0.31],
  // Northwestern wetland & lake spillover basin
  [0.79, 0.22],
  [0.76, 0.13],
  [0.70, 0.07],
  [0.63, 0.06],
  [0.56, 0.09],
  [0.51, 0.16],
  // Western mid-basin bluff protrusion
  [0.48, 0.25],
  [0.45, 0.28],
  // Southwestern secondary drainage tributary finger
  [0.41, 0.20],
  [0.36, 0.11],
  [0.29, 0.07],
  [0.22, 0.08],
  [0.17, 0.15],
  [0.15, 0.24],
  [0.10, 0.20],
  [0.06, 0.19],
  [0.05, 0.26],
];

export const RED_CORE_ORGANIC_TEMPLATE: [number, number][] = [
  [0.06, 0.28],
  [0.12, 0.36],
  [0.20, 0.46],
  [0.28, 0.54],
  [0.38, 0.58],
  [0.48, 0.53],
  [0.57, 0.49],
  [0.68, 0.58],
  [0.78, 0.64],
  [0.88, 0.60],
  [0.94, 0.51],
  [0.91, 0.44],
  [0.82, 0.50],
  [0.72, 0.53],
  [0.61, 0.42],
  [0.50, 0.44],
  [0.41, 0.48],
  [0.31, 0.44],
  [0.22, 0.37],
  [0.12, 0.28],
  [0.06, 0.28],
];

export const ORANGE_FLOOD_ORGANIC_TEMPLATE: [number, number][] = [
  // Southern stream channel entry
  [0.06, 0.40],
  [0.11, 0.46],
  [0.17, 0.51],
  [0.23, 0.49],
  // Mid-reach localized overflow into eastern low ground
  [0.27, 0.55],
  [0.33, 0.64],
  [0.40, 0.71],
  [0.47, 0.73],
  [0.54, 0.69],
  [0.58, 0.61],
  // Constricting through natural higher terrain
  [0.63, 0.55],
  [0.69, 0.57],
  [0.76, 0.61],
  [0.83, 0.57],
  [0.91, 0.51],
  [0.93, 0.43],
  [0.88, 0.39],
  // Returning along western shoreline with natural meanders
  [0.81, 0.43],
  [0.74, 0.47],
  [0.67, 0.44],
  [0.59, 0.39],
  // Western localized shallow ponding pocket
  [0.53, 0.33],
  [0.46, 0.29],
  [0.39, 0.33],
  [0.33, 0.37],
  [0.26, 0.39],
  [0.18, 0.37],
  [0.11, 0.35],
  [0.06, 0.40],
];

/**
 * Chaikin's corner-cutting algorithm.
 * Turns control vertices into smooth, continuous natural curves.
 */
export function smoothClosedPolygon(points: [number, number][], iterations = 2): [number, number][] {
  let pts = points.slice();
  if (
    pts.length > 2 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1]
  ) {
    pts.pop();
  }

  for (let it = 0; it < iterations; it++) {
    const nextPts: [number, number][] = [];
    const len = pts.length;
    for (let i = 0; i < len; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % len];

      const q: [number, number] = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]];
      const r: [number, number] = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]];

      nextPts.push(q);
      nextPts.push(r);
    }
    pts = nextPts;
  }
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

/**
 * Maps normalized [u, v] control points to the geographic bounding box of any zone polygon,
 * and applies Chaikin subdivision smoothing to produce an authentic irregular floodplain shape.
 */
export function generateOrganicFloodExtent(
  template: [number, number][],
  zoneCoords: [number, number][],
  iterations = 2
): [number, number][] {
  if (!zoneCoords || zoneCoords.length < 3) return [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  zoneCoords.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });

  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;

  const mapped = template.map(([u, v]): [number, number] => [
    minLat + u * latSpan,
    minLng + v * lngSpan,
  ]);

  return smoothClosedPolygon(mapped, iterations);
}

interface DuringMapViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onSelectRequest?: (req: any) => void;
  onNavigateTab?: (tab: DuringTab) => void;
}

export const DuringMapView: React.FC<DuringMapViewProps> = ({
  user,
  activeDisaster,
  onSelectRequest,
  onNavigateTab,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasInitialCenteredRef = useRef(false);

  // Satellite Map Refs (CITIZEN ONLY)
  const satelliteMapContainerRef = useRef<HTMLDivElement>(null);
  const satelliteMapInstanceRef = useRef<L.Map | null>(null);
  const satelliteLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasSatelliteInitialCenteredRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [mapData, setMapData] = useState<any>(null);
  const [citizenMapData, setCitizenMapData] = useState<CitizenMapResponse | null>(null);
  const [ownActiveSos, setOwnActiveSos] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Layer Toggles
  const [showHome, setShowHome] = useState(true);
  const [showDistressMarkers, setShowDistressMarkers] = useState(true);
  const [showFloodZones, setShowFloodZones] = useState(true);
  const [showShelters, setShowShelters] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);

  // Selected item modal / drawer
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const isCitizen = user.role === 'CITIZEN';

  useEffect(() => {
    hasInitialCenteredRef.current = false;
    hasSatelliteInitialCenteredRef.current = false;
    setSelectedItem(null);
    loadLiveMapData();
    const interval = setInterval(loadLiveMapData, 6000);
    return () => clearInterval(interval);
  }, [activeDisaster?.id, user.role]);

  const loadLiveMapData = async () => {
    try {
      if (user.role === 'CITIZEN') {
        const [cData, activeSosId] = await Promise.all([
          mapService.getCitizenMap(activeDisaster?.id).catch(() => null),
          Promise.resolve(localStorage.getItem('stride_active_sos_id')),
        ]);

        let ownSos = null;
        if (activeSosId) {
          ownSos = await duringApi.getRequestById(activeSosId).catch(() => null);
          if (ownSos && (ownSos.status === 'CANCELLED' || ownSos.status === 'RESCUED')) {
            ownSos = null;
          }
        }

        setCitizenMapData(cData);
        setOwnActiveSos(ownSos);
        setRequests([]);
        setMapData(null);
      } else {
        setCitizenMapData(null);
        setOwnActiveSos(null);
        const [reqs, mData] = await Promise.all([
          emergencyService.getMapRequests(user.role),
          mapService.getRescuerMap(activeDisaster?.id).catch(() => null),
        ]);
        setRequests(reqs || []);
        setMapData(mData);
      }
    } catch (e) {
      console.error('Error loading live map data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialCenter: [number, number] = isCitizen ? [12.9352, 77.6245] : [12.9716, 77.6200];
      const initialZoom = isCitizen ? 13 : 11;
      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      // Invalidate size shortly after mounting to ensure perfect rendering
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    }

    renderLayers();
  }, [
    citizenMapData,
    ownActiveSos,
    requests,
    mapData,
    showHome,
    showDistressMarkers,
    showFloodZones,
    showShelters,
    showFacilities,
    user.role,
  ]);

  // Center on citizen's home on first load
  useEffect(() => {
    if (
      isCitizen &&
      citizenMapData?.registeredHome &&
      mapInstanceRef.current &&
      !hasInitialCenteredRef.current
    ) {
      const home = citizenMapData.registeredHome;
      if (home.latitude && home.longitude) {
        mapInstanceRef.current.setView([home.latitude, home.longitude], 13);
        hasInitialCenteredRef.current = true;
      }
    }
  }, [citizenMapData, isCitizen]);

  const handleCenterHome = () => {
    if (isCitizen && citizenMapData?.registeredHome && mapInstanceRef.current) {
      mapInstanceRef.current.setView(
        [citizenMapData.registeredHome.latitude, citizenMapData.registeredHome.longitude],
        14,
        { animate: true }
      );
      if (satelliteMapInstanceRef.current) {
        satelliteMapInstanceRef.current.setView(
          [citizenMapData.registeredHome.latitude, citizenMapData.registeredHome.longitude],
          15,
          { animate: true }
        );
      }
    } else if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([12.9716, 77.6200], 11, { animate: true });
      if (satelliteMapInstanceRef.current) {
        satelliteMapInstanceRef.current.setView([12.9716, 77.6200], 11, { animate: true });
      }
    }
  };

  const handleCenterSatellite = () => {
    if (isCitizen && citizenMapData?.registeredHome && satelliteMapInstanceRef.current) {
      satelliteMapInstanceRef.current.setView(
        [citizenMapData.registeredHome.latitude, citizenMapData.registeredHome.longitude],
        13,
        { animate: true }
      );
    } else if (satelliteMapInstanceRef.current) {
      satelliteMapInstanceRef.current.setView([12.9716, 77.6200], 11, { animate: true });
    }
  };

  // Keep maps sized properly on layout changes / window resize
  useEffect(() => {
    if (!mapContainerRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    ro.observe(mapContainerRef.current);
    return () => ro.disconnect();
  }, []);

  const showSatelliteMap = isCitizen || user.role === 'AUTHORITY';

  useEffect(() => {
    if (!satelliteMapContainerRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (satelliteMapInstanceRef.current) {
        satelliteMapInstanceRef.current.invalidateSize();
      }
    });
    ro.observe(satelliteMapContainerRef.current);
    return () => ro.disconnect();
  }, [showSatelliteMap]);

  // Clean up both Leaflet instances on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (satelliteMapInstanceRef.current) {
        satelliteMapInstanceRef.current.remove();
        satelliteMapInstanceRef.current = null;
      }
    };
  }, []);

  // Initialize and update Satellite Map (CITIZEN & AUTHORITY)
  useEffect(() => {
    if (!showSatelliteMap) {
      if (satelliteMapInstanceRef.current) {
        satelliteMapInstanceRef.current.remove();
        satelliteMapInstanceRef.current = null;
      }
      return;
    }

    if (!satelliteMapContainerRef.current) return;

    if (!satelliteMapInstanceRef.current) {
      if ((satelliteMapContainerRef.current as any)._leaflet_id) {
        delete (satelliteMapContainerRef.current as any)._leaflet_id;
      }

      const home = citizenMapData?.registeredHome;
      const initialCenter: [number, number] = isCitizen
        ? (home && home.latitude && home.longitude ? [home.latitude, home.longitude] : [12.9352, 77.6245])
        : [12.9716, 77.6200];
      const initialZoom = isCitizen ? 13 : 11;

      const satMap = L.map(satelliteMapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(satMap);

      L.tileLayer(SATELLITE_TILE_URL, {
        maxZoom: 19,
        attribution: SATELLITE_ATTRIBUTION,
      }).addTo(satMap);

      satelliteLayerGroupRef.current = L.layerGroup().addTo(satMap);
      satelliteMapInstanceRef.current = satMap;

      setTimeout(() => {
        if (satelliteMapInstanceRef.current) {
          satelliteMapInstanceRef.current.invalidateSize();
        }
      }, 150);
    }

    renderSatelliteLayer();
  }, [showSatelliteMap, isCitizen, user.role, citizenMapData, mapData]);

  // Sync satellite center when citizen home data is loaded
  useEffect(() => {
    if (
      isCitizen &&
      citizenMapData?.registeredHome &&
      satelliteMapInstanceRef.current &&
      !hasSatelliteInitialCenteredRef.current
    ) {
      const home = citizenMapData.registeredHome;
      if (home.latitude && home.longitude) {
        satelliteMapInstanceRef.current.setView([home.latitude, home.longitude], 13);
        hasSatelliteInitialCenteredRef.current = true;
      }
    }
  }, [citizenMapData, isCitizen]);

  const renderSatelliteLayer = () => {
    const group = satelliteLayerGroupRef.current;
    if (!group) return;

    group.clearLayers();

    const home = citizenMapData?.registeredHome;

    // 1. Determine Red Zone & Orange Zone data
    let redCoords: [number, number][] = [];
    let redName = DEMO_ZONE_FLOOD_CONFIG.RED.name;
    let orangeCoords: [number, number][] = [];
    let orangeName = DEMO_ZONE_FLOOD_CONFIG.ORANGE.name;

    const zonesList = (citizenMapData?.zones && Array.isArray(citizenMapData.zones) && citizenMapData.zones.length > 0)
      ? citizenMapData.zones
      : (mapData?.zones && Array.isArray(mapData.zones) && mapData.zones.length > 0)
      ? mapData.zones
      : null;

    if (zonesList) {
      for (const z of zonesList) {
        const lvl = (z.riskLevel || z.alertLevel || '').toUpperCase();
        const parsed = parseZoneCoordinates(z.polygonGeoJson);
        if (parsed.length >= 3) {
          if (
            (lvl.includes('RED') || lvl.includes('HIGH') || lvl.includes('CRITICAL') || lvl.includes('EXTREME')) &&
            redCoords.length === 0
          ) {
            redCoords = parsed;
            redName = z.name || redName;
          } else if (
            (lvl.includes('ORANGE') || lvl.includes('MED') || lvl.includes('MODERATE') || lvl.includes('YELLOW')) &&
            orangeCoords.length === 0
          ) {
            orangeCoords = parsed;
            orangeName = z.name || orangeName;
          }
        }
      }
    }

    if (redCoords.length < 3) {
      redCoords = DEMO_ZONE_FLOOD_CONFIG.RED.defaultCoordinates;
    }
    if (orangeCoords.length < 3) {
      orangeCoords = DEMO_ZONE_FLOOD_CONFIG.ORANGE.defaultCoordinates;
    }

    // 2. LAYER ORDER:
    // (a) Base Satellite Imagery
    // (b) Zone Boundary / Hazard Overlay (Red & Orange)
    // (c) Flooding Demonstration Overlays (Inside zones; More in Red, Less in Orange)
    // (d) Registered Home Marker on Top (zIndexOffset: 1000)

    // --- (A) RED ZONE BASE OVERLAY ---
    const redBasePolygon = L.polygon(redCoords, {
      color: DEMO_ZONE_FLOOD_CONFIG.RED.strokeColor,
      weight: 2.5,
      dashArray: '5, 5',
      fillColor: DEMO_ZONE_FLOOD_CONFIG.RED.fillColor,
      fillOpacity: 0.18,
    }).addTo(group);

    const redPopupContent = `
      <div style="font-family: inherit; min-width: 220px; color: #1E293B; padding: 2px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #FEE2E2; color: #DC2626; padding: 2px 7px; border-radius: 6px;">
            ${DEMO_ZONE_FLOOD_CONFIG.RED.alertLevelTitle}
          </span>
        </div>
        <div style="font-weight: 800; font-size: 13px; color: #0F172A; margin-bottom: 2px;">${redName}</div>
        <div style="font-size: 11px; color: #64748B; margin-bottom: 6px;">${DEMO_ZONE_FLOOD_CONFIG.RED.description}</div>
        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 6px; font-size: 11px;">
          <div style="font-weight: 800; color: #1D4ED8; margin-bottom: 2px;">🌊 ${DEMO_ZONE_FLOOD_CONFIG.RED.severityLabel}</div>
          <div style="color: #1E40AF; font-size: 10px;">Depth: ${DEMO_ZONE_FLOOD_CONFIG.RED.floodDepth}</div>
        </div>
      </div>
    `;

    redBasePolygon.bindPopup(redPopupContent);
    redBasePolygon.on('click', () => {
      setSelectedItem({
        type: 'Hazard Inundation Zone',
        name: redName,
        riskLevel: 'High Risk (Red Zone)',
        isRed: true,
        isDemoSimulation: true,
        floodCoveragePercent: DEMO_ZONE_FLOOD_CONFIG.RED.floodCoveragePercent,
        severityLabel: DEMO_ZONE_FLOOD_CONFIG.RED.severityLabel,
        floodDepth: DEMO_ZONE_FLOOD_CONFIG.RED.floodDepth,
        details: DEMO_ZONE_FLOOD_CONFIG.RED.description,
      });
    });

    // --- (B) ORANGE ZONE BASE OVERLAY ---
    const orangeBasePolygon = L.polygon(orangeCoords, {
      color: DEMO_ZONE_FLOOD_CONFIG.ORANGE.strokeColor,
      weight: 2.5,
      dashArray: '5, 5',
      fillColor: DEMO_ZONE_FLOOD_CONFIG.ORANGE.fillColor,
      fillOpacity: 0.18,
    }).addTo(group);

    const orangePopupContent = `
      <div style="font-family: inherit; min-width: 220px; color: #1E293B; padding: 2px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #FFEDD5; color: #EA580C; padding: 2px 7px; border-radius: 6px;">
            ${DEMO_ZONE_FLOOD_CONFIG.ORANGE.alertLevelTitle}
          </span>
        </div>
        <div style="font-weight: 800; font-size: 13px; color: #0F172A; margin-bottom: 2px;">${orangeName}</div>
        <div style="font-size: 11px; color: #64748B; margin-bottom: 6px;">${DEMO_ZONE_FLOOD_CONFIG.ORANGE.description}</div>
        <div style="background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px; padding: 6px; font-size: 11px;">
          <div style="font-weight: 800; color: #0284C7; margin-bottom: 2px;">🌊 ${DEMO_ZONE_FLOOD_CONFIG.ORANGE.severityLabel}</div>
          <div style="color: #0369A1; font-size: 10px;">Depth: ${DEMO_ZONE_FLOOD_CONFIG.ORANGE.floodDepth}</div>
        </div>
      </div>
    `;

    orangeBasePolygon.bindPopup(orangePopupContent);
    orangeBasePolygon.on('click', () => {
      setSelectedItem({
        type: 'Hazard Inundation Zone',
        name: orangeName,
        riskLevel: 'Moderate Risk (Orange Zone)',
        isRed: false,
        isDemoSimulation: true,
        floodCoveragePercent: DEMO_ZONE_FLOOD_CONFIG.ORANGE.floodCoveragePercent,
        severityLabel: DEMO_ZONE_FLOOD_CONFIG.ORANGE.severityLabel,
        floodDepth: DEMO_ZONE_FLOOD_CONFIG.ORANGE.floodDepth,
        details: DEMO_ZONE_FLOOD_CONFIG.ORANGE.description,
      });
    });

    // --- (C) IRREGULAR ORGANIC FLOODING DEMONSTRATION OVERLAYS ---

    // 1. Red Zone: MORE FLOODING (Wide dendritic alluvial floodplain ~68% coverage + deep core thalweg)
    const redFloodOuterCoords = generateOrganicFloodExtent(RED_FLOOD_ORGANIC_TEMPLATE, redCoords, 2);
    const redFloodOuter = L.polygon(redFloodOuterCoords, {
      color: '#38BDF8',
      weight: 1.5,
      fillColor: DEMO_ZONE_FLOOD_CONFIG.RED.floodWaterColor,
      fillOpacity: 0.45,
    }).addTo(group);
    redFloodOuter.bindPopup(redPopupContent);
    redFloodOuter.on('click', () => {
      setSelectedItem({
        type: 'Hazard Inundation Zone',
        name: `${redName} (Inundation Area)`,
        riskLevel: 'High Risk (Red Zone)',
        isRed: true,
        isDemoSimulation: true,
        floodCoveragePercent: DEMO_ZONE_FLOOD_CONFIG.RED.floodCoveragePercent,
        severityLabel: DEMO_ZONE_FLOOD_CONFIG.RED.severityLabel,
        floodDepth: DEMO_ZONE_FLOOD_CONFIG.RED.floodDepth,
        details: DEMO_ZONE_FLOOD_CONFIG.RED.description,
      });
    });

    if (DEMO_ZONE_FLOOD_CONFIG.RED.coreScaleFactor && DEMO_ZONE_FLOOD_CONFIG.RED.floodWaterCoreColor) {
      const redFloodCoreCoords = generateOrganicFloodExtent(RED_CORE_ORGANIC_TEMPLATE, redCoords, 2);
      const redFloodCore = L.polygon(redFloodCoreCoords, {
        color: DEMO_ZONE_FLOOD_CONFIG.RED.floodWaterCoreColor,
        weight: 1.2,
        fillColor: DEMO_ZONE_FLOOD_CONFIG.RED.floodWaterCoreColor,
        fillOpacity: 0.68,
      }).addTo(group);
      redFloodCore.bindPopup(redPopupContent);
      redFloodCore.on('click', () => {
        setSelectedItem({
          type: 'Hazard Inundation Zone',
          name: `${redName} (Deep Water Channel)`,
          riskLevel: 'Critical Flood Core (Red Zone)',
          isRed: true,
          isDemoSimulation: true,
          floodCoveragePercent: DEMO_ZONE_FLOOD_CONFIG.RED.floodCoveragePercent,
          severityLabel: 'Deep Thalweg Channel Inundation (>2m depth)',
          floodDepth: DEMO_ZONE_FLOOD_CONFIG.RED.floodDepth,
          details: 'Core thalweg flow corridor with high-velocity deep inundation.',
        });
      });
    }

    // 2. Orange Zone: LESS FLOODING (Narrower sinuous river corridor ~24% coverage)
    const orangeFloodCoords = generateOrganicFloodExtent(ORANGE_FLOOD_ORGANIC_TEMPLATE, orangeCoords, 2);
    const orangeFlood = L.polygon(orangeFloodCoords, {
      color: '#7DD3FC',
      weight: 1.5,
      fillColor: DEMO_ZONE_FLOOD_CONFIG.ORANGE.floodWaterColor,
      fillOpacity: 0.38,
    }).addTo(group);
    orangeFlood.bindPopup(orangePopupContent);
    orangeFlood.on('click', () => {
      setSelectedItem({
        type: 'Hazard Inundation Zone',
        name: `${orangeName} (Inundation Area)`,
        riskLevel: 'Moderate Risk (Orange Zone)',
        isRed: false,
        isDemoSimulation: true,
        floodCoveragePercent: DEMO_ZONE_FLOOD_CONFIG.ORANGE.floodCoveragePercent,
        severityLabel: DEMO_ZONE_FLOOD_CONFIG.ORANGE.severityLabel,
        floodDepth: DEMO_ZONE_FLOOD_CONFIG.ORANGE.floodDepth,
        details: DEMO_ZONE_FLOOD_CONFIG.ORANGE.description,
      });
    });

    // --- (D) REGISTERED HOME MARKER ON TOP ---
    if (home && home.latitude && home.longitude) {
      const satelliteHomeIcon = L.divIcon({
        className: 'satellite-home-marker',
        html: `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="background-color: #059669; color: white; padding: 4px 10px; border-radius: 9999px; font-weight: 800; font-size: 11px; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.6); border: 2px solid white; display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
              <span>🏠</span>
              <span>My Home</span>
            </div>
            <div style="width: 14px; height: 14px; background-color: #059669; border: 2px solid white; border-radius: 9999px; box-shadow: 0 2px 6px rgba(0,0,0,0.7);"></div>
          </div>
        `,
        iconSize: [80, 48],
        iconAnchor: [40, 44],
      });

      const marker = L.marker([home.latitude, home.longitude], {
        icon: satelliteHomeIcon,
        zIndexOffset: 1000,
      }).addTo(group);

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; color: #1E293B;">
          <div style="font-weight: 800; color: #059669; font-size: 13px; margin-bottom: 2px;">🏠 My Registered Home</div>
          <div style="font-weight: 700; color: #0F172A;">${home.name || 'Registered Residence'}</div>
          <div style="color: #64748B; font-size: 11px; margin-top: 2px;">${home.address || ''}</div>
          <div style="color: #059669; font-weight: 700; font-size: 11px; margin-top: 4px;">Household Members: ${home.membersCount || 5}</div>
        </div>
      `);
    }

    // --- (E) AUTHORITY & RESCUER OPERATIONAL SATELLITE LAYERS ---
    if (!isCitizen) {
      // 1. All 16 Registered Buildings
      if (Array.isArray(mapData?.households)) {
        mapData.households.forEach((hh: any) => {
          const lat = hh.latitude ?? hh.registeredHomeLocation?.latitude;
          const lon = hh.longitude ?? hh.registeredHomeLocation?.longitude;
          if (!isValidCoordinate(lat, lon)) return;

          const highestAlert = hh.affectedZoneInfo?.highestAlertLevel;
          const isRed = highestAlert === 'RED';
          const isOrange = highestAlert === 'ORANGE';
          const bColor = isRed ? '#DC2626' : isOrange ? '#EA580C' : '#2F4156';
          const bName = hh.buildingNameOrNumber || hh.name || 'Building';
          const bPop = hh.statistics?.totalPopulation ?? hh.registeredPopulation ?? 50;

          const bIcon = L.divIcon({
            className: 'sat-building-marker',
            html: `<div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <div style="background-color: ${bColor}; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.6); border: 2px solid white;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              </div>
            </div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const m = L.marker([Number(lat), Number(lon)], { icon: bIcon }).addTo(group);
          m.bindPopup(`
            <div style="font-family: inherit; min-width: 180px; color: #1E293B;">
              <span style="font-size: 10px; font-weight: 800; background: ${bColor}20; color: ${bColor}; padding: 2px 6px; border-radius: 6px;">
                ${highestAlert ? highestAlert + ' ZONE' : 'SAFE ZONE'}
              </span>
              <div style="font-weight: 800; font-size: 13px; margin: 4px 0 2px 0;">${bName}</div>
              <div style="font-size: 11px; color: #64748B;">${hh.address || ''}</div>
              <div style="font-size: 11px; margin-top: 2px;">Population: <strong>${bPop}</strong> residents</div>
            </div>
          `);

          m.on('click', () => {
            setSelectedItem({
              type: 'Registered Building',
              name: bName,
              address: hh.address,
              isAffected: highestAlert ? `${highestAlert} ZONE` : 'SAFE ZONE',
              details: `Total Registered Population: ${bPop} residents. Demographics: Adults ${hh.statistics?.adultsCount ?? '-'}, Children ${hh.statistics?.childrenCount ?? '-'}, Elderly ${hh.statistics?.elderlyCount ?? '-'}.`,
              members: hh.members,
              population: bPop,
            });
          });
        });
      }

      // 2. All 14 Shelters
      if (Array.isArray(mapData?.shelters)) {
        mapData.shelters.forEach((s: any) => {
          if (!s || !isValidCoordinate(s.latitude, s.longitude)) return;

          const sIcon = L.divIcon({
            className: 'sat-shelter-marker',
            html: `<div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <div style="background-color: #059669; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.6); border: 2px solid white;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 20 10 4"/><path d="m5 20 9-16"/><path d="M2 20h20"/><path d="m14 4-2-2-2 2"/></svg>
              </div>
            </div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const m = L.marker([Number(s.latitude), Number(s.longitude)], { icon: sIcon }).addTo(group);
          m.bindPopup(`
            <div style="font-family: inherit; min-width: 180px; color: #1E293B;">
              <span style="font-size: 10px; font-weight: 800; background: #D1FAE5; color: #059669; padding: 2px 6px; border-radius: 6px;">SAFE SHELTER</span>
              <div style="font-weight: 800; font-size: 13px; margin: 4px 0 2px 0;">${s.name}</div>
              <div style="font-size: 11px; color: #64748B;">${s.address || ''}</div>
              <div style="font-size: 11px; margin-top: 2px;">Capacity: <strong>${s.capacity}</strong></div>
            </div>
          `);

          m.on('click', () => {
            setSelectedItem({
              type: 'Designated Safe Shelter',
              name: s.name,
              address: s.address,
              capacity: s.capacity,
              contact: s.contactNumber,
            });
          });
        });
      }

      // 3. Emergency Facilities
      if (Array.isArray(mapData?.facilities)) {
        mapData.facilities.forEach((f: any) => {
          if (!f || !isValidCoordinate(f.latitude, f.longitude)) return;
          const fType = (f.type || '').toUpperCase();

          let col = '#2F4156';
          let iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/></svg>`;
          let typeLabel = 'Emergency Facility';

          if (fType.includes('HOSP') || fType.includes('HEALTH')) {
            col = '#DC2626';
            iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`;
            typeLabel = 'Hospital / Medical Center';
          } else if (fType.includes('FIRE')) {
            col = '#D97706';
            iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
            typeLabel = 'Fire & Rescue Station';
          } else if (fType.includes('POLICE')) {
            col = '#2563EB';
            iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>`;
            typeLabel = 'Police Station';
          } else if (fType.includes('CHECKPOINT')) {
            col = '#4B5563';
            iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>`;
            typeLabel = 'Perimeter Checkpoint';
          }

          const fIcon = L.divIcon({
            className: 'sat-facility-marker',
            html: `<div style="position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <div style="background-color: ${col}; width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.6); border: 2px solid white;">
                ${iconSvg}
              </div>
            </div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });

          const m = L.marker([Number(f.latitude), Number(f.longitude)], { icon: fIcon }).addTo(group);
          m.bindPopup(`
            <div style="font-family: inherit; min-width: 180px; color: #1E293B;">
              <span style="font-size: 10px; font-weight: 800; background: ${col}20; color: ${col}; padding: 2px 6px; border-radius: 6px;">${typeLabel}</span>
              <div style="font-weight: 800; font-size: 13px; margin: 4px 0 2px 0;">${f.name}</div>
              <div style="font-size: 11px; color: #64748B;">${f.address || ''}</div>
              ${f.contactNumber ? `<div style="font-size: 11px; margin-top: 2px;">Contact: <strong>${f.contactNumber}</strong></div>` : ''}
            </div>
          `);

          m.on('click', () => {
            setSelectedItem({
              type: typeLabel,
              name: f.name,
              address: f.address,
              contact: f.contactNumber,
            });
          });
        });
      }
    }
  };

  const createDivIcon = (bg: string, content: string, size = 32) => {
    return L.divIcon({
      className: 'custom-during-icon',
      html: `<div style="background-color: ${bg}; width: ${size}px; height: ${size}px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 2px solid white;">${content}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };

  const renderLayers = () => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // ==========================================
    // 1. CITIZEN ROLE LAYERS
    // ==========================================
    if (isCitizen) {
      if (!citizenMapData) return;

      // A. Flood / Danger Inundation Zones
      if (showFloodZones) {
        const zonesToRender =
          citizenMapData.zones && citizenMapData.zones.length > 0
            ? citizenMapData.zones
            : [
                {
                  id: DEMO_ZONE_FLOOD_CONFIG.RED.id,
                  name: DEMO_ZONE_FLOOD_CONFIG.RED.name,
                  riskLevel: 'HIGH',
                  alertLevel: 'RED',
                  polygonGeoJson: DEMO_ZONE_FLOOD_CONFIG.RED.defaultCoordinates,
                },
                {
                  id: DEMO_ZONE_FLOOD_CONFIG.ORANGE.id,
                  name: DEMO_ZONE_FLOOD_CONFIG.ORANGE.name,
                  riskLevel: 'MODERATE',
                  alertLevel: 'ORANGE',
                  polygonGeoJson: DEMO_ZONE_FLOOD_CONFIG.ORANGE.defaultCoordinates,
                },
              ];

        zonesToRender.forEach((z: any) => {
          try {
            const coords = parseZoneCoordinates(z.polygonGeoJson);
            if (coords.length >= 3) {
              const alertUpper = (z.alertLevel || z.riskLevel || '').toUpperCase();
              const isOrange =
                alertUpper.includes('ORANGE') ||
                alertUpper.includes('MED') ||
                alertUpper.includes('MODERATE') ||
                alertUpper.includes('YELLOW');

              const polygon = L.polygon(coords, {
                color: isOrange ? '#EA580C' : '#DC2626',
                weight: 3,
                fillColor: isOrange ? '#EA580C' : '#DC2626',
                fillOpacity: 0.22,
              }).addTo(group);

              polygon.on('click', () => {
                setSelectedItem({
                  type: 'Hazard Inundation Zone',
                  name: z.name,
                  riskLevel: z.riskLevel || z.alertLevel || (isOrange ? 'Moderate Risk (Orange Zone)' : 'High Risk (Red Zone)'),
                  isRed: !isOrange,
                  details: `Monitored active inundation hazard area. Severity: ${z.riskLevel || z.alertLevel || (isOrange ? 'ORANGE' : 'RED')}`,
                });
              });
            }
          } catch (e) {
            console.error('Error rendering zone polygon:', e);
          }
        });
      }

      // B. Designated Safe Shelters
      if (showShelters && citizenMapData.shelters) {
        citizenMapData.shelters.forEach((s: any) => {
          const sIcon = createDivIcon(
            '#059669',
            `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20 10 4"/><path d="m5 20 9-16"/><path d="M2 20h20"/><path d="m14 4-2-2-2 2"/></svg>`,
            32
          );
          const m = L.marker([s.latitude, s.longitude], { icon: sIcon }).addTo(group);
          m.on('click', () => {
            setSelectedItem({
              type: 'Designated Safe Shelter',
              name: s.name,
              address: s.address,
              capacity: s.capacity,
              remainingCapacity: s.remainingCapacity,
              occupancyPercentage: s.occupancyPercentage,
              contact: s.contactNumber,
              distanceKm: s.distanceKm,
            });
          });
        });
      }

      // C. Emergency Facilities (Hospitals, Fire, Police)
      if (showFacilities && citizenMapData.facilities) {
        const facs = [
          ...(citizenMapData.facilities.hospitals || []).map((f) => ({ ...f, category: 'HOSPITAL' })),
          ...(citizenMapData.facilities.fireStations || []).map((f) => ({ ...f, category: 'FIRE_STATION' })),
          ...(citizenMapData.facilities.policeStations || []).map((f) => ({ ...f, category: 'POLICE_STATION' })),
        ];

        facs.forEach((f: any) => {
          let col = '#2F4156';
          let iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
          if (f.category === 'HOSPITAL') {
            col = '#DC2626';
            iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 6v12"/><path d="M6 12h12"/></svg>`;
          } else if (f.category === 'FIRE_STATION') {
            col = '#D97706';
            iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
          } else if (f.category === 'POLICE_STATION') {
            col = '#2563EB';
            iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
          }

          const fIcon = createDivIcon(col, iconSvg, 28);
          const m = L.marker([f.latitude, f.longitude], { icon: fIcon }).addTo(group);
          m.on('click', () => {
            setSelectedItem({
              type:
                f.category === 'HOSPITAL'
                  ? 'Hospital / Medical Center'
                  : f.category === 'FIRE_STATION'
                  ? 'Fire & Rescue Station'
                  : 'Police Station',
              name: f.name,
              address: f.address || (f.distanceKm ? `${f.distanceKm.toFixed(1)} km from your home` : 'Within sector'),
              contact: f.contactNumber || f.emergencyContact,
              distanceKm: f.distanceKm,
            });
          });
        });
      }

      // D. Registered Household Location
      if (showHome && citizenMapData.registeredHome) {
        const home = citizenMapData.registeredHome;
        const isSOS = !!ownActiveSos;

        const homeIcon = L.divIcon({
          className: 'home-marker',
          html: `<div style="position: relative; display: flex; align-items: center; justify-content: center;">
            ${
              isSOS
                ? `<div style="position: absolute; width: 48px; height: 48px; border-radius: 9999px; background-color: rgba(220, 38, 38, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
                : `<div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; background-color: rgba(47, 65, 86, 0.2); animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>`
            }
            <div style="background-color: ${isSOS ? '#DC2626' : '#2F4156'}; width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.35); border: 2.5px solid white; z-index: 10;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
          </div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const homeMarker = L.marker([home.latitude, home.longitude], {
          icon: homeIcon,
          zIndexOffset: 1000,
        }).addTo(group);

        homeMarker.on('click', () => {
          setSelectedItem({
            type: 'Registered Household',
            name: home.name,
            address: home.address,
            membersCount: home.membersCount,
            isOwnHousehold: true,
            activeSos: ownActiveSos,
          });
        });
      }

      return;
    }

    // ==========================================
    // 2. AUTHORITY & RESCUER OPERATIONAL LAYERS
    // ==========================================

    // 1. Flood Inundation Zones (Red Overlay)
    if (showFloodZones && mapData?.zones) {
      mapData.zones.forEach((z: any) => {
        try {
          const coords = parseZoneCoordinates(z.polygonGeoJson);
          if (coords.length >= 3) {
            const polygon = L.polygon(coords, {
              color: '#DC2626',
              weight: 3,
              fillColor: '#DC2626',
              fillOpacity: 0.22,
            }).addTo(group);

            polygon.on('click', () => {
              setSelectedItem({
                type: 'High-Risk Flood Zone',
                name: z.name,
                details: `Monitored breach zone. Danger level: ${z.riskLevel}`,
              });
            });
          }
        } catch (e) {
          console.error(e);
        }
      });
    }

    // 2. All 16 Registered Buildings
    if (showHome && mapData?.households) {
      mapData.households.forEach((hh: any) => {
        const lat = hh.latitude ?? hh.registeredHomeLocation?.latitude;
        const lon = hh.longitude ?? hh.registeredHomeLocation?.longitude;
        if (!isValidCoordinate(lat, lon)) return;

        const highestAlert = hh.affectedZoneInfo?.highestAlertLevel;
        const isRed = highestAlert === 'RED';
        const isOrange = highestAlert === 'ORANGE';
        const color = isRed ? '#DC2626' : isOrange ? '#EA580C' : '#2F4156';
        const bName = hh.buildingNameOrNumber || hh.name || 'Building';
        const bPop = hh.statistics?.totalPopulation ?? hh.registeredPopulation ?? 50;

        const bIcon = L.divIcon({
          className: 'during-building-icon',
          html: `<div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 2px solid white;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            </div>
            <span style="position: absolute; bottom: -8px; background: #2F4156; color: #fff; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 5px; white-space: nowrap; border: 1px solid white;">
              ${isRed ? 'RED' : isOrange ? 'ORANGE' : 'SAFE'}
            </span>
          </div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const m = L.marker([Number(lat), Number(lon)], { icon: bIcon }).addTo(group);
        m.bindPopup(`
          <div style="font-family: inherit; min-width: 200px; color: #2F4156;">
            <span style="font-size: 10px; font-weight: 800; background: ${color}20; color: ${color}; padding: 2px 6px; border-radius: 6px;">
              ${highestAlert ? highestAlert + ' ZONE' : 'SAFE ZONE'}
            </span>
            <h4 style="font-weight: 700; font-size: 13px; margin: 4px 0 2px 0;">${bName}</h4>
            <p style="font-size: 11px; color: #567C8D; margin: 0 0 4px 0;">${hh.address || ''}</p>
            <div style="font-size: 11px;">Population: <strong>${bPop}</strong> residents</div>
          </div>
        `);

        m.on('click', () => {
          setSelectedItem({
            type: 'Registered Building',
            name: bName,
            address: hh.address,
            isAffected: highestAlert ? `${highestAlert} ZONE` : 'SAFE ZONE',
            details: `Total Registered Population: ${bPop} residents. Demographics: Adults ${hh.statistics?.adultsCount ?? '-'}, Children ${hh.statistics?.childrenCount ?? '-'}, Elderly ${hh.statistics?.elderlyCount ?? '-'}.`,
            members: hh.members,
            population: bPop,
          });
        });
      });
    }

    // 3. Distress Emergency Requests (Beacons with calculated Priority Score)
    if (showDistressMarkers && requests) {
      requests.forEach((req: any) => {
        const lat = req.latitude || 13.0827;
        const lng = req.longitude || 80.2707;
        const status = req.status || req.rescueStatus || 'PENDING';

        let beaconBg = '#DC2626'; // PENDING
        if (status === 'ACKNOWLEDGED') beaconBg = '#EA580C'; // Orange
        if (status === 'ASSIGNED' || status === 'TEAM_ASSIGNED') beaconBg = '#2563EB'; // Blue
        if (status === 'IN_PROGRESS') beaconBg = '#7C3AED'; // Purple
        if (status === 'RESCUED' || status === 'SAFELY_RESCUED') beaconBg = '#059669'; // Emerald
        if (status === 'CANCELLED' || status === 'NOT_FOUND') beaconBg = '#6B7280'; // Gray

        const isUrgent = status === 'PENDING' || status === 'ACKNOWLEDGED' || req.priorityLevel === 'CRITICAL';

        const beaconIcon = L.divIcon({
          className: 'distress-beacon',
          html: `<div style="position: relative; display: flex; align-items: center; justify-content: center;">
            ${
              isUrgent
                ? `<div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; background-color: rgba(220, 38, 38, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
                : ''
            }
            <div style="background-color: ${beaconBg}; width: 34px; height: 34px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 11px; box-shadow: 0 4px 12px rgba(0,0,0,0.35); border: 2px solid white; z-index: 10;">
              ${req.priorityScore ?? 0}
            </div>
          </div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const marker = L.marker([lat, lng], { icon: beaconIcon }).addTo(group);
        marker.on('click', () => {
          setSelectedItem({
            type: 'Emergency Distress Call',
            id: req.id,
            name: req.citizen?.name || req.shortDescription || 'Citizen in Distress',
            address: req.address || 'Reported Location',
            score: req.priorityScore ?? 0,
            level: req.priorityLevel || (req.priorityScore >= 80 ? 'CRITICAL' : req.priorityScore >= 60 ? 'HIGH' : 'MEDIUM'),
            status,
            description: req.description || req.shortDescription || '',
            peopleCount: req.peopleCount || 1,
            emergencyType: req.emergencyType || 'FLOOD',
            waterLevel: req.waterLevel || 'MEDIUM',
            vulnerabilities: [
              req.childrenCount > 0 ? `${req.childrenCount} Children` : null,
              req.elderlyCount > 0 ? `${req.elderlyCount} Elderly` : null,
              req.disabledCount > 0 ? `${req.disabledCount} Disabled` : null,
              req.injuredCount > 0 ? `${req.injuredCount} Injured` : null,
              req.criticalMedicalNeed ? 'Critical Medical' : null,
            ].filter(Boolean),
            assignedTeam: req.team || req.assignedTeam || (req.rescueAssignments?.[0] ? { name: req.rescueAssignments[0].teamName } : null),
            rawRequest: req,
          });
        });
      });
    }

    // 4. Shelters
    if (showShelters && mapData?.shelters) {
      mapData.shelters.forEach((s: any) => {
        if (!s || !isValidCoordinate(s.latitude, s.longitude)) return;
        const sIcon = createDivIcon(
          '#059669',
          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20 10 4"/><path d="m5 20 9-16"/><path d="M2 20h20"/><path d="m14 4-2-2-2 2"/></svg>`,
          30
        );
        const m = L.marker([Number(s.latitude), Number(s.longitude)], { icon: sIcon }).addTo(group);
        m.bindPopup(`<strong>${s.name}</strong><br/>Capacity: ${s.capacity}<br/>Status: ${s.status || 'AVAILABLE'}`);
        m.on('click', () => {
          setSelectedItem({
            type: 'Designated Safe Shelter',
            name: s.name,
            address: s.address,
            capacity: s.capacity,
            contact: s.contactNumber,
          });
        });
      });
    }

    // 5. Facilities
    if (showFacilities && mapData?.facilities) {
      mapData.facilities.forEach((f: any) => {
        if (!f || !isValidCoordinate(f.latitude, f.longitude)) return;
        const fType = (f.type || '').toUpperCase();

        let col = '#2F4156';
        let iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
        let typeLabel = 'Emergency Facility';

        if (fType.includes('HOSP') || fType.includes('HEALTH')) {
          col = '#DC2626';
          iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`;
          typeLabel = 'Hospital / Medical Center';
        } else if (fType.includes('FIRE')) {
          col = '#D97706';
          iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
          typeLabel = 'Fire & Rescue Station';
        } else if (fType.includes('POLICE')) {
          col = '#2563EB';
          iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>`;
          typeLabel = 'Police Station';
        } else if (fType.includes('CHECKPOINT')) {
          col = '#4B5563';
          iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>`;
          typeLabel = 'Perimeter Checkpoint';
        }

        const fIcon = createDivIcon(col, iconSvg, 30);
        const m = L.marker([Number(f.latitude), Number(f.longitude)], { icon: fIcon }).addTo(group);
        m.bindPopup(`
          <div style="font-family: inherit; min-width: 200px; color: #2F4156; padding: 2px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: ${col}15; color: ${col}; padding: 2px 6px; border-radius: 6px;">${typeLabel}</span>
            <h4 style="font-weight: 700; font-size: 13px; margin: 4px 0 2px 0;">${f.name}</h4>
            ${f.address ? `<p style="font-size: 11px; color: #567C8D; margin: 0 0 4px 0;">${f.address}</p>` : ''}
            ${f.contactNumber ? `<p style="font-size: 11px; color: #2F4156; margin: 0;">Contact: <strong>${f.contactNumber}</strong></p>` : ''}
          </div>
        `);
        m.on('click', () => {
          setSelectedItem({
            type: typeLabel,
            name: f.name,
            address: f.address,
            contact: f.contactNumber,
          });
        });
      });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
            {isCitizen ? 'Live Emergency & Safety Map' : 'Live Emergency Incident Map'}
          </h1>
          <p className="text-sm font-medium text-[#567C8D] mt-1">
            {isCitizen
              ? 'Geospatial disaster awareness: active danger zones, designated safe shelters, and nearby emergency services.'
              : 'Real-time geospatial tactical feed. Beacons display calculated Priority Scores.'}
          </p>
          {(() => {
            const data = isCitizen ? citizenMapData : mapData;
            if (!data?.lastSyncedAt) return null;
            if (data.source === 'cache') {
              return (
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-full text-xs font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                  <span>{formatLastUpdated(data.lastSyncedAt, data.isStale, true)}</span>
                  <span className="text-amber-600">· Hazard information reflects the last saved snapshot.</span>
                </div>
              );
            }
            return (
              <p className="text-xs text-[#567C8D] mt-1.5 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#567C8D]" />
                <span>{formatLastUpdated(data.lastSyncedAt, false, false)}</span>
              </p>
            );
          })()}
        </div>

        {/* Legend */}
        {isCitizen ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#2F4156]/30 text-[#2F4156] shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2F4156]" />
              <span>Registered Home</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-red-300 text-red-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
              <span>Inundation Zone</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-emerald-300 text-emerald-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span>Safe Shelters</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-blue-300 text-blue-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Emergency Services</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-red-300 text-red-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
              <span>Pending (Score)</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-orange-300 text-orange-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-600" />
              <span>Acknowledged</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-blue-300 text-blue-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Assigned</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-purple-300 text-purple-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-emerald-300 text-emerald-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span>Rescued</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2F4156]" />
              <span>Buildings (16)</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-emerald-300 text-emerald-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span>Shelters (14)</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-blue-300 text-blue-700 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Facilities</span>
            </div>
          </div>
        )}
      </div>

      {/* Map Canvas */}
      <div
        className="relative rounded-3xl overflow-hidden border border-[#C8D9E6] shadow-sm bg-white"
        style={{ minHeight: '650px' }}
      >
        {/* Floating Controls */}
        <div className="absolute top-4 left-4 z-[400] flex flex-wrap gap-2 max-w-xl">
          {isCitizen ? (
            <>
              <button
                type="button"
                onClick={() => setShowHome(!showHome)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showHome
                    ? 'bg-[#2F4156] text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>My Household</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFloodZones(!showFloodZones)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showFloodZones
                    ? 'bg-red-600 text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Danger Zones</span>
              </button>

              <button
                type="button"
                onClick={() => setShowShelters(!showShelters)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showShelters
                    ? 'bg-[#059669] text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <Tent className="w-3.5 h-3.5" />
                <span>Safe Shelters</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFacilities(!showFacilities)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showFacilities
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Emergency Services</span>
              </button>

              <button
                type="button"
                onClick={handleCenterHome}
                title="Center on Registered Household"
                className="px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer bg-white text-[#2F4156] border border-[#C8D9E6] hover:bg-[#F5EFEB]"
              >
                <LocateFixed className="w-3.5 h-3.5 text-[#2F4156]" />
                <span>Center Home</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowDistressMarkers(!showDistressMarkers)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showDistressMarkers
                    ? 'bg-red-600 text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <LifeBuoy className="w-3.5 h-3.5" />
                <span>Distress SOS Beacons</span>
              </button>

              <button
                type="button"
                onClick={() => setShowHome(!showHome)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showHome
                    ? 'bg-[#2F4156] text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>Buildings (16)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFloodZones(!showFloodZones)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showFloodZones
                    ? 'bg-[#2F4156] text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>Inundation Zone</span>
              </button>

              <button
                type="button"
                onClick={() => setShowShelters(!showShelters)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showShelters
                    ? 'bg-[#059669] text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <Tent className="w-3.5 h-3.5" />
                <span>Shelters (14)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFacilities(!showFacilities)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  showFacilities
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Emergency Facilities</span>
              </button>

              <button
                type="button"
                onClick={handleCenterHome}
                title="Center Operations (Bengaluru Command)"
                className="px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer bg-white text-[#2F4156] border border-[#C8D9E6] hover:bg-[#F5EFEB]"
              >
                <LocateFixed className="w-3.5 h-3.5 text-[#2F4156]" />
                <span>Center Operations</span>
              </button>
            </>
          )}
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-[500] bg-white/70 backdrop-blur-xs flex items-center justify-center pointer-events-none">
            <div className="bg-white p-4 rounded-2xl shadow-xl border border-[#C8D9E6] flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-[#2F4156]" />
              <span className="text-xs font-bold text-[#2F4156]">Loading emergency incident map...</span>
            </div>
          </div>
        )}

        {/* No Map Data Offline Empty State */}
        {typeof navigator !== 'undefined' && !navigator.onLine && (isCitizen ? citizenMapData?.source : mapData?.source) === 'none' && (
          <div className="absolute inset-0 z-[500] bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center p-8 text-center">
            <MapPin className="w-12 h-12 text-[#567C8D] mx-auto mb-3 opacity-40" />
            <h3 className="text-lg font-bold text-[#2F4156]">No Saved Map Data Available</h3>
            <p className="text-xs text-[#567C8D] mt-1 max-w-md">
              No saved map data is available on this device yet. Connect to the internet to load and cache disaster map intelligence.
            </p>
          </div>
        )}

        {/* Leaflet Map Canvas */}
        <div
          ref={mapContainerRef}
          className="w-full h-[650px] min-h-[650px] z-0"
          style={{ height: '650px', minHeight: '650px', width: '100%' }}
        />

        {/* Selected Beacon / Entity Drawer */}
        {selectedItem && (
          <div className="absolute bottom-6 left-6 right-6 sm:right-auto sm:w-[420px] z-[400] bg-white/95 backdrop-blur-md rounded-3xl border border-[#C8D9E6] shadow-2xl p-5 transition-all max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded bg-[#F5EFEB] text-[#2F4156]">
                  {selectedItem.type}
                </span>
                <h3 className="text-base font-bold text-[#2F4156] mt-1.5">
                  {selectedItem.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-[#567C8D] hover:text-[#2F4156] text-xs font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Registered Household Drawer Details */}
            {selectedItem.isOwnHousehold && (
              <div className="mt-3 space-y-3">
                <div className="p-3 rounded-2xl bg-[#F5EFEB]/70 border border-[#C8D9E6]/60 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[#2F4156] font-bold">
                    <MapPin className="w-3.5 h-3.5 text-[#2F4156]" />
                    <span>{selectedItem.address}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#567C8D] pt-1 border-t border-[#C8D9E6]/40">
                    <span>Registered Family Members:</span>
                    <span className="font-bold text-[#2F4156]">{selectedItem.membersCount} people</span>
                  </div>
                </div>

                {selectedItem.activeSos ? (
                  <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase text-red-700">
                        Active Emergency Distress Beacon
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-200 text-red-900">
                        {selectedItem.activeSos.status}
                      </span>
                    </div>
                    <p className="text-red-900 italic">
                      "{selectedItem.activeSos.description}"
                    </p>
                    <div className="flex items-center justify-between pt-1 border-t border-red-200 text-[11px]">
                      <span>Emergency Type:</span>
                      <span className="font-bold text-red-700">{selectedItem.activeSos.emergencyType}</span>
                    </div>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('rescue')}
                        className="w-full mt-2 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Radio className="w-3.5 h-3.5 text-white" />
                        <span>View Rescue Dispatch Status</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Household Recorded as Safe</span>
                    </div>
                    <p className="text-[#567C8D] text-[11px]">
                      No active emergency distress beacon recorded. If situation changes or water rises, signal emergency teams immediately.
                    </p>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('safe')}
                        className="w-full mt-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <LifeBuoy className="w-3.5 h-3.5 text-white" />
                        <span>Are You Safe? / Report SOS</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Registered Building Drawer Details (Authority / Rescuer) */}
            {selectedItem.type === 'Registered Building' && (
              <div className="mt-3 space-y-3">
                <div className="p-3 rounded-2xl bg-[#F5EFEB]/70 border border-[#C8D9E6]/60 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[#2F4156] font-bold">
                    <MapPin className="w-3.5 h-3.5 text-[#2F4156]" />
                    <span>{selectedItem.address || 'Address on file'}</span>
                  </div>
                  {selectedItem.isAffected && (
                    <div className="flex items-center justify-between text-[#567C8D] pt-1 border-t border-[#C8D9E6]/40">
                      <span>Hazard Risk Level:</span>
                      <span className="font-bold text-[#2F4156]">{selectedItem.isAffected}</span>
                    </div>
                  )}
                  {selectedItem.population && (
                    <div className="flex items-center justify-between text-[#567C8D] pt-1 border-t border-[#C8D9E6]/40">
                      <span>Total Registered Population:</span>
                      <span className="font-bold text-[#2F4156]">{selectedItem.population} residents</span>
                    </div>
                  )}
                </div>
                {selectedItem.details && (
                  <p className="text-xs text-[#567C8D] bg-white p-2.5 rounded-xl border border-[#C8D9E6]/50">
                    {selectedItem.details}
                  </p>
                )}
              </div>
            )}

            {/* Designated Safe Shelter Details */}
            {selectedItem.type === 'Designated Safe Shelter' && (
              <div className="mt-3 space-y-2.5 text-xs">
                {selectedItem.address && (
                  <p className="text-[#567C8D] flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{selectedItem.address}</span>
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-[#F5EFEB] border border-[#C8D9E6]/60">
                    <span className="text-[10px] text-[#567C8D] block">Capacity:</span>
                    <span className="font-bold text-[#2F4156] text-sm">{selectedItem.capacity}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] text-emerald-700 block">Remaining:</span>
                    <span className="font-bold text-emerald-900 text-sm">
                      {selectedItem.remainingCapacity ?? selectedItem.capacity}
                    </span>
                  </div>
                </div>
                {selectedItem.distanceKm !== undefined && (
                  <p className="text-[11px] text-[#567C8D]">
                    Distance from your registered home: <strong>{selectedItem.distanceKm.toFixed(1)} km</strong>
                  </p>
                )}
                {selectedItem.contact && (
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-blue-900 font-semibold text-xs">
                      <Phone className="w-3.5 h-3.5 text-blue-600" />
                      <span>Emergency Helpline</span>
                    </div>
                    <a
                      href={`tel:${selectedItem.contact}`}
                      className="font-bold text-blue-700 hover:underline"
                    >
                      {selectedItem.contact}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Emergency Facility Details (Hospital, Fire, Police) */}
            {(selectedItem.type === 'Hospital / Medical Center' ||
              selectedItem.type === 'Fire & Rescue Station' ||
              selectedItem.type === 'Police Station' ||
              selectedItem.type?.startsWith('Facility:')) && (
              <div className="mt-3 space-y-2.5 text-xs">
                {selectedItem.address && (
                  <p className="text-[#567C8D] flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{selectedItem.address}</span>
                  </p>
                )}
                {selectedItem.distanceKm !== undefined && (
                  <p className="text-[11px] text-[#567C8D]">
                    Distance from your registered home: <strong>{selectedItem.distanceKm.toFixed(1)} km</strong>
                  </p>
                )}
                {selectedItem.contact && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-900 font-semibold text-xs">
                      <Phone className="w-3.5 h-3.5 text-amber-600" />
                      <span>Emergency Hotline</span>
                    </div>
                    <a
                      href={`tel:${selectedItem.contact}`}
                      className="font-bold text-amber-800 hover:underline"
                    >
                      {selectedItem.contact}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Hazard Inundation Zone Details */}
            {selectedItem.type === 'Hazard Inundation Zone' && (
              <div className="mt-3 space-y-2 text-xs">
                <div
                  className={`p-3 rounded-2xl border space-y-1.5 ${
                    selectedItem.isRed ||
                    selectedItem.riskLevel?.includes('RED') ||
                    selectedItem.riskLevel?.includes('High') ||
                    selectedItem.riskLevel?.includes('Critical')
                      ? 'bg-red-50 border-red-200'
                      : 'bg-orange-50 border-orange-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-extrabold uppercase ${
                        selectedItem.isRed ||
                        selectedItem.riskLevel?.includes('RED') ||
                        selectedItem.riskLevel?.includes('High') ||
                        selectedItem.riskLevel?.includes('Critical')
                          ? 'text-red-700'
                          : 'text-orange-700'
                      }`}
                    >
                      Threat Alert: {selectedItem.riskLevel}
                    </span>
                    {selectedItem.isDemoSimulation && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        Demo Simulation
                      </span>
                    )}
                  </div>
                  <p
                    className={
                      selectedItem.isRed ||
                      selectedItem.riskLevel?.includes('RED') ||
                      selectedItem.riskLevel?.includes('High') ||
                      selectedItem.riskLevel?.includes('Critical')
                        ? 'text-red-900'
                        : 'text-orange-900'
                    }
                  >
                    {selectedItem.details}
                  </p>
                </div>

                {/* Demonstration Flooding Status breakdown */}
                {selectedItem.severityLabel && (
                  <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase text-sky-800 flex items-center gap-1.5">
                        <Waves className="w-3.5 h-3.5 text-sky-600" />
                        <span>Inundation Hazard Status</span>
                      </span>
                      {selectedItem.floodCoveragePercent !== undefined && (
                        <span className="text-xs font-black text-sky-700">
                          {selectedItem.floodCoveragePercent}% Area
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-sky-950">{selectedItem.severityLabel}</p>
                    {selectedItem.floodDepth && (
                      <p className="text-[11px] text-sky-800">
                        Estimated Water Depth: <span className="font-semibold">{selectedItem.floodDepth}</span>
                      </p>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-[#567C8D]">
                  Evacuation protocols active. Proceed toward safe shelters.
                </p>
              </div>
            )}

            {/* Operational Priority Score (Authority & Rescuer only) */}
            {selectedItem.score !== undefined && (
              <div className="mt-3 p-3 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-red-700">
                    Priority Score & Status
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-white border border-red-300 text-red-800">
                      {selectedItem.status}
                    </span>
                    {selectedItem.level && (
                      <span className="text-xs font-extrabold text-red-600">
                        {selectedItem.level}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-red-600">
                  {selectedItem.score}
                </span>
              </div>
            )}

            {selectedItem.type === 'Emergency Distress Call' && (
              <>
                {selectedItem.address && (
                  <p className="text-xs text-[#567C8D] mt-2 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{selectedItem.address}</span>
                  </p>
                )}

                {selectedItem.emergencyType && (
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-[#F5EFEB] font-bold text-[#2F4156]">
                      {selectedItem.emergencyType}
                    </span>
                    {selectedItem.waterLevel && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                        Water: {selectedItem.waterLevel}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                      {selectedItem.peopleCount} People
                    </span>
                  </div>
                )}

                {selectedItem.description && (
                  <p className="text-xs text-[#2F4156] mt-2 bg-[#F5EFEB] p-2.5 rounded-xl font-medium">
                    "{selectedItem.description}"
                  </p>
                )}

                {selectedItem.vulnerabilities && selectedItem.vulnerabilities.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase text-[#567C8D] mb-1">
                      Vulnerability Breakdown:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedItem.vulnerabilities.map((c: string) => (
                        <span
                          key={c}
                          className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-100 text-red-800"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.assignedTeam && (
                  <div className="mt-3 pt-2 border-t border-[#F5EFEB]">
                    <p className="text-[10px] font-bold uppercase text-[#567C8D]">
                      Assigned Team:
                    </p>
                    <p className="text-xs font-bold text-[#2F4156]">
                      {selectedItem.assignedTeam?.name}
                    </p>
                    {selectedItem.assignedTeam?.contactNumber && (
                      <p className="text-[11px] text-[#567C8D]">
                        Contact: {selectedItem.assignedTeam.contactNumber}
                      </p>
                    )}
                  </div>
                )}

                {/* Quick Actions based on Role for Operational Distress Calls */}
                <div className="mt-4 pt-3 border-t border-[#F5EFEB] flex flex-col gap-2">
                  {user.role === 'AUTHORITY' && (
                    <>
                      {selectedItem.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={async () => {
                            setActionLoading(true);
                            try {
                              await duringApi.updateAuthorityRequestStatus(selectedItem.id, 'ACKNOWLEDGED');
                              await loadLiveMapData();
                              setSelectedItem(null);
                            } catch (err: any) {
                              alert('Failed to acknowledge: ' + err.message);
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                          className="w-full py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {actionLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Acknowledge Distress Call</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectRequest?.(selectedItem.rawRequest)}
                        className="w-full py-2 rounded-xl bg-[#2F4156] hover:bg-[#1f2d3d] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Open in Operations Queue</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {user.role === 'RESCUER' && (
                    <>
                      {selectedItem.status === 'ASSIGNED' && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={async () => {
                            setActionLoading(true);
                            try {
                              await duringApi.updateMissionStatus(selectedItem.id, 'IN_PROGRESS');
                              await loadLiveMapData();
                              setSelectedItem(null);
                            } catch (err: any) {
                              alert('Failed to update status: ' + err.message);
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                          className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {actionLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Navigation className="w-3.5 h-3.5" />
                          )}
                          <span>Mark En Route (In Progress)</span>
                        </button>
                      )}
                      {selectedItem.status === 'IN_PROGRESS' && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={async () => {
                            setActionLoading(true);
                            try {
                              await duringApi.updateMissionStatus(selectedItem.id, 'RESCUED');
                              await loadLiveMapData();
                              setSelectedItem(null);
                            } catch (err: any) {
                              alert('Failed to mark rescued: ' + err.message);
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                          className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {actionLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Confirm Safely Rescued</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* SECOND MAP: Satellite View (CITIZEN & AUTHORITY) */}
      {showSatelliteMap && (
        <div className="space-y-3 pt-2" id="during-satellite-map-section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight flex items-center gap-2">
                  <Globe className="w-5 h-5 text-[#567C8D]" />
                  <span>Satellite View</span>
                </h2>
              </div>
              <p className="text-xs font-medium text-[#567C8D]">
                {isCitizen
                  ? 'High-resolution satellite imagery overlay with operational hazard zones and inundation levels'
                  : 'High-resolution satellite imagery overlay with operational hazard zones, registered buildings, shelters, and facilities'}
              </p>
            </div>
            {isCitizen ? (
              citizenMapData?.registeredHome && (
                <button
                  type="button"
                  onClick={handleCenterSatellite}
                  title="Center on Registered Home"
                  className="self-start sm:self-auto px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer bg-white text-[#2F4156] border border-[#C8D9E6] hover:bg-[#F5EFEB]"
                >
                  <LocateFixed className="w-3.5 h-3.5 text-[#2F4156]" />
                  <span>Center Home</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={handleCenterSatellite}
                title="Center Operations (Bengaluru Command)"
                className="self-start sm:self-auto px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer bg-white text-[#2F4156] border border-[#C8D9E6] hover:bg-[#F5EFEB]"
              >
                <LocateFixed className="w-3.5 h-3.5 text-[#2F4156]" />
                <span>Center Operations</span>
              </button>
            )}
          </div>

          {/* SATELLITE MAP LEGEND */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-white border border-[#C8D9E6] shadow-xs text-xs text-[#2F4156]">
            <span className="text-[11px] font-extrabold uppercase text-[#567C8D] tracking-wider mr-1">
              Satellite Legend:
            </span>

            {/* Red Zone */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-50 border border-red-200 font-semibold text-red-900">
              <span className="w-3 h-3 rounded-full bg-red-600 border border-white shadow-xs inline-block" />
              <span>Red Zone (High Risk)</span>
            </div>

            {/* Orange Zone */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-50 border border-orange-200 font-semibold text-orange-900">
              <span className="w-3 h-3 rounded-full bg-orange-500 border border-white shadow-xs inline-block" />
              <span>Orange Zone (Moderate Risk)</span>
            </div>

            {/* Flooded Area */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-50 border border-sky-200 font-semibold text-sky-900"
              title="Flood Inundation Area"
            >
              <span className="w-3 h-3 rounded-sm bg-sky-500 border border-white shadow-xs inline-block" />
              <span>Flooded Inundation Area</span>
            </div>

            {isCitizen ? (
              /* Registered Home */
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 font-semibold text-emerald-900">
                <span className="text-sm leading-none">🏠</span>
                <span>Registered Home</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-300 font-semibold text-slate-800">
                  <span className="w-3 h-3 rounded-sm bg-[#2F4156] border border-white shadow-xs inline-block" />
                  <span>Buildings (16)</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 font-semibold text-emerald-900">
                  <span className="w-3 h-3 rounded-sm bg-[#059669] border border-white shadow-xs inline-block" />
                  <span>Shelters (14)</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200 font-semibold text-blue-900">
                  <span className="w-3 h-3 rounded-sm bg-[#2563EB] border border-white shadow-xs inline-block" />
                  <span>Facilities</span>
                </div>
              </>
            )}
          </div>

          <div className="relative rounded-3xl overflow-hidden border border-[#C8D9E6] shadow-sm bg-slate-900">
            {/* Satellite Map Canvas */}
            <div
              ref={satelliteMapContainerRef}
              className="w-full h-[650px] min-h-[650px] z-0"
              style={{ height: '650px', minHeight: '650px', width: '100%' }}
            />

            {/* Satellite Mode Badge */}
            <div className="absolute top-4 left-4 z-[400] flex flex-wrap items-center gap-2">
              <div className="bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-700 shadow-md flex items-center gap-2 text-xs font-bold text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Esri World Imagery</span>
              </div>
              <div className="bg-sky-950/85 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-sky-700 shadow-md flex items-center gap-1.5 text-xs font-bold text-sky-200">
                <Waves className="w-3.5 h-3.5 text-sky-400" />
                <span>Demonstration Flood Simulation</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
