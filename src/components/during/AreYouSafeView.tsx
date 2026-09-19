import React, { useState, useEffect } from 'react';
import { duringApi, RescueRequest, WaterLevel, EmergencyType } from '../../api/duringApi';
import { beforeApi } from '../../api/beforeApi';
import { DisasterEvent } from '../../services/disasterService.ts';
import { User } from '../../services/authService.ts';
import { DuringTab } from '../layout/DashboardLayout.tsx';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  CheckCircle2,
  AlertTriangle,
  LifeBuoy,
  Flame,
  Activity,
  Droplets,
  Users,
  Accessibility,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Loader2,
  Send,
  Navigation,
  Clock,
  Ban,
  Building,
  Info,
  Mic,
  Sparkles,
} from 'lucide-react';
import { VoiceEmergencyAssistant } from '../voice/VoiceEmergencyAssistant.tsx';

interface AreYouSafeViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onNavigateTab: (tab: DuringTab) => void;
}

export const AreYouSafeView: React.FC<AreYouSafeViewProps> = ({
  user,
  activeDisaster,
  onNavigateTab,
}) => {
  const { t } = useLanguage();
  const [currentStatus, setCurrentStatus] = useState<'SAFE' | 'IN_DISTRESS' | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDistressForm, setShowDistressForm] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [myRequests, setMyRequests] = useState<RescueRequest[]>([]);

  // Detailed SOS form state matching during-backend contract
  const [address, setAddress] = useState('14 Saidapet Bazaar Road, Near Metro Station');
  const [description, setDescription] = useState('Water rising rapidly. Grandfather unconscious and infant child trapped on roof.');
  const [latitude, setLatitude] = useState(13.0213);
  const [longitude, setLongitude] = useState(80.2231);
  const [peopleCount, setPeopleCount] = useState(4);
  const [childrenCount, setChildrenCount] = useState(1);
  const [elderlyCount, setElderlyCount] = useState(1);
  const [disabledCount, setDisabledCount] = useState(0);
  const [injuredCount, setInjuredCount] = useState(1);
  const [criticalMedicalNeed, setCriticalMedicalNeed] = useState(true);
  const [waterLevel, setWaterLevel] = useState<WaterLevel>('HIGH');
  const [emergencyType, setEmergencyType] = useState<EmergencyType>('TRAPPED');

  const [submittedRequest, setSubmittedRequest] = useState<RescueRequest | null>(null);

  useEffect(() => {
    loadMyRequests();
  }, []);

  const loadMyRequests = async () => {
    setLoading(true);
    try {
      const activeSosId = localStorage.getItem('stride_active_sos_id');
      if (activeSosId) {
        try {
          const single = await duringApi.getRequestById(activeSosId);
          if (single && single.status !== 'CANCELLED' && single.status !== 'RESCUED') {
            setSubmittedRequest(single);
            setMyRequests([single]);
            setCurrentStatus('IN_DISTRESS');
          } else {
            setSubmittedRequest(null);
            setMyRequests([]);
            setCurrentStatus('SAFE');
            localStorage.removeItem('stride_active_sos_id');
          }
        } catch {
          setSubmittedRequest(null);
          setMyRequests([]);
          setCurrentStatus('SAFE');
        }
      } else {
        setSubmittedRequest(null);
        setMyRequests([]);
        setCurrentStatus('SAFE');
      }
    } catch (e) {
      console.error('Failed to load citizen rescue requests:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDetectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(parseFloat(pos.coords.latitude.toFixed(4)));
          setLongitude(parseFloat(pos.coords.longitude.toFixed(4)));
        },
        () => {
          // Fallback location around Chennai delta
          setLatitude(13.0213);
          setLongitude(80.2231);
        }
      );
    }
  };

  const handleImSafe = () => {
    setCurrentStatus('SAFE');
    setShowDistressForm(false);
  };

  const handleSubmitDistress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || !description.trim()) {
      alert('Please fill in your address and emergency description.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await duringApi.submitRescueRequest({
        latitude,
        longitude,
        address: address.trim(),
        description: description.trim(),
        peopleCount,
        childrenCount,
        elderlyCount,
        disabledCount,
        injuredCount,
        criticalMedicalNeed,
        waterLevel,
        emergencyType,
      });

      localStorage.setItem('stride_active_sos_id', res.id);
      setSubmittedRequest(res);
      setMyRequests([res]);
      setCurrentStatus('IN_DISTRESS');
      setShowDistressForm(false);
    } catch (err: any) {
      alert('Failed to submit SOS: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this emergency request?')) return;
    try {
      await duringApi.cancelRequest(id);
      localStorage.removeItem('stride_active_sos_id');
      setSubmittedRequest(null);
      setMyRequests([]);
      setCurrentStatus('SAFE');
    } catch (err: any) {
      alert('Failed to cancel request: ' + err.message);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Title */}
      <div className="text-center">
        <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase bg-red-100 text-red-700 tracking-wider">
          Immediate Safety Check-in & Live Dispatch
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight mt-2">
          {t('during.areYouSafeTitle')}
        </h1>
        <p className="text-sm font-medium text-[#567C8D] mt-1.5 max-w-lg mx-auto">
          {t('during.areYouSafeSubtitle')}
        </p>
      </div>

      {/* Voice Emergency Hero Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-[#2F4156] via-[#243445] to-[#1e2b3a] text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-5 border border-[#567C8D]/40">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center flex-shrink-0 shadow-md animate-pulse">
            <Mic className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-bold font-['Space_Grotesk',sans-serif]">
                STRIDE Voice Emergency AI Assistant
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-600 text-white">
                SPEAK SOS
              </span>
            </div>
            <p className="text-xs text-[#C8D9E6] mt-1 max-w-lg leading-relaxed">
              Don't want to type a form? Click below and speak naturally. The AI extracts details, alerts dispatch, and stays with you.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowVoiceModal(true)}
          className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-red-600/30 cursor-pointer self-start sm:self-auto flex-shrink-0"
        >
          <Mic className="w-4 h-4" />
          <span>{submittedRequest ? 'Update via Voice' : 'Talk to STRIDE'}</span>
        </button>
      </div>

      {/* Confirmed Safe Banner */}
      {currentStatus === 'SAFE' && !showDistressForm && (
        <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-emerald-900">
            You Are Marked as Confirmed Safe
          </h2>
          <p className="text-xs text-emerald-700 max-w-md mx-auto">
            Your status is shared with disaster headquarters. If situation changes or water levels rise, click below immediately.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowDistressForm(true)}
              className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
            >
              Situation changed? Report emergency distress ?
            </button>
          </div>
        </div>
      )}

      {/* Live Active SOS Banner if request submitted */}
      {submittedRequest && submittedRequest.status !== 'CANCELLED' && submittedRequest.status !== 'RESCUED' && (
        <div className="p-6 rounded-3xl bg-red-50 border border-red-200 space-y-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <LifeBuoy className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded bg-red-200 text-red-900">
                  SERVER-CALCULATED PRIORITY: {submittedRequest.priorityLevel}
                </span>
                <h3 className="text-lg font-bold text-red-900 mt-0.5">
                  Emergency SOS Active #{submittedRequest.id.slice(0, 8)}
                </h3>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-red-700">Calculated Score</span>
              <p className="text-3xl font-bold font-['Space_Grotesk',sans-serif] text-red-600 leading-none">
                {submittedRequest.priorityScore}
              </p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-200 text-red-900 mt-1 inline-block">
                Status: {submittedRequest.status}
              </span>
            </div>
          </div>

          <p className="text-xs text-red-800 leading-relaxed">
            Your emergency request has been automatically triaged by the DURING backend priority engine with severity score <strong>{submittedRequest.priorityScore}/100</strong>. Responders in your sector have been alerted.
          </p>

          {/* Explainable Priority Breakdown from Backend */}
          {submittedRequest.priorityBreakdown && (
            <div className="p-3 bg-white/80 rounded-2xl border border-red-200 text-xs">
              <span className="font-bold text-red-900 block mb-1">Backend Triage Risk Factor Breakdown:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#2F4156]">
                {submittedRequest.priorityBreakdown.criticalMedical ? <div>• Critical Medical: +{submittedRequest.priorityBreakdown.criticalMedical}</div> : null}
                {submittedRequest.priorityBreakdown.injured ? <div>• Injured: +{submittedRequest.priorityBreakdown.injured}</div> : null}
                {submittedRequest.priorityBreakdown.children ? <div>• Children/Infants: +{submittedRequest.priorityBreakdown.children}</div> : null}
                {submittedRequest.priorityBreakdown.elderly ? <div>• Elderly: +{submittedRequest.priorityBreakdown.elderly}</div> : null}
                {submittedRequest.priorityBreakdown.disabled ? <div>• Disabled: +{submittedRequest.priorityBreakdown.disabled}</div> : null}
                {submittedRequest.priorityBreakdown.waterLevel ? <div>• Water Level: +{submittedRequest.priorityBreakdown.waterLevel}</div> : null}
                {submittedRequest.priorityBreakdown.trappedOrStructural ? <div>• Trapped/Collapse: +{submittedRequest.priorityBreakdown.trappedOrStructural}</div> : null}
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowVoiceModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[#2F4156] text-white hover:bg-[#1f2c3a] text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5 text-red-400" />
                <span>Update via Voice Assistant</span>
              </button>

              {submittedRequest.status === 'PENDING' && (
                <button
                  type="button"
                  onClick={() => handleCancelRequest(submittedRequest.id)}
                  className="px-3.5 py-2 rounded-xl border border-red-300 text-red-700 hover:bg-red-100 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Cancel Request</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('rescue')}
              className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md hover:bg-red-700 cursor-pointer"
            >
              <span>View Rescue Status</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* TWO LARGE ACTION BUTTONS (SAFE vs NEED HELP) */}
      {!showDistressForm && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
          {/* I'M SAFE */}
          <button
            type="button"
            disabled={actionLoading}
            onClick={handleImSafe}
            className="p-8 sm:p-10 rounded-3xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl hover:shadow-2xl transition duration-200 flex flex-col items-center justify-center text-center space-y-4 group cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] tracking-tight">
                {t('during.imSafe')}
              </h2>
              <p className="text-xs font-medium text-emerald-100 mt-1">
                {t('during.imSafeDesc')}
              </p>
            </div>
          </button>

          {/* I NEED HELP */}
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => setShowDistressForm(true)}
            className="p-8 sm:p-10 rounded-3xl bg-[#DC2626] hover:bg-red-700 text-white shadow-xl hover:shadow-2xl transition duration-200 flex flex-col items-center justify-center text-center space-y-4 group cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <LifeBuoy className="w-10 h-10 text-white" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] tracking-tight">
                {t('during.iNeedHelp')}
              </h2>
              <p className="text-xs font-medium text-red-100 mt-1">
                {t('during.iNeedHelpDesc')}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* SOS DISTRESS FORM */}
      {showDistressForm && (
        <div className="bg-white rounded-3xl p-6 sm:p-10 border border-red-300 shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#F5EFEB]">
            <div>
              <h3 className="text-xl font-bold font-['Space_Grotesk',sans-serif] text-red-600">
                Submit Emergency Rescue Request (SOS)
              </h3>
              <p className="text-xs text-[#567C8D] mt-0.5">
                Calculates server-side priority score (0-100) using transparent risk factors.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDistressForm(false)}
              className="text-xs font-bold text-[#567C8D] hover:text-[#2F4156] cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmitDistress} className="space-y-6">
            {/* Row 1: Emergency Type & Water Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#2F4156] mb-1.5">
                  Emergency Situation Type
                </label>
                <select
                  value={emergencyType}
                  onChange={(e) => setEmergencyType(e.target.value as EmergencyType)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-semibold text-[#2F4156] outline-none"
                >
                  <option value="FLOOD">Flood Submersion</option>
                  <option value="TRAPPED">Trapped / Roof Evacuation</option>
                  <option value="MEDICAL">Critical Medical Emergency</option>
                  <option value="STRUCTURAL_DANGER">Building Collapse / Wall Crack</option>
                  <option value="OTHER">Other Life Threat</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#2F4156] mb-1.5">
                  {t('during.waterLevel')}
                </label>
                <select
                  value={waterLevel}
                  onChange={(e) => setWaterLevel(e.target.value as WaterLevel)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-semibold text-[#2F4156] outline-none"
                >
                  <option value="LOW">{t('during.waterAnkle')}</option>
                  <option value="MEDIUM">{t('during.waterWaist')}</option>
                  <option value="HIGH">{t('during.waterChest')}</option>
                  <option value="EXTREME">{t('during.waterSubmerged')}</option>
                </select>
              </div>
            </div>

            {/* Row 2: People Count & Vulnerable Groups */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2F4156] mb-2">
                People in Immediate Danger:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-[#F5EFEB] border border-[#C8D9E6]/50">
                  <label className="block text-[10px] font-bold uppercase text-[#567C8D]">Total People</label>
                  <input
                    type="number"
                    min="1"
                    value={peopleCount}
                    onChange={(e) => setPeopleCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full mt-1 px-2 py-1 rounded-lg bg-white border border-[#C8D9E6] text-xs font-bold text-[#2F4156]"
                  />
                </div>

                <div className="p-3 rounded-xl bg-[#F5EFEB] border border-[#C8D9E6]/50">
                  <label className="block text-[10px] font-bold uppercase text-[#567C8D]">Infants / Children</label>
                  <input
                    type="number"
                    min="0"
                    value={childrenCount}
                    onChange={(e) => setChildrenCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full mt-1 px-2 py-1 rounded-lg bg-white border border-[#C8D9E6] text-xs font-bold text-[#2F4156]"
                  />
                </div>

                <div className="p-3 rounded-xl bg-[#F5EFEB] border border-[#C8D9E6]/50">
                  <label className="block text-[10px] font-bold uppercase text-[#567C8D]">Elderly (60+)</label>
                  <input
                    type="number"
                    min="0"
                    value={elderlyCount}
                    onChange={(e) => setElderlyCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full mt-1 px-2 py-1 rounded-lg bg-white border border-[#C8D9E6] text-xs font-bold text-[#2F4156]"
                  />
                </div>

                <div className="p-3 rounded-xl bg-[#F5EFEB] border border-[#C8D9E6]/50">
                  <label className="block text-[10px] font-bold uppercase text-[#567C8D]">Disabled / Bedridden</label>
                  <input
                    type="number"
                    min="0"
                    value={disabledCount}
                    onChange={(e) => setDisabledCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full mt-1 px-2 py-1 rounded-lg bg-white border border-[#C8D9E6] text-xs font-bold text-[#2F4156]"
                  />
                </div>

                <div className="p-3 rounded-xl bg-[#F5EFEB] border border-[#C8D9E6]/50">
                  <label className="block text-[10px] font-bold uppercase text-[#567C8D]">Injured</label>
                  <input
                    type="number"
                    min="0"
                    value={injuredCount}
                    onChange={(e) => setInjuredCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full mt-1 px-2 py-1 rounded-lg bg-white border border-[#C8D9E6] text-xs font-bold text-[#2F4156]"
                  />
                </div>
              </div>
            </div>

            {/* Critical Medical Checkbox */}
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-red-900 block">Critical Medical Urgency (+30 Priority Weight)</span>
                <span className="text-[11px] text-red-700">Check if someone has severe trauma, requires oxygen/dialysis, or is unconscious.</span>
              </div>
              <input
                type="checkbox"
                checked={criticalMedicalNeed}
                onChange={(e) => setCriticalMedicalNeed(e.target.checked)}
                className="w-5 h-5 rounded text-red-600 cursor-pointer"
              />
            </div>

            {/* Row 3: GPS Coordinates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#2F4156] mb-1.5 flex items-center justify-between">
                  <span>GPS Latitude</span>
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    className="text-[10px] font-bold text-red-600 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Navigation className="w-3 h-3" /> Auto-Detect
                  </button>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(parseFloat(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-semibold text-[#2F4156] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#2F4156] mb-1.5">
                  GPS Longitude
                </label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(parseFloat(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-semibold text-[#2F4156] outline-none"
                />
              </div>
            </div>

            {/* Location Address */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2F4156] mb-1.5">
                Exact Address / Landmark / Floor
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 14 Saidapet Bazaar Road, 1st floor terrace, opposite bus depot"
                className="w-full px-4 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2F4156] mb-1.5">
                Situation Description
              </label>
              <textarea
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly state obstacles, stairs trapped, special assistance required..."
                className="w-full px-4 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none resize-none"
              />
            </div>

            {/* Submit SOS Button */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDistressForm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#567C8D] hover:text-[#2F4156] cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-red-600/30 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
                <span>{actionLoading ? t('during.sending') : t('during.sendSOS')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Citizen's Active Rescue Request Details */}
      {myRequests.length > 0 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#C8D9E6] shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F5EFEB]">
            <h3 className="text-base font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              Your Registered Household Distress Beacon
            </h3>
            <span className="text-xs text-[#567C8D]">Real-time status tracking</span>
          </div>

          <div className="space-y-3">
            {myRequests.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-2xl border border-[#C8D9E6]/70 bg-[#F5EFEB]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#2F4156]">{r.address}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      r.status === 'RESCUED' ? 'bg-emerald-100 text-emerald-800' :
                      r.status === 'CANCELLED' ? 'bg-gray-200 text-gray-700' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#567C8D]">{r.description}</p>
                  <div className="text-[10px] text-[#567C8D] flex items-center gap-3 pt-1">
                    <span>Priority Score: <strong className="text-red-600">{r.priorityScore}</strong> ({r.priorityLevel})</span>
                    <span>People: {r.peopleCount}</span>
                    <span>Type: {r.emergencyType}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {r.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => handleCancelRequest(r.id)}
                      className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                  {r.team && (
                    <span className="px-3 py-1 rounded-xl bg-blue-100 text-blue-800 text-xs font-bold">
                      Team: {r.team.name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voice Emergency Assistant Modal */}
      <VoiceEmergencyAssistant
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        activeDisaster={activeDisaster}
        initialActiveRequestId={submittedRequest?.id}
        onSosUpdated={(updated) => {
          setSubmittedRequest(updated);
          setMyRequests([updated]);
          setCurrentStatus('IN_DISTRESS');
          localStorage.setItem('stride_active_sos_id', updated.id);
        }}
      />
    </div>
  );
};
