import React, { useEffect, useRef } from 'react';
import {
  X,
  LayoutDashboard,
  Map as MapIcon,
  Tent,
  CheckCircle2,
  Building2,
  AlertOctagon,
  LifeBuoy,
  Radio,
  LogOut,
  ShieldCheck,
  ChevronRight,
  Waves,
  CloudRain,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { StrideLogo } from '../common/StrideLogo';
import { User } from '../../services/authService';
import { DisasterEvent } from '../../services/disasterService';
import { BeforeTab, DuringTab, DisasterMode } from './DashboardLayout';
import { useLanguage } from '../../i18n/LanguageContext';

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  mode: DisasterMode;
  onSwitchMode: (newMode: DisasterMode) => void;
  onLogout: () => void;
  activeBeforeTab: BeforeTab;
  onSelectBeforeTab: (tab: BeforeTab) => void;
  activeDuringTab: DuringTab;
  onSelectDuringTab: (tab: DuringTab) => void;
  onSwitchRole?: (newRole: 'CITIZEN' | 'AUTHORITY' | 'RESCUER') => void;
  activeDisaster: DisasterEvent | null;
  onSelectDisaster: (disaster: DisasterEvent) => void;
  disasters: DisasterEvent[];
  isDark?: boolean;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  user,
  mode,
  onSwitchMode,
  onLogout,
  activeBeforeTab,
  onSelectBeforeTab,
  activeDuringTab,
  onSelectDuringTab,
  onSwitchRole,
  activeDisaster,
  onSelectDisaster,
  disasters,
  isDark = false,
}) => {
  const { t } = useLanguage();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const beforeNavItems = [
    { id: 'dashboard', label: t('navigation.dashboard'), icon: LayoutDashboard },
    ...(user.role !== 'CITIZEN' ? [{ id: 'weather', label: t('navigation.operationalWeather') || 'Operational Weather', icon: CloudRain }] : []),
    ...(user.role === 'CITIZEN' ? [{ id: 'essentials', label: t('navigation.essentials'), icon: ShieldCheck }] : []),
    { id: 'map', label: t('navigation.map'), icon: MapIcon },
    { id: 'shelters', label: t('navigation.shelterInfo'), icon: Tent },
    { id: 'hospitals', label: t('navigation.hospitalInfo') || 'Hospital Information', icon: Building2 },
    ...(user.role === 'CITIZEN' ? [{ id: 'reconfirmation', label: t('navigation.reconfirmation'), icon: CheckCircle2 }] : []),
    ...(user.role !== 'CITIZEN' ? [{ id: 'occupancy', label: t('navigation.occupancy'), icon: Building2 }] : []),
    { id: 'threats', label: t('navigation.threats'), icon: AlertOctagon },
  ];

  const duringNavItems = [
    { id: 'dashboard', label: t('navigation.duringDashboard'), icon: LayoutDashboard },
    ...(user.role !== 'CITIZEN' ? [{ id: 'weather', label: t('navigation.operationalWeather') || 'Operational Weather', icon: CloudRain }] : []),
    ...(user.role === 'CITIZEN' ? [{ id: 'safe', label: t('navigation.safe'), icon: LifeBuoy }] : []),
    ...(user.role !== 'CITIZEN' ? [{ id: 'buildings', label: t('navigation.buildings'), icon: Building2 }] : []),
    { id: 'shelters', label: t('navigation.shelterInfo'), icon: Tent },
    { id: 'hospitals', label: t('navigation.hospitalInfo') || 'Hospital Information', icon: Building2 },
    { id: 'maps', label: t('navigation.maps'), icon: MapIcon },
    { id: 'rescue', label: t('navigation.rescue'), icon: Radio },
    ...(user.role !== 'CITIZEN' ? [
      { id: 'occupancy', label: t('navigation.occupancy'), icon: Building2 },
      { id: 'analytics', label: t('navigation.liveAnalytics') || 'Live Analytics', icon: BarChart3 },
    ] : []),
  ];

  return (
    <div
      id="mobile-drawer-portal"
      data-testid="mobile-drawer-portal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex lg:hidden"
    >
      {/* Semi-transparent Backdrop with click-to-dismiss */}
      <div
        id="mobile-drawer-backdrop"
        data-testid="mobile-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
      />

      {/* Drawer Panel (slides from left) */}
      <div
        ref={drawerRef}
        id="mobile-drawer-panel"
        data-testid="mobile-drawer-panel"
        className={`relative z-10 w-[300px] max-w-[85vw] h-full flex flex-col shadow-2xl transition-transform duration-300 ease-out select-none border-r ${
          isDark
            ? 'bg-[#0B132B] border-[#1C2541] text-slate-100'
            : 'bg-white border-[#C8D9E6] text-[#2F4156]'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drawer Header: Brand + Close Button */}
        <div
          className={`p-4 border-b flex items-center justify-between flex-shrink-0 ${
            isDark ? 'border-[#1C2541]' : 'border-[#F5EFEB]'
          }`}
        >
          <StrideLogo size="sm" showSubtitle={true} light={isDark} />
          <button
            type="button"
            id="mobile-drawer-close-btn"
            data-testid="mobile-drawer-close-btn"
            onClick={onClose}
            aria-label="Close navigation drawer"
            className={`min-w-[44px] min-h-[44px] p-2.5 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? 'text-slate-400 hover:text-white hover:bg-[#1C2541]'
                : 'text-[#567C8D] hover:text-[#2F4156] hover:bg-[#F5EFEB]'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Active Disaster Event Selector */}
          <div>
            <span
              className={`text-[10px] font-extrabold uppercase tracking-wider block mb-1.5 ${
                isDark ? 'text-slate-400' : 'text-[#567C8D]'
              }`}
            >
              {t('common.disasterEvent') || 'Disaster Event'}
            </span>
            {disasters.length > 0 ? (
              <div
                className={`flex items-center gap-2 p-2 rounded-xl border ${
                  isDark ? 'bg-[#1C2541] border-[#334155]' : 'bg-[#F5EFEB] border-[#C8D9E6]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping flex-shrink-0" />
                <select
                  id="mobile-drawer-disaster-select"
                  data-testid="mobile-drawer-disaster-select"
                  aria-label="Select active disaster event"
                  value={activeDisaster?.id || ''}
                  onChange={(e) => {
                    const found = disasters.find((d) => d.id === e.target.value);
                    if (found) onSelectDisaster(found);
                  }}
                  className={`bg-transparent text-xs font-bold outline-none cursor-pointer flex-1 truncate ${
                    isDark ? 'text-white' : 'text-[#2F4156]'
                  }`}
                >
                  {disasters.map((d) => (
                    <option
                      key={d.id}
                      value={d.id}
                      className={isDark ? 'bg-[#1C2541] text-white' : 'bg-white text-[#2F4156]'}
                    >
                      [{d.alertLevel}] {d.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-[#567C8D]'}`}>
                {t('common.noActiveDisasters')}
              </p>
            )}
          </div>

          {/* Mode Switcher (BEFORE / DURING / FLOODX) */}
          <div>
            <span
              className={`text-[10px] font-extrabold uppercase tracking-wider block mb-1.5 ${
                isDark ? 'text-slate-400' : 'text-[#567C8D]'
              }`}
            >
              {t('common.currentMode') || 'System Mode'}
            </span>
            <div
              className={`grid ${
                user.role !== 'CITIZEN' ? 'grid-cols-3' : 'grid-cols-2'
              } gap-1 p-1 rounded-xl border ${
                isDark ? 'bg-[#1C2541] border-[#334155]' : 'bg-[#F5EFEB] border-[#C8D9E6]'
              }`}
            >
              <button
                type="button"
                id="mobile-drawer-mode-before"
                onClick={() => {
                  onSwitchMode('BEFORE');
                  onClose();
                }}
                className={`py-2 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  mode === 'BEFORE'
                    ? 'bg-[#2F4156] text-white shadow-xs'
                    : isDark
                    ? 'text-slate-300 hover:bg-white/10'
                    : 'text-[#2F4156] hover:bg-white/50'
                }`}
              >
                <span>{t('common.before')}</span>
              </button>

              <button
                type="button"
                id="mobile-drawer-mode-during"
                onClick={() => {
                  onSwitchMode('DURING');
                  onClose();
                }}
                className={`py-2 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  mode === 'DURING'
                    ? 'bg-[#DC2626] text-white shadow-xs'
                    : isDark
                    ? 'text-slate-300 hover:bg-white/10'
                    : 'text-[#DC2626] hover:bg-white/50'
                }`}
              >
                <span>{t('common.during')}</span>
              </button>

              {user.role !== 'CITIZEN' && (
                <button
                  type="button"
                  id="mobile-drawer-mode-floodx"
                  onClick={() => {
                    onSwitchMode('FLOODX');
                    onClose();
                  }}
                  className={`py-2 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                    mode === 'FLOODX'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : isDark
                      ? 'text-slate-300 hover:bg-white/10'
                      : 'text-blue-700 hover:bg-white/50'
                  }`}
                >
                  <Waves className="w-3.5 h-3.5" />
                  <span>{t('common.floodx')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Navigation Items for Current Mode */}
          <div>
            <span
              className={`text-[10px] font-extrabold uppercase tracking-wider block mb-1.5 ${
                isDark ? 'text-slate-400' : 'text-[#567C8D]'
              }`}
            >
              {mode === 'BEFORE'
                ? t('common.beforeSystem') || 'Preparedness Navigation'
                : mode === 'DURING'
                ? t('common.duringSystem') || 'Live Emergency Navigation'
                : 'FLOOD-X System'}
            </span>

            <nav className="space-y-1" aria-label="Drawer Navigation Links">
              {mode === 'BEFORE' &&
                beforeNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeBeforeTab === item.id;
                  const isThreats = item.id === 'threats';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      id={`mobile-drawer-nav-${item.id}`}
                      data-testid={`mobile-drawer-nav-${item.id}`}
                      onClick={() => {
                        onSelectBeforeTab(item.id as BeforeTab);
                        onClose();
                      }}
                      className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        isThreats
                          ? isActive
                            ? 'bg-red-700 text-white shadow-sm font-bold'
                            : 'bg-red-600 text-white shadow-xs font-bold'
                          : isActive
                          ? isDark
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-[#2F4156] text-white shadow-sm'
                          : isDark
                          ? 'text-slate-300 hover:bg-[#1C2541]'
                          : 'text-[#2F4156] hover:bg-[#F5EFEB]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`w-4 h-4 ${
                            isThreats
                              ? 'text-white'
                              : isActive
                              ? isDark
                                ? 'text-white'
                                : 'text-[#C8D9E6]'
                              : isDark
                              ? 'text-slate-400'
                              : 'text-[#567C8D]'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  );
                })}

              {mode === 'DURING' &&
                duringNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeDuringTab === item.id;
                  const isSafe = item.id === 'safe';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      id={`mobile-drawer-nav-${item.id}`}
                      data-testid={`mobile-drawer-nav-${item.id}`}
                      onClick={() => {
                        onSelectDuringTab(item.id as DuringTab);
                        onClose();
                      }}
                      className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        isSafe
                          ? isActive
                            ? 'bg-[#DC2626] text-white shadow-sm font-bold ring-2 ring-red-300'
                            : 'bg-red-50 text-[#DC2626] border border-red-200 font-bold hover:bg-red-100'
                          : isActive
                          ? isDark
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-[#2F4156] text-white shadow-sm'
                          : isDark
                          ? 'text-slate-300 hover:bg-[#1C2541]'
                          : 'text-[#2F4156] hover:bg-[#F5EFEB]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`w-4 h-4 ${
                            isSafe
                              ? 'text-[#DC2626]'
                              : isActive
                              ? isDark
                                ? 'text-white'
                                : 'text-[#C8D9E6]'
                              : isDark
                              ? 'text-slate-400'
                              : 'text-[#567C8D]'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  );
                })}

              {mode === 'FLOODX' && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    FLOOD-X Satellite intelligence module active.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onSwitchMode('DURING');
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Return to Emergency Command</span>
                  </button>
                </div>
              )}
            </nav>
          </div>

          {/* Role Switcher (Evaluation / Demo Mode) */}
          {onSwitchRole && (
            <div className="pt-2 border-t border-dashed border-slate-300/40">
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider block mb-1.5 ${
                  isDark ? 'text-slate-400' : 'text-[#567C8D]'
                }`}
              >
                Evaluation Role Switcher
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(['CITIZEN', 'AUTHORITY', 'RESCUER'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    id={`mobile-drawer-role-${r.toLowerCase()}`}
                    onClick={() => {
                      onSwitchRole(r);
                      onClose();
                    }}
                    className={`py-1.5 px-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer text-center ${
                      user.role === r
                        ? isDark
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#2F4156] text-white shadow-xs'
                        : isDark
                        ? 'bg-[#1C2541] text-slate-400 hover:text-white'
                        : 'bg-[#F5EFEB] text-[#567C8D] hover:text-[#2F4156]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile & Logout Footer */}
        <div
          className={`p-3 border-t flex items-center justify-between flex-shrink-0 ${
            isDark ? 'border-[#1C2541] bg-[#080E21]' : 'border-[#F5EFEB] bg-[#F5EFEB]/40'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                isDark ? 'bg-blue-600 text-white' : 'bg-[#2F4156] text-white'
              }`}
            >
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-[#2F4156]'}`}>
                  {user.name}
                </p>
                <span
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider ${
                    user.role === 'AUTHORITY'
                      ? 'bg-[#2F4156] text-white'
                      : user.role === 'RESCUER'
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#567C8D]/20 text-[#2F4156]'
                  }`}
                >
                  {user.role}
                </span>
              </div>
              <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-[#567C8D]'}`}>
                {user.role === 'CITIZEN' ? `Aadhaar: ${user.testIdentityNumber}` : `ID: ${user.testIdentityNumber}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            id="mobile-drawer-logout-btn"
            data-testid="mobile-drawer-logout-btn"
            onClick={onLogout}
            title={t('common.logout')}
            aria-label="Logout"
            className={`min-w-[44px] min-h-[44px] p-2.5 rounded-xl flex items-center justify-center transition cursor-pointer ${
              isDark
                ? 'text-slate-400 hover:text-red-400 hover:bg-[#1C2541]'
                : 'text-[#567C8D] hover:text-[#DC2626] hover:bg-red-50'
            }`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
