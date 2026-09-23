import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Hospital } from '../../services/hospitalService.ts';
import { User } from '../../services/authService.ts';
import { Navigation, Building2, MapPin } from 'lucide-react';

interface HospitalMapProps {
  hospitals: Hospital[];
  selectedHospital: Hospital | null;
  onSelectHospital: (hospital: Hospital) => void;
  user: User;
  userLocation: { latitude: number; longitude: number } | null;
}

export const HospitalMap: React.FC<HospitalMapProps> = ({
  hospitals,
  selectedHospital,
  onSelectHospital,
  user,
  userLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const isCitizen = user.role === 'CITIZEN';

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = userLocation
      ? [userLocation.latitude, userLocation.longitude]
      : [12.955, 77.615]; // Central Bengaluru

    const initialZoom = isCitizen ? 13 : 12;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    // Invalidate size on load to ensure proper tile layout
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Update Markers & Scope when hospitals, selection, or userLocation changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. If Citizen: render registered home marker and 5 km radius circle
    if (isCitizen && userLocation) {
      const homeIcon = L.divIcon({
        className: 'custom-home-pin',
        html: `
          <div style="
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background: #2F4156;
            color: #FFFFFF;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
            box-shadow: 0 4px 8px rgba(0,0,0,0.25);
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      L.marker([userLocation.latitude, userLocation.longitude], {
        icon: homeIcon,
        zIndexOffset: 1000,
      })
        .bindPopup(`
          <div style="font-family: inherit; padding: 2px;">
            <strong style="color: #2F4156; font-size: 13px;">Your Registered Home</strong>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #567C8D;">5 km neighborhood medical perimeter</p>
          </div>
        `)
        .addTo(group);

      // 5 km perimeter circle
      L.circle([userLocation.latitude, userLocation.longitude], {
        radius: 5000, // 5 km
        color: '#567C8D',
        fillColor: '#567C8D',
        fillOpacity: 0.06,
        weight: 1.5,
        dashArray: '5, 5',
      }).addTo(group);
    }

    // 2. Render Hospital Markers
    const bounds: [number, number][] = [];

    hospitals.forEach((h) => {
      const isSelected = selectedHospital?.id === h.id;

      const markerColor =
        h.availableBeds >= 25
          ? '#10B981' // Emerald
          : h.availableBeds >= 10
          ? '#F59E0B' // Amber
          : '#EF4444'; // Red

      const iconHtml = `
        <div style="
          position: relative;
          width: ${isSelected ? 42 : 34}px;
          height: ${isSelected ? 42 : 34}px;
          border-radius: 50%;
          background: #FFFFFF;
          border: 3px solid ${markerColor};
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          ${isSelected ? 'transform: scale(1.15); z-index: 1000;' : ''}
        ">
          <svg width="${isSelected ? 22 : 18}" height="${isSelected ? 22 : 18}" viewBox="0 0 24 24" fill="none" stroke="${markerColor}" stroke-width="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span style="
            position: absolute;
            top: -6px;
            right: -6px;
            background: ${markerColor};
            color: white;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 4px;
            border-radius: 8px;
            border: 1px solid white;
          ">${h.availableBeds}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: `custom-hospital-marker-${h.id}`,
        html: iconHtml,
        iconSize: [isSelected ? 42 : 34, isSelected ? 42 : 34],
        iconAnchor: [isSelected ? 21 : 17, isSelected ? 21 : 17],
      });

      const marker = L.marker([h.latitude, h.longitude], {
        icon: customIcon,
        zIndexOffset: isSelected ? 900 : 500,
      }).addTo(group);

      bounds.push([h.latitude, h.longitude]);

      const distStr =
        h.distanceKm !== undefined ? `<strong>${h.distanceKm.toFixed(1)} km</strong> away` : 'Bengaluru District';

      const popupContent = document.createElement('div');
      popupContent.style.fontFamily = 'inherit';
      popupContent.style.padding = '4px';
      popupContent.style.minWidth = '220px';
      popupContent.innerHTML = `
        <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #DC2626; margin-bottom: 2px;">
          Hospital / Medical Center
        </div>
        <h4 style="font-size: 13px; font-weight: 700; color: #2F4156; margin: 0 0 4px 0;">${h.name}</h4>
        <p style="font-size: 11px; color: #567C8D; margin: 0 0 6px 0;">${h.address}</p>
        <div style="background: #F5EFEB; border-radius: 8px; padding: 6px 8px; font-size: 11px; color: #2F4156; margin-bottom: 6px;">
          <div>Distance: ${distStr}</div>
          <div style="margin-top: 2px;">Available Beds: <strong style="color: ${markerColor}">${h.availableBeds}</strong> / ${h.totalBeds}</div>
        </div>
        <button id="open-hosp-${h.id}" style="
          width: 100%;
          padding: 6px 12px;
          border-radius: 8px;
          background: #2F4156;
          color: white;
          font-size: 11px;
          font-weight: 700;
          border: none;
          cursor: pointer;
        ">View Hospital Details</button>
      `;

      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`open-hosp-${h.id}`);
        if (btn) {
          btn.onclick = () => onSelectHospital(h);
        }
      });

      marker.on('click', () => {
        onSelectHospital(h);
      });
    });

    // Center on selected hospital if chosen
    if (selectedHospital) {
      map.setView([selectedHospital.latitude, selectedHospital.longitude], isCitizen ? 14 : 13, {
        animate: true,
      });
    } else if (bounds.length > 0 && !isCitizen) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [hospitals, selectedHospital, userLocation, isCitizen]);

  return (
    <div className="relative w-full h-[380px] sm:h-[450px] lg:h-[550px] rounded-3xl overflow-hidden border border-[#C8D9E6]/60 shadow-xs bg-[#F5EFEB]">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Map Legend & Role Scope Overlay */}
      <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur p-2.5 sm:p-3 rounded-2xl shadow-md border border-[#C8D9E6]/60 text-[11px] sm:text-xs text-[#2F4156] space-y-1 sm:space-y-1.5 pointer-events-auto max-w-[190px] sm:max-w-none">
        <p className="font-bold text-[10px] uppercase tracking-wider text-[#567C8D]">
          {isCitizen ? 'Local Neighborhood Scope (5 km)' : 'Operational Jurisdiction View'}
        </p>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500 flex-shrink-0" />
          <span>Ample Beds (&ge;25)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500 flex-shrink-0" />
          <span>Limited Beds (10–24)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500 flex-shrink-0" />
          <span>Critical / Low Beds (&lt;10)</span>
        </div>
      </div>
    </div>
  );
};
