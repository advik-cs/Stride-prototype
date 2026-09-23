import React, { useState, useEffect } from 'react';
import { hospitalService, Hospital } from '../../services/hospitalService.ts';
import { User } from '../../services/authService.ts';
import { DisasterEvent } from '../../services/disasterService.ts';
import { HospitalList } from './HospitalList.tsx';
import { HospitalMap } from './HospitalMap.tsx';
import { HospitalDetails } from './HospitalDetails.tsx';
import {
  Building2,
  MapPin,
  Activity,
  AlertTriangle,
  Loader2,
  RefreshCw,
  LayoutList,
  Map as MapIcon,
  Columns2,
  Navigation,
  LifeBuoy,
  Clock,
} from 'lucide-react';
import { formatLastUpdated } from '../../offline/offlineDateUtils.ts';

interface HospitalInformationViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  mode?: 'BEFORE' | 'DURING';
  onNavigateTab?: (tab: any) => void;
}

export const HospitalInformationView: React.FC<HospitalInformationViewProps> = ({
  user,
  activeDisaster,
  mode = 'BEFORE',
  onNavigateTab,
}) => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [meta, setMeta] = useState<{ source?: 'server' | 'cache' | 'none'; lastSyncedAt?: string; isStale?: boolean }>({});
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [activeLayout, setActiveLayout] = useState<'SPLIT' | 'LIST' | 'MAP'>('SPLIT');

  const isCitizen = user.role === 'CITIZEN';
  const isRescuer = user.role === 'RESCUER';
  const isAuthority = user.role === 'AUTHORITY';

  useEffect(() => {
    loadHospitals();
  }, [user.role, mode]);

  const loadHospitals = async () => {
    setLoading(true);
    try {
      // If citizen, request nearby local scoping
      const res = await hospitalService.getHospitals({
        scope: isCitizen ? 'local' : 'all',
      });
      setHospitals(res.hospitals);
      setUserLocation(res.userLocation);
      setMeta({ source: res.source, lastSyncedAt: res.lastSyncedAt, isStale: res.isStale });
    } catch (err) {
      console.error('Failed to load hospital data:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalAvailableBeds = hospitals.reduce((acc, h) => acc + h.availableBeds, 0);
  const totalTotalBeds = hospitals.reduce((acc, h) => acc + h.totalBeds, 0);
  const totalIcuBeds = hospitals.reduce((acc, h) => acc + h.icuBedsAvailable, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-red-100 text-red-700">
              {mode === 'DURING' ? '🚨 Active Disaster Medical Intelligence' : '🏥 Preparedness Medical Network'}
            </span>
            <span className="text-xs font-bold text-[#567C8D]">
              {isCitizen ? 'Citizen Neighborhood Scope' : isAuthority ? 'Authority Command Overview' : 'Rescuer Triage Directory'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight mt-1.5">
            Hospital Information & Medical Readiness
          </h1>
          <p className="text-xs sm:text-sm text-[#567C8D] mt-1">
            {isCitizen
              ? 'Locate nearby medical centers, emergency trauma facilities, and bed availability before and during emergencies.'
              : 'Jurisdiction-wide hospital capacity, emergency readiness, and specialized medical resource intelligence.'}
          </p>
          {meta.lastSyncedAt && (
            meta.source === 'cache' ? (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-full text-xs font-medium">
                <Clock className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                <span>{formatLastUpdated(meta.lastSyncedAt, meta.isStale, true)}</span>
                <span className="text-amber-600">· Availability reflects the last saved update and may have changed.</span>
              </div>
            ) : (
              <p className="text-xs text-[#567C8D] mt-1.5 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#567C8D]" />
                <span>{formatLastUpdated(meta.lastSyncedAt, false, false)}</span>
              </p>
            )
          )}
        </div>

        {/* Layout Mode Toggles & Refresh */}
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-2xl bg-white border border-[#C8D9E6]/60 shadow-xs flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveLayout('SPLIT')}
              className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeLayout === 'SPLIT' ? 'bg-[#2F4156] text-white shadow-xs' : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
              title="Split Map & List View"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Split</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveLayout('LIST')}
              className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeLayout === 'LIST' ? 'bg-[#2F4156] text-white shadow-xs' : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
              title="List Directory View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden md:inline">List</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveLayout('MAP')}
              className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeLayout === 'MAP' ? 'bg-[#2F4156] text-white shadow-xs' : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
              title="Full Map View"
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Map</span>
            </button>
          </div>

          <button
            type="button"
            onClick={loadHospitals}
            className="p-2.5 rounded-2xl bg-white border border-[#C8D9E6]/60 text-[#567C8D] hover:text-[#2F4156] shadow-xs transition"
            title="Refresh Hospital Registry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Telemetry Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Hospitals */}
        <div className="p-5 rounded-3xl bg-white border border-[#C8D9E6]/60 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#567C8D] block">
            {isCitizen ? 'Nearby Hospitals' : 'Total Hospitals'}
          </span>
          <p className="text-2xl font-bold font-['Space_Grotesk'] text-[#2F4156] mt-1">
            {hospitals.length}
          </p>
          <span className="text-[11px] text-[#567C8D] mt-0.5 block">
            {isCitizen ? 'Within neighborhood perimeter' : 'Registered Bengaluru facilities'}
          </span>
        </div>

        {/* Available Beds */}
        <div className="p-5 rounded-3xl bg-white border border-[#C8D9E6]/60 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#567C8D] block">
            Available Beds
          </span>
          <p className="text-2xl font-bold font-['Space_Grotesk'] text-emerald-700 mt-1">
            {totalAvailableBeds}
            <span className="text-xs font-normal text-[#567C8D] ml-1.5">/ {totalTotalBeds} Total</span>
          </p>
          <span className="text-[11px] text-[#567C8D] mt-0.5 block">
            Operational inpatient capacity
          </span>
        </div>

        {/* ICU Beds */}
        <div className="p-5 rounded-3xl bg-white border border-[#C8D9E6]/60 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#567C8D] block">
            ICU Beds
          </span>
          <p className="text-2xl font-bold font-['Space_Grotesk'] text-blue-700 mt-1">
            {totalIcuBeds}
          </p>
          <span className="text-[11px] text-[#567C8D] mt-0.5 block">
            Critical care beds available
          </span>
        </div>

        {/* Emergency Services Status */}
        <div className="p-5 rounded-3xl bg-white border border-[#C8D9E6]/60 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#567C8D] block">
            Emergency Casualty
          </span>
          <p className="text-2xl font-bold font-['Space_Grotesk'] text-emerald-600 mt-1 flex items-center gap-1.5">
            <span>24/7 Active</span>
          </p>
          <span className="text-[11px] text-[#567C8D] mt-0.5 block">
            All registered ER trauma units
          </span>
        </div>
      </div>

      {/* Main Content Layouts */}
      {loading ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-[#C8D9E6]/60 shadow-xs">
          <Loader2 className="w-8 h-8 text-[#567C8D] animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-[#2F4156]">Loading canonical hospital directory...</p>
          <p className="text-xs text-[#567C8D] mt-1">Retrieving bed telemetry and facility locations.</p>
        </div>
      ) : (
        <>
          {activeLayout === 'SPLIT' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 order-2 lg:order-1">
                <HospitalList
                  hospitals={hospitals}
                  selectedHospital={selectedHospital}
                  onSelectHospital={(h) => setSelectedHospital(h)}
                  user={user}
                />
              </div>
              <div className="lg:col-span-7 order-1 lg:order-2">
                <HospitalMap
                  hospitals={hospitals}
                  selectedHospital={selectedHospital}
                  onSelectHospital={(h) => setSelectedHospital(h)}
                  user={user}
                  userLocation={userLocation}
                />
              </div>
            </div>
          )}

          {activeLayout === 'LIST' && (
            <div className="max-w-4xl mx-auto">
              <HospitalList
                hospitals={hospitals}
                selectedHospital={selectedHospital}
                onSelectHospital={(h) => setSelectedHospital(h)}
                user={user}
              />
            </div>
          )}

          {activeLayout === 'MAP' && (
            <div>
              <HospitalMap
                hospitals={hospitals}
                selectedHospital={selectedHospital}
                onSelectHospital={(h) => setSelectedHospital(h)}
                user={user}
                userLocation={userLocation}
              />
            </div>
          )}
        </>
      )}

      {/* Reusable HospitalDetails Modal */}
      {selectedHospital && (
        <HospitalDetails
          hospital={selectedHospital}
          user={user}
          mode={mode}
          onClose={() => setSelectedHospital(null)}
          onSelectAsDestination={(h) => {
            alert(`Selected ${h.name} as primary emergency destination. Dispatch telemetry updated.`);
            setSelectedHospital(null);
          }}
        />
      )}
    </div>
  );
};
