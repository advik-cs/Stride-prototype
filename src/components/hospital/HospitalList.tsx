import React, { useState, useMemo } from 'react';
import { Hospital } from '../../services/hospitalService.ts';
import { User } from '../../services/authService.ts';
import {
  Building2,
  MapPin,
  Phone,
  Search,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  ArrowRight,
  Filter,
} from 'lucide-react';

interface HospitalListProps {
  hospitals: Hospital[];
  selectedHospital: Hospital | null;
  onSelectHospital: (hospital: Hospital) => void;
  user: User;
}

export const HospitalList: React.FC<HospitalListProps> = ({
  hospitals,
  selectedHospital,
  onSelectHospital,
  user,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'AMPLE_BEDS' | 'ICU' | 'TRAUMA'>('ALL');

  const filteredHospitals = useMemo(() => {
    return hospitals.filter((h) => {
      // Text query match
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        h.name.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.specialities.some((s) => s.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Filter chips
      if (filterType === 'AMPLE_BEDS') return h.availableBeds >= 25;
      if (filterType === 'ICU') return h.icuBedsAvailable > 5;
      if (filterType === 'TRAUMA') {
        return h.specialities.some((s) => s.toLowerCase().includes('trauma'));
      }

      return true;
    });
  }, [hospitals, searchQuery, filterType]);

  return (
    <div className="space-y-4">
      {/* Search & Filter Controls */}
      <div className="bg-white p-4 rounded-3xl border border-[#C8D9E6]/60 shadow-xs space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#567C8D] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hospitals by name, area, or medical specialty..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#F5EFEB]/50 border border-[#C8D9E6]/60 text-xs font-medium text-[#2F4156] placeholder-[#567C8D] focus:outline-none focus:ring-2 focus:ring-[#567C8D]/20 focus:border-[#567C8D]"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'ALL'
                ? 'bg-[#2F4156] text-white shadow-xs'
                : 'bg-[#F5EFEB] text-[#567C8D] hover:text-[#2F4156]'
            }`}
          >
            All Hospitals ({hospitals.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('AMPLE_BEDS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'AMPLE_BEDS'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-[#F5EFEB] text-[#567C8D] hover:text-[#2F4156]'
            }`}
          >
            Ample Beds (&ge;25)
          </button>
          <button
            type="button"
            onClick={() => setFilterType('ICU')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'ICU'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-[#F5EFEB] text-[#567C8D] hover:text-[#2F4156]'
            }`}
          >
            ICU Available (&gt;5)
          </button>
          <button
            type="button"
            onClick={() => setFilterType('TRAUMA')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'TRAUMA'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-[#F5EFEB] text-[#567C8D] hover:text-[#2F4156]'
            }`}
          >
            Trauma Units
          </button>
        </div>
      </div>

      {/* Hospital Cards Grid */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
        {filteredHospitals.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-[#C8D9E6]/60">
            <Building2 className="w-10 h-10 text-[#567C8D] mx-auto mb-2 opacity-50" />
            <h4 className="text-sm font-bold text-[#2F4156]">
              {typeof navigator !== 'undefined' && !navigator.onLine
                ? 'No Cached Hospitals Available'
                : 'No hospitals found'}
            </h4>
            <p className="text-xs text-[#567C8D] mt-1">
              {typeof navigator !== 'undefined' && !navigator.onLine
                ? 'No saved hospital data is available on this device yet. Connect to the internet to load registered hospital facilities.'
                : 'Try adjusting your search keywords or filter criteria.'}
            </p>
          </div>
        ) : (
          filteredHospitals.map((h) => {
            const isSelected = selectedHospital?.id === h.id;

            return (
              <div
                key={h.id}
                onClick={() => onSelectHospital(h)}
                className={`p-5 rounded-3xl border transition cursor-pointer bg-white ${
                  isSelected
                    ? 'border-[#2F4156] ring-2 ring-[#2F4156]/20 shadow-md'
                    : 'border-[#C8D9E6]/60 hover:border-[#567C8D] hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0 border border-red-100 mt-0.5">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-[#2F4156] hover:text-blue-600 transition">
                          {h.name}
                        </h4>
                        {h.distanceKm !== undefined && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F5EFEB] text-[#2F4156] flex items-center gap-1">
                            <Navigation className="w-2.5 h-2.5 text-[#567C8D]" />
                            {h.distanceKm.toFixed(1)} km away
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#567C8D] flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="line-clamp-1">{h.address}</span>
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 flex-shrink-0">
                    24/7 ER Active
                  </span>
                </div>

                {/* Bed Telemetry Row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#F5EFEB]">
                  {/* Available Beds */}
                  <div className="p-2.5 rounded-2xl bg-[#F5EFEB]/50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#567C8D] block">
                      Available Beds
                    </span>
                    <p className="text-base font-bold font-['Space_Grotesk'] text-[#2F4156] mt-0.5">
                      <span
                        className={
                          h.availableBeds > 30
                            ? 'text-emerald-700'
                            : h.availableBeds > 15
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }
                      >
                        {h.availableBeds}
                      </span>
                      <span className="text-xs text-[#567C8D] font-normal"> / {h.totalBeds}</span>
                    </p>
                  </div>

                  {/* ICU Beds */}
                  <div className="p-2.5 rounded-2xl bg-[#F5EFEB]/50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#567C8D] block">
                      ICU Beds
                    </span>
                    <p className="text-base font-bold font-['Space_Grotesk'] text-[#2F4156] mt-0.5">
                      <span className="text-blue-700">{h.icuBedsAvailable}</span>
                      <span className="text-xs text-[#567C8D] font-normal"> / {h.icuBedsTotal}</span>
                    </p>
                  </div>

                  {/* Primary Specialty */}
                  <div className="col-span-2 sm:col-span-1 p-2.5 rounded-2xl bg-[#F5EFEB]/50 flex flex-col justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#567C8D] block">
                      Key Specialty
                    </span>
                    <p className="text-xs font-semibold text-[#2F4156] truncate mt-0.5">
                      {h.specialities[0] || 'Emergency Care'}
                    </p>
                  </div>
                </div>

                {/* Specialties preview pills */}
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  {h.specialities.slice(0, 3).map((spec, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-700"
                    >
                      {spec}
                    </span>
                  ))}
                  {h.specialities.length > 3 && (
                    <span className="text-[10px] font-bold text-[#567C8D]">
                      +{h.specialities.length - 3} more
                    </span>
                  )}
                </div>

                {/* Card Footer Button */}
                <div className="mt-3.5 flex items-center justify-between">
                  <span className="text-[11px] text-[#567C8D]">
                    Doctors on duty: <strong className="text-[#2F4156]">{h.doctors.filter((d) => d.onDuty).length}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectHospital(h);
                    }}
                    className="text-xs font-bold text-[#2F4156] hover:text-blue-600 flex items-center gap-1"
                  >
                    <span>View Hospital Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
