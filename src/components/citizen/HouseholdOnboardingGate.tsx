import React from 'react';
import { User } from '../../services/authService.ts';
import { DisasterEvent } from '../../services/disasterService.ts';
import { HouseholdMembersView } from '../before/HouseholdMembersView.tsx';
import { StrideLogo } from '../common/StrideLogo.tsx';
import { LanguageSelectorDropdown } from '../common/LanguageSelectorDropdown.tsx';
import {
  ShieldAlert,
  LogOut,
  Users,
  MapPin,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface HouseholdOnboardingGateProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onOnboardingComplete: () => void;
  onLogout: () => void;
}

export const HouseholdOnboardingGate: React.FC<HouseholdOnboardingGateProps> = ({
  user,
  activeDisaster,
  onOnboardingComplete,
  onLogout,
}) => {
  return (
    <div className="min-h-screen bg-[#F5EFEB] flex flex-col text-[#2F4156]">
      {/* Top Professional Header */}
      <header className="h-16 bg-white border-b border-[#C8D9E6]/70 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <StrideLogo size="sm" showSubtitle={true} />
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
            <Lock className="w-3 h-3 text-amber-600" />
            Mandatory Citizen Onboarding
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* User Profile Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F5EFEB] border border-[#C8D9E6] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[#2F4156]">{user.name}</span>
            <span className="text-[10px] text-[#567C8D]">
              ({user.testIdentityNumber ? `Aadhaar: ${user.testIdentityNumber}` : 'Citizen'})
            </span>
          </div>

          <LanguageSelectorDropdown id="onboarding-lang-selector" />

          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#C8D9E6] hover:bg-red-50 hover:text-red-700 text-xs font-semibold text-[#567C8D] transition cursor-pointer"
            title="Sign out of STRIDE"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Step Progression & Instructions Banner */}
        <div className="bg-white rounded-3xl p-6 border border-amber-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 flex-shrink-0 shadow-xs">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    Action Required
                  </span>
                  <span className="text-xs font-bold text-[#567C8D]">
                    Municipal Disaster Preparedness Requirement
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] mt-1">
                  Complete Your Household Information & Safety Plan
                </h2>
                <p className="text-xs sm:text-sm text-[#567C8D] mt-1 max-w-3xl leading-relaxed">
                  To protect civilian lives and coordinate rapid rescue operations, municipal protocols require all citizens to register their household members and designate pre-planned emergency locations before accessing live STRIDE features.
                </p>
              </div>
            </div>

            {/* Quick 3-step guide */}
            <div className="grid grid-cols-3 gap-2 bg-[#F5EFEB]/80 p-3 rounded-2xl border border-[#C8D9E6]/60 text-center text-xs font-semibold">
              <div className="p-2">
                <div className="w-6 h-6 rounded-full bg-[#2F4156] text-white mx-auto flex items-center justify-center font-bold text-[11px] mb-1">
                  1
                </div>
                <span className="text-[11px] text-[#2F4156]">Review Members</span>
              </div>
              <div className="p-2 border-x border-[#C8D9E6]">
                <div className="w-6 h-6 rounded-full bg-[#2F4156] text-white mx-auto flex items-center justify-center font-bold text-[11px] mb-1">
                  2
                </div>
                <span className="text-[11px] text-[#2F4156]">Choose Locations</span>
              </div>
              <div className="p-2">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white mx-auto flex items-center justify-center font-bold text-[11px] mb-1">
                  3
                </div>
                <span className="text-[11px] font-bold text-emerald-800">Save Plan</span>
              </div>
            </div>
          </div>
        </div>

        {/* Embedded Existing Household Form */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#C8D9E6]/80 shadow-sm">
          <HouseholdMembersView
            user={user}
            activeDisaster={activeDisaster}
            isOnboarding={true}
            onOnboardingComplete={onOnboardingComplete}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-[#567C8D] border-t border-[#C8D9E6]/50">
        STRIDE &mdash; Smart Tactical Real-time Inundation Defense & Evacuation Intelligence
      </footer>
    </div>
  );
};

export default HouseholdOnboardingGate;
