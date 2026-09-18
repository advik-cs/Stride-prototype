import React from 'react';
import { Hospital } from '../../services/hospitalService.ts';
import { User } from '../../services/authService.ts';
import {
  Building2,
  MapPin,
  Phone,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Users,
  Navigation,
  X,
  Stethoscope,
  ShieldAlert,
  Share2,
  Check,
} from 'lucide-react';

interface HospitalDetailsProps {
  hospital: Hospital | null;
  user: User;
  mode?: 'BEFORE' | 'DURING';
  onClose: () => void;
  onSelectAsDestination?: (hospital: Hospital) => void;
}

export const HospitalDetails: React.FC<HospitalDetailsProps> = ({
  hospital,
  user,
  mode = 'BEFORE',
  onClose,
  onSelectAsDestination,
}) => {
  const [copiedCoords, setCopiedCoords] = React.useState(false);

  if (!hospital) return null;

  const handleCopyCoordinates = () => {
    const coords = `${hospital.latitude.toFixed(4)}, ${hospital.longitude.toFixed(4)}`;
    navigator.clipboard?.writeText(coords);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2500);
  };

  const isRescuer = user.role === 'RESCUER';
  const isAuthority = user.role === 'AUTHORITY';
  const isCitizen = user.role === 'CITIZEN';

  const bedOccupancyPct = Math.round(
    ((hospital.totalBeds - hospital.availableBeds) / hospital.totalBeds) * 100
  );
  const icuOccupancyPct = Math.round(
    ((hospital.icuBedsTotal - hospital.icuBedsAvailable) / hospital.icuBedsTotal) * 100
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#C8D9E6]/60 flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-[#F5EFEB] flex items-start justify-between gap-4 sticky top-0 bg-white/95 backdrop-blur z-10">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0 border border-red-100 shadow-sm">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-100 text-red-700 tracking-wider">
                  Hospital & Medical Center
                </span>
                {hospital.distanceKm !== undefined && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F5EFEB] text-[#2F4156] flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-[#567C8D]" />
                    {hospital.distanceKm.toFixed(2)} km away
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] mt-1">
                {hospital.name}
              </h2>
              <p className="text-xs text-[#567C8D] flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{hospital.address}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#567C8D] hover:text-[#2F4156] hover:bg-[#F5EFEB] transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          {/* MANDATORY DEMO DATA DISCLAIMER BANNER */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-start gap-3 text-amber-900 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                ⚠️ DEMO DATA DISCLAIMER
              </p>
              <p className="text-xs font-medium text-amber-800/90 mt-0.5">
                {hospital.disclaimer ||
                  'Bed and doctor availability is simulated for the STRIDE prototype and does not represent live hospital capacity.'}
              </p>
            </div>
          </div>

          {/* Emergency Department Availability Indicator */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  Emergency Department
                </p>
                <p className="text-sm font-semibold text-emerald-800">
                  {hospital.emergencyStatusText}
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              24/7 Active
            </span>
          </div>

          {/* Demo Simulated Bed Telemetry */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#567C8D] mb-3">
              Simulated Bed Capacity (Demo Data)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* General Inpatient Beds */}
              <div className="p-4 rounded-2xl bg-[#F5EFEB]/50 border border-[#C8D9E6]/60">
                <div className="flex items-center justify-between text-xs font-bold text-[#567C8D] mb-1">
                  <span>General / Acute Beds</span>
                  <span className="text-[#2F4156] font-extrabold font-['Space_Grotesk']">
                    {hospital.availableBeds} Available / {hospital.totalBeds} Total
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#C8D9E6]/60 overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      hospital.availableBeds > 30
                        ? 'bg-emerald-500'
                        : hospital.availableBeds > 10
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(5, (hospital.availableBeds / hospital.totalBeds) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#567C8D] mt-2">
                  Estimated occupancy: <span className="font-semibold text-[#2F4156]">{bedOccupancyPct}% occupied</span>
                </p>
              </div>

              {/* ICU / Critical Care Beds */}
              <div className="p-4 rounded-2xl bg-[#F5EFEB]/50 border border-[#C8D9E6]/60">
                <div className="flex items-center justify-between text-xs font-bold text-[#567C8D] mb-1">
                  <span>Critical Care / ICU Beds</span>
                  <span className="text-[#2F4156] font-extrabold font-['Space_Grotesk']">
                    {hospital.icuBedsAvailable} Available / {hospital.icuBedsTotal} Total
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#C8D9E6]/60 overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      hospital.icuBedsAvailable > 8
                        ? 'bg-emerald-500'
                        : hospital.icuBedsAvailable > 3
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(5, (hospital.icuBedsAvailable / hospital.icuBedsTotal) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#567C8D] mt-2">
                  Estimated ICU occupancy: <span className="font-semibold text-[#2F4156]">{icuOccupancyPct}% occupied</span>
                </p>
              </div>
            </div>
          </div>

          {/* Medical Specialities */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#567C8D] mb-2.5">
              Available Medical Specialities
            </h3>
            <div className="flex flex-wrap gap-2">
              {hospital.specialities.map((spec, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-[#C8D9E6] text-[#2F4156] shadow-2xs"
                >
                  {spec}
                </span>
              ))}
            </div>
          </div>

          {/* On-Duty Doctors / Medical Staff (Simulated) */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#567C8D] mb-2.5 flex items-center gap-1.5">
              <Stethoscope className="w-4 h-4 text-[#567C8D]" />
              <span>Simulated On-Duty Doctors & Specialists</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {hospital.doctors.map((doc, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-white border border-[#C8D9E6]/60 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div>
                    <p className="text-xs font-bold text-[#2F4156]">{doc.name}</p>
                    <p className="text-[11px] text-[#567C8D]">{doc.speciality}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      doc.onDuty
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {doc.onDuty ? 'On Duty' : 'Off Duty'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Contact & Dispatch Bar */}
          <div className="pt-4 border-t border-[#F5EFEB] flex flex-wrap items-center justify-between gap-3">
            <a
              href={`tel:${hospital.contactNumber}`}
              className="px-4 py-2.5 rounded-2xl bg-[#2F4156] hover:bg-[#243445] text-white text-xs font-bold flex items-center gap-2 transition shadow-sm"
            >
              <Phone className="w-4 h-4" />
              <span>Call Hospital: {hospital.contactNumber}</span>
            </a>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCoordinates}
                className="px-3 py-2 rounded-2xl bg-white border border-[#C8D9E6] hover:bg-[#F5EFEB] text-xs font-semibold text-[#2F4156] flex items-center gap-1.5 transition"
              >
                {copiedCoords ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-[#567C8D]" />}
                <span>{copiedCoords ? 'Coordinates Copied' : 'Copy GPS'}</span>
              </button>

              {/* Rescuer During Action */}
              {isRescuer && mode === 'DURING' && onSelectAsDestination && (
                <button
                  type="button"
                  onClick={() => onSelectAsDestination(hospital)}
                  className="px-4 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-600/20 transition cursor-pointer"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Set as Rescue Destination</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
