import React, { useState, useEffect, useMemo } from 'react';
import { disasterService, DisasterEvent, AffectedZone } from '../../services/disasterService.ts';
import { User } from '../../services/authService.ts';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  AlertTriangle,
  Clock,
  MapPin,
  Shield,
  Layers,
  Plus,
  Loader2,
  Calendar,
  CheckCircle2,
  X,
} from 'lucide-react';
import { MobileBottomSheet } from '../common/MobileBottomSheet.tsx';

interface PredictedThreatsViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onSelectDisaster: (d: DisasterEvent) => void;
  disasters: DisasterEvent[];
  onRefreshDisasters: () => void;
}

export const PredictedThreatsView: React.FC<PredictedThreatsViewProps> = ({
  user,
  activeDisaster,
  onSelectDisaster,
  disasters,
  onRefreshDisasters,
}) => {
  const { t } = useLanguage();
  const [zones, setZones] = useState<AffectedZone[]>([]);
  const [loading, setLoading] = useState(false);

  // Sorting: RED > ORANGE > YELLOW > GREEN, then earliest date/time first
  const sortedDisasters = useMemo(() => {
    const SEVERITY_ORDER: Record<string, number> = {
      RED: 1,
      ORANGE: 2,
      YELLOW: 3,
      GREEN: 4,
    };

    return [...disasters].sort((a, b) => {
      const sevA = SEVERITY_ORDER[String(a.alertLevel).toUpperCase()] ?? 99;
      const sevB = SEVERITY_ORDER[String(b.alertLevel).toUpperCase()] ?? 99;
      if (sevA !== sevB) {
        return sevA - sevB; // RED before ORANGE
      }
      const timeA = new Date(a.predictedStartTime || 0).getTime();
      const timeB = new Date(b.predictedStartTime || 0).getTime();
      return timeA - timeB; // Earliest onset date/time first
    });
  }, [disasters]);

  // New Threat Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [threatType, setThreatType] = useState<'FLOOD' | 'CYCLONE' | 'EARTHQUAKE' | 'LANDSLIDE'>('FLOOD');
  const [threatTitle, setThreatTitle] = useState('');
  const [threatDesc, setThreatDesc] = useState('');
  const [threatAlert, setThreatAlert] = useState<'RED' | 'ORANGE' | 'YELLOW' | 'GREEN'>('RED');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeDisaster) {
      loadZones(activeDisaster.id);
    }
  }, [activeDisaster?.id]);

  const loadZones = async (disasterId: string) => {
    setLoading(true);
    try {
      const zList = await disasterService.getAffectedZones(disasterId);
      setZones(zList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDisaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threatTitle.trim()) return;
    setSaving(true);
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const endTime = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      const created = await disasterService.createDisaster({
        type: threatType,
        title: threatTitle.trim(),
        description: threatDesc.trim() || 'Rapid sensor threshold exceeded in observation station.',
        alertLevel: threatAlert,
        predictedStartTime: startTime.toISOString(),
        predictedEndTime: endTime.toISOString(),
        status: 'ACTIVE',
      });

      // Also create default affected zone for this disaster
      await disasterService.addAffectedZone(created.id, {
        name: `${created.title} - Core Inundation Zone`,
        riskLevel: 'HIGH',
        polygonGeoJson: JSON.stringify([
          [13.072, 80.262],
          [13.092, 80.264],
          [13.095, 80.282],
          [13.078, 80.286],
        ]),
        radiusKm: 4.5,
      });

      onRefreshDisasters();
      onSelectDisaster(created);
      setShowAddModal(false);
      setThreatTitle('');
      setThreatDesc('');
    } catch (err: any) {
      alert('Failed to create disaster threat: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'RED':
        return 'bg-red-600 text-white';
      case 'ORANGE':
        return 'bg-amber-600 text-white';
      case 'YELLOW':
        return 'bg-amber-400 text-[#2F4156]';
      case 'GREEN':
        return 'bg-emerald-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
            {t('threats.title')}
          </h1>
          <p className="text-sm font-medium text-[#567C8D] mt-1">
            Sensor trend models, forecasted trajectories, and affected polygon boundaries.
          </p>
        </div>

        {user.role === 'RESCUER' && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="w-full sm:w-auto px-4 py-3 min-h-[48px] rounded-2xl lg:rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#C8D9E6]" />
            <span>Publish Disaster Threat</span>
          </button>
        )}
      </div>

      {/* Threat Cards List */}
      <div className="space-y-6">
        {sortedDisasters.map((d) => {
          const isSelected = d.id === activeDisaster?.id;

          return (
            <div
              key={d.id}
              className={`bg-white rounded-3xl p-6 sm:p-8 border transition flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-sm ${
                isSelected
                  ? 'border-[#2F4156] ring-2 ring-[#2F4156]/20'
                  : 'border-[#C8D9E6]/70 hover:border-[#567C8D]'
              }`}
            >
              <div className="flex items-start gap-4 flex-1">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0 text-red-600">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${getAlertColor(
                        d.alertLevel
                      )}`}
                    >
                      {d.alertLevel} ALERT
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#567C8D]/15 text-[#2F4156]">
                      {d.type}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F5EFEB] text-[#567C8D]">
                      STATUS: {d.status}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                    {d.title}
                  </h2>
                  <p className="text-xs text-[#567C8D] leading-relaxed max-w-3xl">
                    {d.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-[#567C8D] pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#567C8D]" />
                      Onset: {new Date(d.predictedStartTime).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#567C8D]" />
                      Forecasted End: {new Date(d.predictedEndTime).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="flex items-center gap-3 w-full sm:w-auto self-end lg:self-center">
                {isSelected ? (
                  <span className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#2F4156] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-[#C8D9E6]" />
                    <span>Active In Scope</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectDisaster(d)}
                    className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F5EFEB] hover:bg-[#2F4156] text-[#2F4156] hover:text-white text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    Select Event
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Affected Zones Table / Cards */}
      {activeDisaster && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#C8D9E6] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              Configured High-Risk Polygons & Zones
            </h3>
            <span className="text-xs font-bold text-[#567C8D]">
              {zones.length} Active Spatial Boundary
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {zones.map((z) => (
              <div
                key={z.id}
                className="p-4 rounded-2xl bg-[#F5EFEB]/70 border border-[#C8D9E6]/60 flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                    <h4 className="text-xs font-bold text-[#2F4156]">{z.name}</h4>
                  </div>
                  <p className="text-[11px] text-[#567C8D]">
                    Radius Impact: {z.radiusKm} km • Inundation Polygon
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-100 text-red-700">
                  {z.riskLevel} RISK
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Add Disaster Threat Bottom Sheet (<1024px) */}
      <MobileBottomSheet
        id="mobile-add-threat-sheet"
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Publish New Disaster Threat"
        subtitle="Broadcast active spatial hazard alert across responder networks"
      >
        <form onSubmit={handleCreateDisaster} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                Disaster Type
              </label>
              <select
                value={threatType}
                onChange={(e: any) => setThreatType(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none bg-white"
              >
                <option value="FLOOD">Flood</option>
                <option value="CYCLONE">Cyclone</option>
                <option value="EARTHQUAKE">Earthquake</option>
                <option value="LANDSLIDE">Landslide</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                Alert Level
              </label>
              <select
                value={threatAlert}
                onChange={(e: any) => setThreatAlert(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none bg-white"
              >
                <option value="RED">RED (Critical)</option>
                <option value="ORANGE">ORANGE (High)</option>
                <option value="YELLOW">YELLOW (Moderate)</option>
                <option value="GREEN">GREEN (Advisory)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#2F4156] mb-1">
              Threat Title
            </label>
            <input
              type="text"
              required
              value={threatTitle}
              onChange={(e) => setThreatTitle(e.target.value)}
              placeholder="e.g. River Delta Flash Flood Warning"
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#2F4156] mb-1">
              Description & Sensor Evidence
            </label>
            <textarea
              rows={3}
              value={threatDesc}
              onChange={(e) => setThreatDesc(e.target.value)}
              placeholder="e.g. Telemetry indicates 220mm rainfall with river stage crossing 4.8m safety threshold."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none resize-none"
            />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="w-full sm:w-auto px-4 py-3 min-h-[48px] rounded-xl text-xs font-bold text-[#567C8D] hover:text-[#2F4156] bg-gray-100 flex items-center justify-center cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-5 py-3 min-h-[48px] rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Publish Alert</span>
            </button>
          </div>
        </form>
      </MobileBottomSheet>

      {/* Desktop Add Disaster Threat Modal (>=1024px) */}
      {showAddModal && (
        <div className="hidden lg:flex fixed inset-0 z-50 bg-black/40 backdrop-blur-sm items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#C8D9E6] shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-[#F5EFEB]">
              <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                Publish New Disaster Threat
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-[#567C8D] hover:text-[#2F4156] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDisaster} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                    Disaster Type
                  </label>
                  <select
                    value={threatType}
                    onChange={(e: any) => setThreatType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
                  >
                    <option value="FLOOD">Flood</option>
                    <option value="CYCLONE">Cyclone</option>
                    <option value="EARTHQUAKE">Earthquake</option>
                    <option value="LANDSLIDE">Landslide</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                    Alert Level
                  </label>
                  <select
                    value={threatAlert}
                    onChange={(e: any) => setThreatAlert(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
                  >
                    <option value="RED">RED (Critical)</option>
                    <option value="ORANGE">ORANGE (High)</option>
                    <option value="YELLOW">YELLOW (Moderate)</option>
                    <option value="GREEN">GREEN (Advisory)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                  Threat Title
                </label>
                <input
                  type="text"
                  required
                  value={threatTitle}
                  onChange={(e) => setThreatTitle(e.target.value)}
                  placeholder="e.g. River Delta Flash Flood Warning"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                  Description & Sensor Evidence
                </label>
                <textarea
                  rows={3}
                  value={threatDesc}
                  onChange={(e) => setThreatDesc(e.target.value)}
                  placeholder="e.g. Telemetry indicates 220mm rainfall with river stage crossing 4.8m safety threshold."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#567C8D] hover:text-[#2F4156] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Publish Alert</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
