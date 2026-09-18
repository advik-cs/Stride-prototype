import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { mapService, CitizenMapResponse, RescuerMapResponse, generateDemoEmergencyContact } from '../../services/mapService.ts';
import { User } from '../../services/authService.ts';
import { DisasterEvent } from '../../services/disasterService.ts';
import {
  Layers,
  MapPin,
  Home,
  Tent,
  Cross,
  Flame,
  Shield,
  AlertTriangle,
  Info,
  Phone,
  Users,
  Compass,
  CheckCircle2,
  Loader2,
  RefreshCw,
  LocateFixed,
} from 'lucide-react';

interface BeforeMapViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
}

export const BeforeMapView: React.FC<BeforeMapViewProps> = ({ user, activeDisaster }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialCentered, setIsInitialCentered] = useState(false);

  const [citizenData, setCitizenData] = useState<CitizenMapResponse | null>(null);
  const [rescuerData, setRescuerData] = useState<RescuerMapResponse | null>(null);

  // Layer Visibility Toggles
  const [showHome, setShowHome] = useState(true);
  const [showShelters, setShowShelters] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showFireStations, setShowFireStations] = useState(true);
  const [showPoliceStations, setShowPoliceStations] = useState(true);
  const [showDangerZones, setShowDangerZones] = useState(true);
  const [show5kmRadius, setShow5kmRadius] = useState(true);

  // Selected item details drawer
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  useEffect(() => {
    loadMapData();
  }, [user.role, activeDisaster?.id]);

  const loadMapData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (user.role === 'RESCUER' || user.role === 'AUTHORITY') {
        const data = await mapService.getRescuerMap(activeDisaster?.id);
        setRescuerData(data);
      } else {
        const data = await mapService.getCitizenMap(activeDisaster?.id);
        setCitizenData(data);
      }
    } catch (e: any) {
      console.error('Error fetching map data:', e);
      setError('Unable to load preparedness map data. Please check connection and retry.');
    } finally {
      setLoading(false);
    }
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

  // Setup ResizeObserver to keep Leaflet properly sized on window/sidebar changes
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

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    // Initial center: citizen's registered home or Bengaluru jurisdiction center
    const defaultLat = user.role === 'CITIZEN' ? 12.9352 : 12.9716;
    const defaultLng = user.role === 'CITIZEN' ? 77.6245 : 77.6200;
    const defaultZoom = user.role === 'CITIZEN' ? 13 : 11;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: defaultZoom,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // OpenStreetMap standard tile layer
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    renderLayers();

    // Trigger invalidateSize to prevent blank/grey tiles in flex layouts
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [user.role]);

  // Re-render layers whenever map data or filter toggles change
  useEffect(() => {
    renderLayers();
  }, [
    citizenData,
    rescuerData,
    showHome,
    showShelters,
    showHospitals,
    showFireStations,
    showPoliceStations,
    showDangerZones,
    show5kmRadius,
  ]);

  const handleCenterMap = () => {
    if (!mapInstanceRef.current) return;
    try {
      if (
        user.role === 'CITIZEN' &&
        citizenData?.registeredHome &&
        isValidCoordinate(citizenData.registeredHome.latitude, citizenData.registeredHome.longitude)
      ) {
        mapInstanceRef.current.setView(
          [citizenData.registeredHome.latitude, citizenData.registeredHome.longitude],
          13,
          { animate: true }
        );
      } else {
        mapInstanceRef.current.setView([12.9716, 77.6200], 11, { animate: true });
      }
    } catch (e) {
      console.warn('Center map failed:', e);
    }
  };

  const createIcon = (bg: string, iconHtml: string, size = 32, badgeText?: string) => {
    return L.divIcon({
      className: '',
      html: `
        <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="background-color: ${bg}; width: ${size}px; height: ${size}px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 2.5px solid white;">
            ${iconHtml}
          </div>
          ${
            badgeText
              ? `<span style="position: absolute; bottom: -8px; background: #2F4156; color: #fff; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 6px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.25); border: 1px solid white;">${badgeText}</span>`
              : ''
          }
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
  };

  const renderLayers = () => {
    try {
      const map = mapInstanceRef.current;
      const group = layerGroupRef.current;
      if (!map || !group) return;

      group.clearLayers();

      if (user.role === 'CITIZEN' && citizenData) {
        const { registeredHome, shelters, facilities, zones } = citizenData;

        // 1. Registered Home marker ("You / Home")
        if (showHome && registeredHome && isValidCoordinate(registeredHome.latitude, registeredHome.longitude)) {
          try {
            const homeIcon = createIcon(
              '#2F4156',
              `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
              42,
              'You / Home'
            );

            const homeMarker = L.marker([registeredHome.latitude, registeredHome.longitude], {
              icon: homeIcon,
              zIndexOffset: 1000,
            }).addTo(group);

            const homePopupHtml = `
              <div style="font-family: inherit; min-width: 220px; color: #2F4156; padding: 2px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                  <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #2F4156; color: #fff; padding: 2px 7px; border-radius: 6px;">Your Registered Home</span>
                </div>
                <h4 style="font-weight: 700; font-size: 14px; margin: 0 0 3px 0; color: #2F4156;">${registeredHome.name || 'Palm Meadows Villa 101'}</h4>
                <p style="font-size: 11px; color: #567C8D; margin: 0 0 6px 0;">${registeredHome.address || 'Koramangala 4th Block, Bengaluru'}</p>
                <div style="background: #F5EFEB; padding: 6px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;">
                  👥 ${registeredHome.membersCount || registeredHome.members?.length || 5} Registered Family Members
                </div>
                <p style="font-size: 10px; color: #567C8D; margin: 6px 0 0 0;">Origin for 5 km emergency preparedness perimeter.</p>
              </div>
            `;
            homeMarker.bindPopup(homePopupHtml);

            homeMarker.on('click', () => {
              setSelectedEntity({
                type: 'Registered Home',
                name: registeredHome.name || 'Palm Meadows Villa 101',
                address: registeredHome.address || 'Koramangala 4th Block, Bengaluru',
                details: `${registeredHome.membersCount || registeredHome.members?.length || 5} Registered Family Members. Primary origin for 5 km preparedness coverage.`,
                members: registeredHome.members,
              });
            });
          } catch (err) {
            console.warn('Error adding home marker:', err);
          }

          // 2. 5km Radius Circle
          if (show5kmRadius && isValidCoordinate(registeredHome.latitude, registeredHome.longitude)) {
            try {
              L.circle([registeredHome.latitude, registeredHome.longitude], {
                radius: 5000,
                color: '#567C8D',
                weight: 2,
                dashArray: '6, 8',
                fillColor: '#567C8D',
                fillOpacity: 0.05,
              }).addTo(group);
            } catch (err) {
              console.warn('Error adding 5km circle:', err);
            }
          }

          // Center on home once initial data arrives
          if (!isInitialCentered && isValidCoordinate(registeredHome.latitude, registeredHome.longitude)) {
            try {
              map.setView([registeredHome.latitude, registeredHome.longitude], 13);
              setIsInitialCentered(true);
            } catch (err) {
              console.warn('Error centering on home:', err);
            }
          }
        }

        // 3. Danger Zones (RED & ORANGE translucent polygons)
        if (showDangerZones && Array.isArray(zones) && zones.length > 0) {
          zones.forEach((zone) => {
            try {
              let coordsRaw: any[] = [];
              if (typeof zone.polygonGeoJson === 'string') {
                coordsRaw = JSON.parse(zone.polygonGeoJson);
              } else if (Array.isArray(zone.polygonGeoJson)) {
                coordsRaw = zone.polygonGeoJson;
              }

              if (!Array.isArray(coordsRaw) || coordsRaw.length === 0) return;

              // Invert [lng, lat] (GeoJSON standard) -> [lat, lng] (Leaflet standard)
              const leafletCoords: [number, number][] = coordsRaw
                .map((pt: any): [number, number] | null => {
                  if (Array.isArray(pt) && pt.length >= 2) {
                    const p0 = Number(pt[0]);
                    const p1 = Number(pt[1]);
                    if (isValidCoordinate(p1, p0) && p0 > 50 && p1 < 30) {
                      return [p1, p0]; // [lat, lng]
                    }
                    if (isValidCoordinate(p0, p1)) {
                      return [p0, p1];
                    }
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
                fillOpacity: 0.2,
              }).addTo(group);

              const zonePopupHtml = `
                <div style="font-family: inherit; min-width: 220px; color: #2F4156; padding: 2px;">
                  <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: ${isRed ? '#FEE2E2' : '#FFEDD5'}; color: ${strokeColor}; padding: 2px 7px; border-radius: 6px; display: inline-block; margin-bottom: 4px;">
                    ${zone.riskLevel || 'HAZARD'} AFFECTED DANGER ZONE
                  </div>
                  <h4 style="font-weight: 700; font-size: 13px; margin: 0 0 3px 0; color: #2F4156;">${zone.name}</h4>
                  <p style="font-size: 11px; color: #567C8D; margin: 0 0 4px 0;">Threat Model: <strong>${activeDisaster?.title || 'Active Flood Alert'}</strong></p>
                  <p style="font-size: 10.5px; color: #567C8D; margin: 0;">Predicted inundation boundary under active hydrological flood model.</p>
                </div>
              `;
              polygon.bindPopup(zonePopupHtml);

              polygon.on('click', () => {
                setSelectedEntity({
                  type: `${zone.riskLevel || 'HAZARD'} Danger Zone`,
                  name: zone.name,
                  riskLevel: zone.riskLevel,
                  details: `High-risk inundation zone predicted under active flood model for ${activeDisaster?.title || 'active disaster'}.`,
                });
              });
            } catch (err) {
              console.warn('Failed to parse zone polygon:', err);
            }
          });
        }

        // 4. Shelters (Within 5 km with capacity, expected occupancy, remaining capacity, status)
        if (showShelters && Array.isArray(shelters) && shelters.length > 0) {
          shelters.forEach((s) => {
            if (!s || !isValidCoordinate(s.latitude, s.longitude)) return;
            try {
              const sIcon = createIcon(
                '#059669',
                `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 20 10 4"/><path d="m5 20 9-16"/><path d="M2 20h20"/><path d="m14 4-2-2-2 2"/></svg>`,
                34
              );

              const marker = L.marker([s.latitude, s.longitude], {
                icon: sIcon,
                zIndexOffset: 800,
              }).addTo(group);

              const statusColor =
                s.status === 'OVER_CAPACITY'
                  ? '#DC2626'
                  : s.status === 'NEAR_CAPACITY'
                  ? '#D97706'
                  : '#059669';

              const remainingDisplayHtml =
                s.remainingCapacity !== undefined && s.remainingCapacity <= 0
                  ? '<span style="color: #DC2626; font-weight: 800;">NIL (At Capacity)</span>'
                  : `<strong>${s.remainingCapacity ?? s.capacity}</strong> available`;

              const distStr = Number.isFinite(Number(s.distanceKm))
                ? Number(s.distanceKm).toFixed(2) + ' km from home'
                : 'Within 5 km';

              const shelterPopupHtml = `
                <div style="font-family: inherit; min-width: 220px; color: #2F4156; padding: 2px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                    <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #E6F4EA; color: #059669; padding: 2px 6px; border-radius: 6px;">Safe Shelter</span>
                    <span style="font-size: 10px; font-weight: 800; color: ${statusColor}; border: 1px solid ${statusColor}40; padding: 1px 5px; border-radius: 6px;">${s.status || 'AVAILABLE'}</span>
                  </div>
                  <h4 style="font-weight: 700; font-size: 13px; margin: 0 0 3px 0; color: #2F4156;">${s.name}</h4>
                  <p style="font-size: 11px; color: #567C8D; margin: 0 0 6px 0;">${s.address || ''}</p>
                  <div style="background: #F5EFEB; padding: 6px 8px; border-radius: 8px; font-size: 11px; display: flex; flex-direction: column; gap: 2px;">
                    <div><strong>Distance:</strong> ${distStr}</div>
                    <div><strong>Total Capacity:</strong> ${s.capacity} people</div>
                    <div><strong>Expected Occupancy:</strong> ${s.expectedArrivals || 0} arrivals</div>
                    <div><strong>Remaining Capacity:</strong> ${remainingDisplayHtml}</div>
                  </div>
                  ${
                    s.contactNumber
                      ? `<div style="font-size: 11px; margin-top: 6px; color: #567C8D;">Contact: <strong>${s.contactNumber}</strong></div>`
                      : ''
                  }
                </div>
              `;
              marker.bindPopup(shelterPopupHtml);

              const onShelterSelect = () => {
                setSelectedEntity({
                  type: 'Designated Shelter',
                  name: s.name,
                  address: s.address,
                  capacity: s.capacity,
                  expectedArrivals: s.expectedArrivals || 0,
                  remainingCapacity: s.remainingCapacity,
                  status: s.status || 'AVAILABLE',
                  contact: s.contactNumber,
                  distance: `${distStr}`,
                });
              };
              marker.on('click', onShelterSelect);
              marker.on('popupopen', onShelterSelect);
            } catch (err) {
              console.warn('Failed to add shelter marker:', err);
            }
          });
        }

        // 5. Emergency Facilities (Hospitals, Fire, Police within 5 km)
        if (facilities) {
          if (showHospitals && Array.isArray(facilities.hospitals)) {
            facilities.hospitals.forEach((f) => {
              if (!f || !isValidCoordinate(f.latitude, f.longitude)) return;
              try {
                const hIcon = createIcon(
                  '#DC2626',
                  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`,
                  30
                );
                const m = L.marker([f.latitude, f.longitude], { icon: hIcon, zIndexOffset: 600 }).addTo(group);
                const distStr = Number.isFinite(Number(f.distanceKm))
                  ? Number(f.distanceKm).toFixed(2) + ' km away'
                  : 'Within 5 km';

                const hPopup = `
                  <div style="font-family: inherit; min-width: 220px; color: #2F4156; padding: 2px;">
                    <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #FEE2E2; color: #DC2626; padding: 2px 6px; border-radius: 6px;">Hospital / Medical Center</span>
                    <h4 style="font-weight: 700; font-size: 13px; margin: 4px 0 2px 0;">${f.name}</h4>
                    ${f.address ? `<p style="font-size: 11px; color: #567C8D; margin: 0 0 4px 0;">${f.address}</p>` : ''}
                    <div style="font-size: 11px; color: #2F4156;"><strong>Distance:</strong> ${distStr}</div>

                    <div style="font-size: 10px; color: #567C8D; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #E5E7EB; display: flex; justify-content: space-between;">
                      <span>Source: <strong>${f.source || 'OpenStreetMap'}</strong></span>
                      <span>Within 5 km</span>
                    </div>
                  </div>
                `;
                m.bindPopup(hPopup);

                const onSelect = () => {
                  const demoContact = f.emergencyContact || f.contactNumber || generateDemoEmergencyContact(f.id, 'HOSPITAL');
                  setSelectedEntity({
                    type: 'Hospital / Medical Center',
                    name: f.name,
                    address: f.address || null,
                    contact: demoContact,
                    emergencyContactIsDemo: true,
                    distance: distStr,
                    source: f.source || 'OpenStreetMap',
                  });
                };
                m.on('click', onSelect);
                m.on('popupopen', onSelect);
              } catch (err) {
                console.warn('Failed to add hospital marker:', err);
              }
            });
          }

          if (showFireStations && Array.isArray(facilities.fireStations)) {
            facilities.fireStations.forEach((f) => {
              if (!f || !isValidCoordinate(f.latitude, f.longitude)) return;
              try {
                const fIcon = createIcon(
                  '#D97706',
                  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
                  30
                );
                const m = L.marker([f.latitude, f.longitude], { icon: fIcon, zIndexOffset: 500 }).addTo(group);
                const distStr = Number.isFinite(Number(f.distanceKm))
                  ? Number(f.distanceKm).toFixed(2) + ' km away'
                  : 'Within 5 km';

                const fPopup = `
                  <div style="font-family: inherit; min-width: 220px; color: #2F4156; padding: 2px;">
                    <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #FEF3C7; color: #D97706; padding: 2px 6px; border-radius: 6px;">Fire & Rescue Station</span>
                    <h4 style="font-weight: 700; font-size: 13px; margin: 4px 0 2px 0;">${f.name}</h4>
                    ${f.address ? `<p style="font-size: 11px; color: #567C8D; margin: 0 0 4px 0;">${f.address}</p>` : ''}
                    <div style="font-size: 11px; color: #2F4156;"><strong>Distance:</strong> ${distStr}</div>

                    <div style="font-size: 10px; color: #567C8D; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #E5E7EB; display: flex; justify-content: space-between;">
                      <span>Source: <strong>${f.source || 'OpenStreetMap'}</strong></span>
                      <span>Within 5 km</span>
                    </div>
                  </div>
                `;
                m.bindPopup(fPopup);

                const onFireSelect = () => {
                  const demoContact = f.emergencyContact || f.contactNumber || generateDemoEmergencyContact(f.id, 'FIRE_STATION');
                  setSelectedEntity({
                    type: 'Fire & Rescue Station',
                    name: f.name,
                    address: f.address || null,
                    contact: demoContact,
                    emergencyContactIsDemo: true,
                    distance: distStr,
                    source: f.source || 'OpenStreetMap',
                  });
                };
                m.on('click', onFireSelect);
                m.on('popupopen', onFireSelect);
              } catch (err) {
                console.warn('Failed to add fire station marker:', err);
              }
            });
          }

          if (showPoliceStations && Array.isArray(facilities.policeStations)) {
            facilities.policeStations.forEach((f) => {
              if (!f || !isValidCoordinate(f.latitude, f.longitude)) return;
              try {
                const pIcon = createIcon(
                  '#2563EB',
                  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>`,
                  30
                );
                const m = L.marker([f.latitude, f.longitude], { icon: pIcon, zIndexOffset: 400 }).addTo(group);
                const distStr = Number.isFinite(Number(f.distanceKm))
                  ? Number(f.distanceKm).toFixed(2) + ' km away'
                  : 'Within 5 km';

                const pPopup = `
                  <div style="font-family: inherit; min-width: 220px; color: #2F4156; padding: 2px;">
                    <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #DBEAFE; color: #2563EB; padding: 2px 6px; border-radius: 6px;">Police Precinct</span>
                    <h4 style="font-weight: 700; font-size: 13px; margin: 4px 0 2px 0;">${f.name}</h4>
                    ${f.address ? `<p style="font-size: 11px; color: #567C8D; margin: 0 0 4px 0;">${f.address}</p>` : ''}
                    <div style="font-size: 11px; color: #2F4156;"><strong>Distance:</strong> ${distStr}</div>

                    <div style="font-size: 10px; color: #567C8D; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #E5E7EB; display: flex; justify-content: space-between;">
                      <span>Source: <strong>${f.source || 'OpenStreetMap'}</strong></span>
                      <span>Within 5 km</span>
                    </div>
                  </div>
                `;
                m.bindPopup(pPopup);

                const onPoliceSelect = () => {
                  const demoContact = f.emergencyContact || f.contactNumber || generateDemoEmergencyContact(f.id, 'POLICE_STATION');
                  setSelectedEntity({
                    type: 'Police Station / Security Precinct',
                    name: f.name,
                    address: f.address || null,
                    contact: demoContact,
                    emergencyContactIsDemo: true,
                    distance: distStr,
                    source: f.source || 'OpenStreetMap',
                  });
                };
                m.on('click', onPoliceSelect);
                m.on('popupopen', onPoliceSelect);
              } catch (err) {
                console.warn('Failed to add police station marker:', err);
              }
            });
          }
        }
      } else if ((user.role === 'RESCUER' || user.role === 'AUTHORITY') && rescuerData) {
        // RESCUER / AUTHORITY COMMAND GIS VIEW: 16 Buildings, Shelters, Facilities, Polygons
        const { households, shelters, facilities, zones } = rescuerData;

        // 1. Danger Zones
        if (showDangerZones && Array.isArray(zones) && zones.length > 0) {
          zones.forEach((zone) => {
            try {
              let coordsRaw: any[] = [];
              if (typeof zone.polygonGeoJson === 'string') {
                coordsRaw = JSON.parse(zone.polygonGeoJson);
              } else if (Array.isArray(zone.polygonGeoJson)) {
                coordsRaw = zone.polygonGeoJson;
              }

              if (!Array.isArray(coordsRaw) || coordsRaw.length === 0) return;

              const leafletCoords: [number, number][] = coordsRaw
                .map((pt: any): [number, number] | null => {
                  if (Array.isArray(pt) && pt.length >= 2) {
                    const p0 = Number(pt[0]);
                    const p1 = Number(pt[1]);
                    if (isValidCoordinate(p1, p0) && p0 > 50 && p1 < 30) return [p1, p0];
                    if (isValidCoordinate(p0, p1)) return [p0, p1];
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

              polygon.bindPopup(`<strong>${zone.name}</strong><br/>Alert Level: ${zone.riskLevel}`);

              polygon.on('click', () => {
                setSelectedEntity({
                  type: `${zone.riskLevel || 'HAZARD'} Danger Zone`,
                  name: zone.name,
                  riskLevel: zone.riskLevel,
                  details: `Sensor inundation perimeter under flood model for ${activeDisaster?.title || 'disaster'}.`,
                });
              });
            } catch (err) {
              console.warn('Failed to parse rescuer danger zone:', err);
            }
          });
        }

        // 2. All 16 Registered Buildings
        if (showHome && Array.isArray(households) && households.length > 0) {
          households.forEach((hh) => {
            const lat = hh.latitude ?? hh.registeredHomeLocation?.latitude;
            const lon = hh.longitude ?? hh.registeredHomeLocation?.longitude;
            if (!isValidCoordinate(lat, lon)) return;

            try {
              const highestAlert = hh.affectedZoneInfo?.highestAlertLevel;
              const isRed = highestAlert === 'RED';
              const isOrange = highestAlert === 'ORANGE';
              const color = isRed ? '#DC2626' : isOrange ? '#EA580C' : '#2F4156';

              const bIcon = createIcon(
                color,
                `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
                30,
                isRed ? 'RED' : isOrange ? 'ORANGE' : 'SAFE'
              );

              const m = L.marker([Number(lat), Number(lon)], { icon: bIcon }).addTo(group);

              const bName = hh.buildingNameOrNumber || hh.name || 'Building';
              const bPop = hh.statistics?.totalPopulation ?? hh.registeredPopulation ?? 50;

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
                setSelectedEntity({
                  type: 'Registered Building',
                  name: bName,
                  address: hh.address,
                  isAffected: highestAlert ? `${highestAlert} ZONE` : 'SAFE ZONE',
                  details: `Total Registered Population: ${bPop} residents. Demographics: Adults ${hh.statistics?.adultsCount ?? '-'}, Children ${hh.statistics?.childrenCount ?? '-'}, Elderly ${hh.statistics?.elderlyCount ?? '-'}.`,
                  members: hh.members,
                  population: bPop,
                });
              });
            } catch (err) {
              console.warn('Failed to add building marker:', err);
            }
          });
        }

        // 3. Shelters (All 14)
        if (showShelters && Array.isArray(shelters) && shelters.length > 0) {
          shelters.forEach((s) => {
            if (!s || !isValidCoordinate(s.latitude, s.longitude)) return;
            try {
              const sIcon = createIcon(
                '#059669',
                `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 20 10 4"/><path d="m5 20 9-16"/><path d="M2 20h20"/><path d="m14 4-2-2-2 2"/></svg>`,
                32
              );
              const m = L.marker([Number(s.latitude), Number(s.longitude)], { icon: sIcon }).addTo(group);

              m.bindPopup(`<strong>${s.name}</strong><br/>Capacity: ${s.capacity}<br/>Status: ${s.status || 'AVAILABLE'}`);

              const onRescuerShelterSelect = () => {
                setSelectedEntity({
                  type: 'Designated Shelter',
                  name: s.name,
                  address: s.address,
                  capacity: s.capacity,
                  status: s.status || 'AVAILABLE',
                  contact: s.contactNumber,
                });
              };
              m.on('click', onRescuerShelterSelect);
              m.on('popupopen', onRescuerShelterSelect);
            } catch (err) {
              console.warn('Failed to add rescuer shelter marker:', err);
            }
          });
        }

        // 4. Facilities (Hospitals, Fire Stations, Police Stations, Checkpoints)
        if (Array.isArray(facilities) && facilities.length > 0) {
          facilities.forEach((f) => {
            if (!f || !isValidCoordinate(f.latitude, f.longitude)) return;
            try {
              const fType = (f.type || '').toUpperCase();
              if (fType.includes('HOSP') && !showHospitals) return;
              if (fType.includes('FIRE') && !showFireStations) return;
              if (fType.includes('POLICE') && !showPoliceStations) return;

              let col = '#2F4156';
              let iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/></svg>`;
              let typeLabel = 'Emergency Facility';

              if (fType.includes('HOSP') || fType.includes('HEALTH')) {
                col = '#DC2626';
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`;
                typeLabel = 'Emergency Hospital';
              } else if (fType.includes('FIRE')) {
                col = '#D97706';
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
                typeLabel = 'Fire & Rescue Station';
              } else if (fType.includes('POLICE')) {
                col = '#2563EB';
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>`;
                typeLabel = 'Police Station';
              } else if (fType.includes('CHECKPOINT')) {
                col = '#4B5563';
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>`;
                typeLabel = 'Perimeter Checkpoint';
              }

              const icon = createIcon(col, iconSvg, 30);
              const m = L.marker([Number(f.latitude), Number(f.longitude)], { icon }).addTo(group);
              m.bindPopup(`
                <div style="font-family: inherit; min-width: 200px; color: #2F4156; padding: 2px;">
                  <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: ${col}15; color: ${col}; padding: 2px 6px; border-radius: 6px;">${typeLabel}</span>
                  <h4 style="font-weight: 700; font-size: 13px; margin: 4px 0 2px 0;">${f.name}</h4>
                  ${f.address ? `<p style="font-size: 11px; color: #567C8D; margin: 0 0 4px 0;">${f.address}</p>` : ''}
                  ${f.contactNumber ? `<p style="font-size: 11px; color: #2F4156; margin: 0;">Contact: <strong>${f.contactNumber}</strong></p>` : ''}
                </div>
              `);

              const onRescuerFacilitySelect = () => {
                const demoContact = f.emergencyContact || f.contactNumber || generateDemoEmergencyContact(f.id, f.type);
                setSelectedEntity({
                  type: typeLabel,
                  name: f.name,
                  address: f.address,
                  contact: demoContact,
                  emergencyContactIsDemo: true,
                  source: f.source || 'Official Response Network',
                });
              };
              m.on('click', onRescuerFacilitySelect);
              m.on('popupopen', onRescuerFacilitySelect);
            } catch (err) {
              console.warn('Failed to add rescuer facility marker:', err);
            }
          });
        }
      }
    } catch (renderErr) {
      console.error('Uncaught error in renderLayers:', renderErr);
    }
  };

  const rescuerFacilities = Array.isArray(rescuerData?.facilities) ? rescuerData.facilities : [];
  const hospitalCount =
    user.role === 'CITIZEN'
      ? (citizenData?.facilities?.hospitals || []).length
      : rescuerFacilities.filter((f) => f && (f.type || '').toUpperCase().includes('HOSP')).length;
  const fireCount =
    user.role === 'CITIZEN'
      ? (citizenData?.facilities?.fireStations || []).length
      : rescuerFacilities.filter((f) => f && (f.type || '').toUpperCase().includes('FIRE')).length;
  const policeCount =
    user.role === 'CITIZEN'
      ? (citizenData?.facilities?.policeStations || []).length
      : rescuerFacilities.filter((f) => f && (f.type || '').toUpperCase().includes('POLICE')).length;
  const shelterCount = (citizenData?.shelters || rescuerData?.shelters || []).length;
  const buildingCount = (rescuerData?.households || []).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
            Preparedness Map Intelligence
          </h1>
          <p className="text-sm font-medium text-[#567C8D] mt-1">
            {user.role === 'CITIZEN'
              ? '5km dynamic perimeter around your registered home with real-time OpenStreetMap emergency facilities, shelters, and hazard zones.'
              : 'Command GIS: All 16 registered buildings, danger zones & facility coverage across Bengaluru.'}
          </p>
          {citizenData?.osmStatus?.error && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>OpenStreetMap live facilities temporarily unavailable ({citizenData.osmStatus.error})</span>
            </div>
          )}
        </div>

        {/* Complete Legend Pills matching all facility types */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#C8D9E6] text-[#2F4156] shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2F4156]" />
            <span>{user.role === 'CITIZEN' ? 'Home' : 'Buildings'}</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#C8D9E6] text-[#059669] shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
            <span>Shelter</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#C8D9E6] text-[#DC2626] shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
            <span>Hospital</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#C8D9E6] text-[#D97706] shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
            <span>Fire Station</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#C8D9E6] text-[#2563EB] shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
            <span>Police Station</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#C8D9E6] text-[#DC2626] shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
            <span>RED Danger Zone</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#C8D9E6] text-[#EA580C] shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
            <span>ORANGE Danger Zone</span>
          </div>
          {user.role === 'CITIZEN' && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#C8D9E6] text-[#567C8D] shadow-2xs">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-[#567C8D]" />
              <span>5 km Coverage</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Map Canvas Area with Filter Bar */}
      <div className="relative rounded-3xl overflow-hidden border border-[#C8D9E6] shadow-sm bg-white">
        {/* Top Floating Control Bar */}
        <div className="absolute top-4 left-4 z-[400] flex flex-wrap gap-2 max-w-2xl">
          <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-[#C8D9E6] shadow-md flex items-center gap-1.5 text-xs font-bold text-[#2F4156]">
            <Layers className="w-3.5 h-3.5 text-[#567C8D]" />
            <span>Layers:</span>
          </div>

          {user.role === 'CITIZEN' ? (
            <button
              type="button"
              onClick={() => setShowHome(!showHome)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                showHome
                  ? 'bg-[#2F4156] text-white'
                  : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
              }`}
            >
              <Home className="w-3 h-3" />
              <span>Home</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowHome(!showHome)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                showHome
                  ? 'bg-[#2F4156] text-white'
                  : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
              }`}
            >
              <Home className="w-3 h-3" />
              <span>Buildings {buildingCount > 0 ? `(${buildingCount})` : ''}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowShelters(!showShelters)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
              showShelters
                ? 'bg-[#059669] text-white'
                : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
            }`}
          >
            <Tent className="w-3 h-3" />
            <span>Shelters {shelterCount > 0 ? `(${shelterCount})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHospitals(!showHospitals)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
              showHospitals
                ? 'bg-[#DC2626] text-white'
                : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
            }`}
          >
            <Cross className="w-3 h-3" />
            <span>Hospitals {hospitalCount > 0 ? `(${hospitalCount})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowFireStations(!showFireStations)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
              showFireStations
                ? 'bg-[#D97706] text-white'
                : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
            }`}
          >
            <Flame className="w-3 h-3" />
            <span>Fire Stations {fireCount > 0 ? `(${fireCount})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPoliceStations(!showPoliceStations)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
              showPoliceStations
                ? 'bg-[#2563EB] text-white'
                : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>Police {policeCount > 0 ? `(${policeCount})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDangerZones(!showDangerZones)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
              showDangerZones
                ? 'bg-red-600 text-white'
                : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Danger Zones</span>
          </button>

          {user.role === 'CITIZEN' && (
            <button
              type="button"
              onClick={() => setShow5kmRadius(!show5kmRadius)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                show5kmRadius
                  ? 'bg-[#567C8D] text-white'
                  : 'bg-white/90 text-[#2F4156] border border-[#C8D9E6]'
              }`}
            >
              <Compass className="w-3 h-3" />
              <span>5 km Coverage</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCenterMap}
            title={user.role === 'CITIZEN' ? "Center on Registered Home" : "Center on Incident Command Jurisdiction"}
            className="px-3 py-1.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer bg-white text-[#2F4156] border border-[#C8D9E6] hover:bg-[#F5EFEB]"
          >
            <LocateFixed className="w-3.5 h-3.5 text-[#2F4156]" />
            <span>{user.role === 'CITIZEN' ? 'Center Home' : 'Center Operations'}</span>
          </button>
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-[500] bg-white/70 backdrop-blur-xs flex items-center justify-center pointer-events-none">
            <div className="bg-white p-4 rounded-2xl shadow-xl border border-[#C8D9E6] flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-[#2F4156]" />
              <span className="text-xs font-bold text-[#2F4156]">Loading preparedness map...</span>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="absolute top-20 left-4 right-4 z-[500] max-w-md mx-auto bg-red-50 border border-red-200 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={loadMapData}
              className="px-3 py-1 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Leaflet Map Canvas (Vertically prominent ~17.2% increase from 640px to 750px) */}
        <div
          ref={mapContainerRef}
          className="w-full h-[750px] min-h-[750px] z-0"
          style={{ height: '750px', minHeight: '750px' }}
        />

        {/* Floating Entity Details Card (when clicked on a marker or zone) */}
        {selectedEntity && (
          <div
            id="selected-entity-card"
            data-testid="selected-entity-card"
            className="absolute bottom-6 left-6 right-6 sm:right-auto sm:w-96 z-[400] bg-white/95 backdrop-blur-md rounded-2xl border border-[#C8D9E6] shadow-xl p-4 transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#567C8D]/15 text-[#2F4156]">
                  {selectedEntity.type}
                </span>
                <h3 className="text-sm font-bold text-[#2F4156] mt-1">{selectedEntity.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntity(null)}
                className="text-[#567C8D] hover:text-[#2F4156] text-xs font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {selectedEntity.address && (
              <p className="text-xs text-[#567C8D] mt-1.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#567C8D] flex-shrink-0" />
                <span>{selectedEntity.address}</span>
              </p>
            )}

            {selectedEntity.details && (
              <p className="text-xs text-[#2F4156] font-medium mt-2 bg-[#F5EFEB] p-2 rounded-xl">
                {selectedEntity.details}
              </p>
            )}

            {selectedEntity.capacity && (
              <div className="mt-2 text-xs font-semibold text-[#059669] flex items-center justify-between">
                <span>Total Safe Capacity:</span>
                <span className="font-bold">{selectedEntity.capacity} People</span>
              </div>
            )}

            {selectedEntity.expectedArrivals !== undefined && (
              <div className="mt-1 text-xs text-[#567C8D] flex items-center justify-between">
                <span>Expected Occupancy:</span>
                <span className="font-bold text-[#2F4156]">{selectedEntity.expectedArrivals} People</span>
              </div>
            )}

            {selectedEntity.remainingCapacity !== undefined && (
              <div className="mt-1 text-xs text-[#059669] flex items-center justify-between">
                <span>Remaining Capacity:</span>
                <span className="font-bold">
                  {selectedEntity.remainingCapacity <= 0 ? (
                    <span className="text-red-600 font-extrabold">NIL (At Capacity)</span>
                  ) : (
                    `${selectedEntity.remainingCapacity} Available`
                  )}
                </span>
              </div>
            )}

            {selectedEntity.status && (
              <div className="mt-1 text-xs flex items-center justify-between">
                <span className="text-[#567C8D]">Status:</span>
                <span className="font-bold text-[#059669]">{selectedEntity.status}</span>
              </div>
            )}

            {selectedEntity.contact && (
              <div className="mt-2 pt-2 border-t border-[#F5EFEB]">
                <div className="flex items-center justify-between text-xs text-[#567C8D]">
                  <span className="font-medium">Emergency Contact:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#2F4156]">{selectedEntity.contact}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedEntity.distance && (
              <div className="mt-1 text-xs text-[#567C8D] flex items-center justify-between">
                <span>Distance:</span>
                <span className="font-bold text-[#2F4156]">{selectedEntity.distance}</span>
              </div>
            )}

            {selectedEntity.source && (
              <div className="mt-1 text-xs text-[#567C8D] flex items-center justify-between">
                <span>Data Source:</span>
                <span className="font-bold text-[#2F4156]">{selectedEntity.source}</span>
              </div>
            )}

            {selectedEntity.members && selectedEntity.members.length > 0 && (
              <div className="mt-3 pt-2 border-t border-[#F5EFEB]">
                <p className="text-[11px] font-bold text-[#2F4156] mb-1">
                  {user.role === 'AUTHORITY' ? 'Registered Residents:' : 'Household Members:'}
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {selectedEntity.members.map((m: any) => (
                    <div
                      key={m.id || m.name}
                      className="flex items-center justify-between text-[11px] text-[#567C8D] bg-[#F5EFEB]/70 px-2 py-1 rounded-lg"
                    >
                      <span>
                        {m.name} {m.relationship ? `(${m.relationship})` : ''}
                      </span>
                      <span className="font-bold text-[#2F4156]">{m.category || `${m.age} yrs`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


