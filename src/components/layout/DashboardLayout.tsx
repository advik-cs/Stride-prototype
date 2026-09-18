import React, { useState, useEffect } from 'react';
import { StrideLogo } from '../common/StrideLogo.tsx';
import { User } from '../../services/authService.ts';
import { notificationService, NotificationItem } from '../../services/notificationService.ts';
import { DisasterEvent, disasterService } from '../../services/disasterService.ts';
import { useLanguage } from '../../i18n/LanguageContext';
import { LanguageSelectorDropdown } from '../common/LanguageSelectorDropdown';
import {
  LayoutDashboard,
  Map as MapIcon,
  Users,
  Tent,
  CheckCircle2,
  Building2,
  AlertOctagon,
  LifeBuoy,
  Radio,
  Bell,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  ChevronRight,
  Waves,
  CloudRain,
  BarChart3,
} from 'lucide-react';

export type DisasterMode = 'BEFORE' | 'DURING' | 'FLOODX';

export type BeforeTab =
  | 'dashboard'
  | 'essentials'
  | 'map'
  | 'household'
  | 'shelters'
  | 'hospitals'
  | 'reconfirmation'
  | 'occupancy'
  | 'threats'
  | 'weather';

export type DuringTab =
  | 'dashboard'
  | 'safe'
  | 'buildings'
  | 'shelters'
  | 'hospitals'
  | 'maps'
  | 'rescue'
  | 'occupancy'
  | 'weather'
  | 'analytics';

interface DashboardLayoutProps {
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
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
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
  children,
}) => {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data);
    } catch {
      // Non-blocking
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: 'READ' as const } : n))
      );
    } catch {
      // Non-blocking
    }
  };

  const unreadCount = notifications.filter((n) => n.status === 'UNREAD').length;

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

  const isDarkSidebar = mode === 'FLOODX' && user.role !== 'CITIZEN';

  return (
    <div className={`min-h-screen flex transition-colors duration-200 ${isDarkSidebar ? 'bg-[#0B132B]' : 'bg-[#F5EFEB]'}`}>
      {/* ALWAYS-VISIBLE LEFT SIDEBAR (Not collapsed on desktop) */}
      <aside
        className={`w-64 xl:w-72 flex flex-col flex-shrink-0 z-30 sticky top-0 h-screen overflow-y-auto transition-colors duration-200 ${
          isDarkSidebar
            ? 'bg-[#0B132B] border-r border-[#1C2541] text-slate-200'
            : 'bg-white border-r border-[#C8D9E6]/60 text-[#2F4156]'
        }`}
      >
        {/* Sidebar Header with STRIDE Branding */}
        <div className={`p-5 border-b transition-colors duration-200 ${isDarkSidebar ? 'border-[#1C2541]' : 'border-[#F5EFEB]'}`}>
          <StrideLogo size="sm" showSubtitle={true} light={isDarkSidebar} />
        </div>

        {/* Mode Selector Pill inside Sidebar */}
        <div className={`p-4 border-b transition-colors duration-200 ${isDarkSidebar ? 'border-[#1C2541]' : 'border-[#F5EFEB]'}`}>
          <div
            className={`p-1 rounded-xl transition-colors duration-200 ${
              user.role === 'CITIZEN' ? 'grid grid-cols-2 gap-1' : 'grid grid-cols-3 gap-1'
            } ${isDarkSidebar ? 'bg-[#1C2541] border border-[#334155]/60' : 'bg-[#F5EFEB]'}`}
          >
            <button
              id="sidebar-mode-before"
              type="button"
              onClick={() => onSwitchMode('BEFORE')}
              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                mode === 'BEFORE'
                  ? 'bg-white text-[#2F4156] shadow-sm'
                  : isDarkSidebar
                  ? 'text-slate-300 hover:text-white hover:bg-white/10'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <span>{t('common.before')}</span>
            </button>
            <button
              id="sidebar-mode-during"
              type="button"
              onClick={() => onSwitchMode('DURING')}
              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                mode === 'DURING'
                  ? 'bg-[#DC2626] text-white shadow-sm'
                  : isDarkSidebar
                  ? 'text-slate-300 hover:text-red-400 hover:bg-white/10'
                  : 'text-[#567C8D] hover:text-[#DC2626]'
              }`}
            >
              <span>{t('common.during')}</span>
            </button>
            {user.role !== 'CITIZEN' && (
              <button
                id="sidebar-mode-floodx"
                type="button"
                onClick={() => onSwitchMode('FLOODX')}
                className={`py-1.5 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  mode === 'FLOODX'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/50'
                    : isDarkSidebar
                    ? 'text-slate-300 hover:text-blue-400 hover:bg-white/10'
                    : 'text-blue-700 hover:text-blue-900'
                }`}
              >
                <span>{t('common.floodx')}</span>
              </button>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] font-semibold">
            <span className={isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}>{t('common.currentMode')}</span>
            <span
              className={`px-2 py-0.5 rounded-full font-bold ${
                mode === 'BEFORE'
                  ? isDarkSidebar
                    ? 'bg-slate-800 text-slate-200'
                    : 'bg-[#C8D9E6]/40 text-[#2F4156]'
                  : mode === 'DURING'
                  ? 'bg-red-100 text-[#DC2626]'
                  : isDarkSidebar
                  ? 'bg-blue-950/90 text-blue-300 border border-blue-800/60'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {mode === 'BEFORE' ? t('common.preparedness') : mode === 'DURING' ? t('common.liveEmergency') : t('common.satelliteAI')}
            </span>
          </div>
        </div>

        {/* Navigation Items based on mode */}
        <nav className="flex-1 p-3 space-y-1">
          <div className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`}>
            {mode === 'BEFORE'
              ? t('common.beforeSystem')
              : mode === 'DURING'
              ? t('common.duringSystem')
              : t('common.satelliteAISystem')}
          </div>

          {mode === 'BEFORE' &&
            beforeNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeBeforeTab === item.id;
                const isThreats = item.id === 'threats';
                return (
                  <button
                    key={item.id}
                    id={`sidebar-nav-${item.id}`}
                    type="button"
                    onClick={() => onSelectBeforeTab(item.id as BeforeTab)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                      isThreats
                        ? isActive
                          ? 'bg-red-700 hover:bg-red-800 text-white shadow-md ring-2 ring-red-300 font-bold'
                          : 'bg-red-600 hover:bg-red-700 text-white shadow-sm font-bold'
                        : isActive
                        ? 'bg-[#2F4156] text-white shadow-sm'
                        : 'text-[#2F4156] hover:bg-[#F5EFEB] hover:text-[#2F4156]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 ${
                          isThreats
                            ? 'text-white'
                            : isActive
                            ? 'text-[#C8D9E6]'
                            : 'text-[#567C8D]'
                        }`}
                      />
                      <span className={isThreats ? 'font-bold' : ''}>{item.label}</span>
                    </div>
                    {isThreats ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <ChevronRight className="w-3.5 h-3.5 text-white" />
                      </span>
                    ) : (
                      isActive && <ChevronRight className="w-3.5 h-3.5 text-[#C8D9E6]" />
                    )}
                  </button>
                );
              })}

          {mode === 'DURING' &&
            duringNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeDuringTab === item.id;
              const isAnalytics = item.id === 'analytics';
              return (
                <button
                  key={item.id}
                  id={`sidebar-nav-${item.id}`}
                  type="button"
                  onClick={() => onSelectDuringTab(item.id as DuringTab)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isActive
                      ? 'bg-[#DC2626] text-white shadow-sm'
                      : 'text-[#2F4156] hover:bg-[#F5EFEB] hover:text-[#2F4156]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? 'text-white' : 'text-[#567C8D]'
                      }`}
                    />
                    <span className="flex items-center gap-1.5">
                      <span>{item.label}</span>
                      {isAnalytics && (
                        <span
                          className="relative flex h-2 w-2 flex-shrink-0"
                          title="Live"
                          aria-label="Live"
                        >
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                              isActive ? 'bg-white opacity-75' : 'bg-red-400 opacity-75'
                            }`}
                          />
                          <span
                            className={`relative inline-flex rounded-full h-2 w-2 ${
                              isActive ? 'bg-white' : 'bg-red-600'
                            }`}
                          />
                        </span>
                      )}
                    </span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-white" />}
                </button>
              );
            })}

          {mode === 'FLOODX' && (
            <div className="space-y-3 pt-1">
              <div
                className={`p-3 rounded-xl border text-xs ${
                  isDarkSidebar
                    ? 'bg-[#1C2541]/90 border-blue-900/60 text-slate-300'
                    : 'bg-blue-50/80 border-blue-200/80 text-[#2F4156]'
                }`}
              >
                <div className={`flex items-center gap-1.5 font-extrabold mb-1 ${isDarkSidebar ? 'text-blue-400' : 'text-blue-700'}`}>
                  <Waves className="w-4 h-4 text-blue-500 animate-pulse" />
                  <span>FLOOD-X System</span>
                </div>
                <p className={`text-[11px] leading-relaxed ${isDarkSidebar ? 'text-slate-300' : 'text-[#567C8D]'}`}>
                  Sentinel-1 SAR radar imagery, automated drone flood detection, and AI situational reports.
                </p>
              </div>

              <div className={`px-1 text-[10px] font-extrabold uppercase tracking-wider ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`}>
                {t('common.platformNav')}
              </div>
              <button
                type="button"
                id="sidebar-floodx-back-before"
                onClick={() => onSwitchMode('BEFORE')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  isDarkSidebar
                    ? 'text-slate-200 hover:bg-[#1C2541] hover:text-white border border-[#1C2541]'
                    : 'text-[#2F4156] hover:bg-[#F5EFEB]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <LayoutDashboard className={`w-4 h-4 ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`} />
                  <span>{t('common.backBefore')}</span>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`} />
              </button>
              <button
                type="button"
                id="sidebar-floodx-back-during"
                onClick={() => onSwitchMode('DURING')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  isDarkSidebar
                    ? 'text-slate-200 hover:bg-[#1C2541] hover:text-white border border-[#1C2541]'
                    : 'text-[#2F4156] hover:bg-[#F5EFEB]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#DC2626]" />
                  <span>{t('common.backDuring')}</span>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`} />
              </button>
            </div>
          )}
        </nav>

        {/* User profile footer */}
        <div
          className={`p-4 border-t flex items-center justify-between transition-colors duration-200 ${
            isDarkSidebar
              ? 'border-[#1C2541] bg-[#080E21]'
              : 'border-[#F5EFEB]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                isDarkSidebar ? 'bg-blue-600 text-white' : 'bg-[#2F4156] text-white'
              }`}
            >
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={`text-xs font-bold truncate ${isDarkSidebar ? 'text-white' : 'text-[#2F4156]'}`}>
                  {user.name}
                </p>
                <span
                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wider ${
                    user.role === 'AUTHORITY'
                      ? isDarkSidebar
                        ? 'bg-blue-900/70 text-blue-200 border border-blue-700/50'
                        : 'bg-[#2F4156] text-white'
                      : user.role === 'RESCUER'
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#567C8D]/15 text-[#2F4156]'
                  }`}
                >
                  {user.role}
                </span>
              </div>
              <p className={`text-[10px] truncate ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`}>
                {user.role === 'CITIZEN' ? `Aadhaar: ${user.testIdentityNumber}` : `ID: ${user.testIdentityNumber}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title={t('common.logout')}
            className={`p-1.5 rounded-lg transition ${
              isDarkSidebar
                ? 'text-slate-400 hover:text-red-400 hover:bg-[#1C2541]'
                : 'text-[#567C8D] hover:text-[#DC2626] hover:bg-red-50'
            }`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header
          className={`h-16 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-20 transition-colors duration-200 ${
            isDarkSidebar
              ? 'bg-[#0B132B]/95 border-b border-[#1C2541] text-slate-200'
              : 'bg-white/95 border-b border-[#C8D9E6]/60 text-[#2F4156]'
          }`}
        >
          {/* Active Disaster Selector / Indicator */}
          <div className="flex items-center gap-3 min-w-0">
            <span className={`hidden sm:inline text-xs font-bold uppercase tracking-wide ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`}>
              {t('common.disasterEvent')}
            </span>
            {disasters.length > 0 ? (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                isDarkSidebar
                  ? 'bg-[#1C2541] border-[#334155]'
                  : 'bg-[#F5EFEB] border-[#C8D9E6]/70'
              }`}>
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                <select
                  value={activeDisaster?.id || ''}
                  onChange={(e) => {
                    const found = disasters.find((d) => d.id === e.target.value);
                    if (found) onSelectDisaster(found);
                  }}
                  className={`bg-transparent text-xs font-bold outline-none cursor-pointer pr-2 ${
                    isDarkSidebar ? 'text-white' : 'text-[#2F4156]'
                  }`}
                >
                  {disasters.map((d) => (
                    <option key={d.id} value={d.id} className={isDarkSidebar ? 'bg-[#1C2541] text-white' : ''}>
                      [{d.alertLevel}] {d.title}
                    </option>
                  ))}
                </select>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold ${
                    activeDisaster?.alertLevel === 'RED'
                      ? 'bg-red-600 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  {activeDisaster?.alertLevel}
                </span>
              </div>
            ) : (
              <span className={`text-xs ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`}>{t('common.noActiveDisasters')}</span>
            )}
          </div>

          {/* Right Header Actions: Language Selector + Notification Bell + Quick Actions */}
          <div className="flex items-center gap-3">
            {/* Multilingual Selector */}
            <LanguageSelectorDropdown isDark={isDarkSidebar} id="topbar-language-selector" />

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className={`relative p-2 rounded-xl transition ${
                  isDarkSidebar
                    ? 'text-slate-200 hover:bg-[#1C2541] border border-transparent hover:border-[#334155]'
                    : 'text-[#2F4156] hover:bg-[#F5EFEB] border border-transparent hover:border-[#C8D9E6]'
                }`}
              >
                <Bell className={`w-5 h-5 ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className={`absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl shadow-2xl p-4 z-50 border ${
                  isDarkSidebar
                    ? 'bg-[#1C2541] border-[#334155] text-slate-200'
                    : 'bg-white border-[#C8D9E6]'
                }`}>
                  <div className={`flex items-center justify-between pb-3 border-b ${
                    isDarkSidebar ? 'border-[#334155]' : 'border-[#F5EFEB]'
                  }`}>
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                      isDarkSidebar ? 'text-slate-200' : 'text-[#2F4156]'
                    }`}>
                      Disaster Intelligence Alerts
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isDarkSidebar ? 'bg-slate-700 text-slate-300' : 'bg-[#567C8D]/10 text-[#567C8D]'
                    }`}>
                      {unreadCount} New
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto mt-2 space-y-2">
                    {notifications.length === 0 ? (
                      <p className={`text-xs text-center py-4 ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`}>No notifications</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-xl border text-xs transition ${
                            n.status === 'UNREAD'
                              ? isDarkSidebar
                                ? 'bg-[#0B132B]/80 border-blue-800/60 text-slate-200'
                                : 'bg-[#C8D9E6]/20 border-[#567C8D]/30 text-[#2F4156]'
                              : isDarkSidebar
                              ? 'bg-[#1C2541] border-[#334155] text-slate-400'
                              : 'bg-white border-[#F5EFEB] text-[#567C8D]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold text-[10px] uppercase ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`}>
                              {n.type.replace('_', ' ')}
                            </span>
                            {n.status === 'UNREAD' && (
                              <button
                                type="button"
                                onClick={() => handleMarkRead(n.id)}
                                className={`text-[10px] font-semibold underline ${isDarkSidebar ? 'text-blue-400 hover:text-blue-300' : 'text-[#567C8D] hover:text-[#2F4156]'}`}
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                          <p className="text-xs font-medium leading-relaxed">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* FLOODX Navigation Button - Completely hidden from Citizen */}
            {user.role !== 'CITIZEN' && (
              <button
                id="topbar-nav-floodx"
                type="button"
                onClick={() => onSwitchMode('FLOODX')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  mode === 'FLOODX'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm ring-2 ring-blue-300'
                    : isDarkSidebar
                    ? 'bg-[#1C2541] hover:bg-[#253256] text-blue-400 border border-blue-900/60'
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/90'
                }`}
                title="Open FLOOD-X Satellite Intelligence Module"
              >
                <Waves className={`w-3.5 h-3.5 ${mode === 'FLOODX' ? 'text-white' : 'text-blue-600'}`} />
                <span>FLOODX</span>
              </button>
            )}

            {/* Mode Switch Fast Button */}
            <button
              type="button"
              onClick={() => onSwitchMode(mode === 'BEFORE' ? 'DURING' : 'BEFORE')}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                isDarkSidebar
                  ? 'border-[#334155] hover:bg-[#1C2541] text-slate-200'
                  : 'border-[#C8D9E6] hover:bg-[#F5EFEB] text-[#2F4156]'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDarkSidebar ? 'text-slate-400' : 'text-[#567C8D]'}`} />
              <span>{mode === 'FLOODX' ? 'Exit FLOODX' : `Switch to ${mode === 'BEFORE' ? 'DURING' : 'BEFORE'}`}</span>
            </button>
          </div>
        </header>

        {/* View Body */}
        <main
          className={`flex-1 overflow-x-hidden ${
            mode === 'FLOODX' ? 'p-0 overflow-hidden' : 'p-6 lg:p-8'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
