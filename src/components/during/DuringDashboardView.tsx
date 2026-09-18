import React, { useState, useEffect } from 'react';
import { emergencyService, CommunityStatus } from '../../services/emergencyService.ts';
import { DisasterEvent } from '../../services/disasterService.ts';
import { User } from '../../services/authService.ts';
import { DuringTab } from '../layout/DashboardLayout.tsx';
import { LiveWeatherCard } from '../common/LiveWeatherCard.tsx';
import { VoiceEmergencyAssistant } from './VoiceEmergencyAssistant.tsx';
import {
  LifeBuoy,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Radio,
  ArrowRight,
  Building2,
  MapPin,
  Clock,
  ShieldCheck,
  Mic,
  Tent,
  Activity,
} from 'lucide-react';

interface DuringDashboardViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onNavigateTab: (tab: DuringTab) => void;
}

export const DuringDashboardView: React.FC<DuringDashboardViewProps> = ({
  user,
  activeDisaster,
  onNavigateTab,
}) => {
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  useEffect(() => {
    loadCommunityStatus();
    // Live polling for emergency situation
    const interval = setInterval(loadCommunityStatus, 5000);
    return () => clearInterval(interval);
  }, [activeDisaster?.id]);

  const loadCommunityStatus = async () => {
    if (!activeDisaster) return;
    try {
      const data = await emergencyService.getCommunityStatus(activeDisaster.id);
      setStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const safeCount = status?.confirmedSafe || 0;
  const distressCount = status?.inDistress || 0;
  const unaccountedCount = status?.unaccounted || 0;
  const total = status?.totalPopulation || 1;

  const safePct = Math.round((safeCount / total) * 100) || 0;
  const distressPct = Math.round((distressCount / total) * 100) || 0;
  const unaccountedPct = Math.round((unaccountedCount / total) * 100) || 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            <span className="text-xs font-extrabold text-red-600 uppercase tracking-wider">
              Live Disaster Operations
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight mt-1">
            Community Status & Incident Command
          </h1>
          <p className="text-sm font-medium text-[#567C8D] mt-1">
            Real-time citizen safety telemetry for {activeDisaster?.title || 'Active Disaster'}.
          </p>
        </div>

        {/* Actions (Citizen only) */}
        {user.role === 'CITIZEN' && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowVoiceModal(true)}
              className="px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-md cursor-pointer"
            >
              <Mic className="w-4 h-4 text-white" />
              <span>Talk to STRIDE</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('safe')}
              className="px-5 py-3 rounded-2xl bg-[#DC2626] hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-red-600/20 cursor-pointer animate-pulse"
            >
              <LifeBuoy className="w-4 h-4 text-white" />
              <span>Report Safety / Request SOS</span>
            </button>
          </div>
        )}
      </div>

      {/* CITIZEN VOICE HERO BANNER */}
      {user.role === 'CITIZEN' && (
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-[#2F4156] via-[#243445] to-[#1e2b3a] text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-5">
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
                  LIVE AI
                </span>
              </div>
              <p className="text-xs text-[#C8D9E6] mt-1 max-w-xl leading-relaxed">
                In an emergency, click <strong>"Talk to STRIDE"</strong> and speak naturally. The AI analyzes your distress situation, extracts verified factual details, triggers rapid rescue dispatch, and provides immediate guidance.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowVoiceModal(true)}
            className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-red-600/30 cursor-pointer self-start sm:self-auto flex-shrink-0"
          >
            <Mic className="w-4 h-4" />
            <span>Talk to STRIDE</span>
          </button>
        </div>
      )}

      {/* 3 LARGE CLEAN COMMUNITY STATUS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: CONFIRMED SAFE (Green) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-200 shadow-sm hover:shadow-md transition relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              {safePct}% of population
            </span>
          </div>

          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            Confirmed Safe
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-bold font-['Space_Grotesk',sans-serif] text-emerald-700">
              {safeCount}
            </span>
            <span className="text-xs font-semibold text-[#567C8D]">
              / {total} Citizens
            </span>
          </div>

          <div className="mt-5 pt-3 border-t border-[#F5EFEB] text-[11px] text-[#567C8D] flex items-center justify-between">
            <span>Verified via app or shelter</span>
            <span className="text-emerald-700 font-bold">Secure</span>
          </div>
        </div>

        {/* Card 2: IN DISTRESS (Red) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-red-200 shadow-sm hover:shadow-md transition relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600" />
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-800 animate-pulse">
              {distressPct}% in distress
            </span>
          </div>

          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            In Distress (SOS Active)
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-bold font-['Space_Grotesk',sans-serif] text-red-600">
              {distressCount}
            </span>
            <span className="text-xs font-semibold text-[#567C8D]">
              / {total} Citizens
            </span>
          </div>

          <div className="mt-5 pt-3 border-t border-[#F5EFEB] text-[11px] text-[#567C8D] flex items-center justify-between">
            <span>Active emergency requests</span>
            <button
              type="button"
              onClick={() => onNavigateTab('rescue')}
              className="text-red-600 font-bold hover:underline flex items-center gap-1"
            >
              Dispatch <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 3: UNACCOUNTED FOR (Neutral/Gray) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#C8D9E6] shadow-sm hover:shadow-md transition relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-[#567C8D]" />
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#C8D9E6]/30 flex items-center justify-center text-[#2F4156]">
              <HelpCircle className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#567C8D]/15 text-[#2F4156]">
              {unaccountedPct}% pending
            </span>
          </div>

          <p className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
            Unaccounted For
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              {unaccountedCount}
            </span>
            <span className="text-xs font-semibold text-[#567C8D]">
              / {total} Citizens
            </span>
          </div>

          <div className="mt-5 pt-3 border-t border-[#F5EFEB] text-[11px] text-[#567C8D] flex items-center justify-between">
            <span>Awaiting status check-in</span>
            <span className="text-[#567C8D] font-bold">Unchecked</span>
          </div>
        </div>
      </div>

      {/* Citizen Current Weather — Directly Below Community Section */}
      {user.role === 'CITIZEN' && (
        <LiveWeatherCard />
      )}

      {/* RESCUE OPERATIONS PIPELINE */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#C8D9E6] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#F5EFEB]">
          <div>
            <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              Live Rescue Operation Pipeline
            </h3>
            <p className="text-xs text-[#567C8D]">
              Real-time assignment stages for active distress calls.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('rescue')}
            className="text-xs font-bold text-[#2F4156] hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Open Rescue Dashboard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {/* Pending */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
            <span className="text-[10px] uppercase font-extrabold text-amber-800 tracking-wider">
              Pending Queue
            </span>
            <p className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-amber-900 mt-1">
              {status?.emergencyRequests?.pending || 0}
            </p>
            <span className="text-[11px] text-amber-700 mt-1 block">
              Awaiting team assignment
            </span>
          </div>

          {/* Team Assigned */}
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
            <span className="text-[10px] uppercase font-extrabold text-blue-800 tracking-wider">
              Team Assigned
            </span>
            <p className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-blue-900 mt-1">
              {status?.emergencyRequests?.teamAssigned || 0}
            </p>
            <span className="text-[11px] text-blue-700 mt-1 block">
              En route / on the way
            </span>
          </div>

          {/* Safely Rescued */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] uppercase font-extrabold text-emerald-800 tracking-wider">
              Safely Rescued
            </span>
            <p className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-emerald-900 mt-1">
              {status?.emergencyRequests?.safelyRescued || 0}
            </p>
            <span className="text-[11px] text-emerald-700 mt-1 block">
              Successfully extracted
            </span>
          </div>

          {/* Not Found */}
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200">
            <span className="text-[10px] uppercase font-extrabold text-red-800 tracking-wider">
              Not Found
            </span>
            <p className="text-2xl font-bold font-['Space_Grotesk',sans-serif] text-red-900 mt-1">
              {status?.emergencyRequests?.notFound || 0}
            </p>
            <span className="text-[11px] text-red-700 mt-1 block">
              Requires secondary sweep
            </span>
          </div>
        </div>
      </div>

      {/* Quick Navigation Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {user.role !== 'CITIZEN' && (
          <div
            onClick={() => onNavigateTab('buildings')}
            className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/70 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#C8D9E6]/30 flex items-center justify-center text-[#2F4156]">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#2F4156]">
                  Building Intelligence
                </h4>
                <p className="text-xs text-[#567C8D]">
                  Inspect safe, in distress, and unaccounted counts for each structure.
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-[#567C8D]" />
          </div>
        )}

        <div
          onClick={() => onNavigateTab('shelters')}
          className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/70 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-700">
              <Tent className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#2F4156]">
                Shelter Information
              </h4>
              <p className="text-xs text-[#567C8D]">
                Find designated emergency shelters, live occupancy, and available capacity.
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-emerald-700" />
        </div>

        <div
          onClick={() => onNavigateTab('hospitals')}
          className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/70 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#2F4156]">
                Hospital Information
              </h4>
              <p className="text-xs text-[#567C8D]">
                Locate emergency rooms, simulated bed capacities, and casualty intake facilities.
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-red-600" />
        </div>

        <div
          onClick={() => onNavigateTab('maps')}
          className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/70 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#2F4156]">
                Live Emergency Map
              </h4>
              <p className="text-xs text-[#567C8D]">
                View pulsing distress beacons, priority scores, and rescue teams.
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-blue-600" />
        </div>
      </div>

      {/* Voice Emergency Assistant Modal */}
      <VoiceEmergencyAssistant
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        activeDisaster={activeDisaster}
      />
    </div>
  );
};
