import React from 'react';
import {
  LayoutDashboard,
  Tent,
  Map as MapIcon,
  ShieldCheck,
  Menu,
  LifeBuoy,
  Building2,
  AlertOctagon,
  Radio,
  BarChart3,
  CloudRain,
  Cross,
} from 'lucide-react';
import { User } from '../../services/authService';
import { BeforeTab, DuringTab, DisasterMode } from './DashboardLayout';
import { useLanguage } from '../../i18n/LanguageContext';

export interface MobileBottomNavProps {
  user: User;
  mode: DisasterMode;
  activeBeforeTab: BeforeTab;
  onSelectBeforeTab: (tab: BeforeTab) => void;
  activeDuringTab: DuringTab;
  onSelectDuringTab: (tab: DuringTab) => void;
  onOpenDrawer: () => void;
  isDark?: boolean;
}

interface BottomNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isSosCenter?: boolean;
  isMore?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  user,
  mode,
  activeBeforeTab,
  onSelectBeforeTab,
  activeDuringTab,
  onSelectDuringTab,
  onOpenDrawer,
  isDark = false,
}) => {
  const { t } = useLanguage();

  // If in FLOODX mode, render a simplified navigation bar with Exit and More
  if (mode === 'FLOODX') {
    return (
      <nav
        id="mobile-bottom-nav"
        data-testid="mobile-bottom-nav"
        aria-label="Mobile Navigation Bar"
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden h-[60px] bg-[#0B132B]/95 border-t border-[#1C2541] backdrop-blur-md flex items-center justify-around px-4 select-none"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <button
          type="button"
          onClick={onOpenDrawer}
          id="mobile-nav-more"
          data-testid="mobile-nav-more"
          aria-label="Open full menu"
          className="min-h-[48px] px-6 py-1.5 flex flex-col items-center justify-center text-slate-300 hover:text-white"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold">Menu</span>
        </button>
      </nav>
    );
  }

  // Derive role-specific and mode-specific items
  let navItems: BottomNavItem[] = [];

  if (user.role === 'CITIZEN') {
    if (mode === 'BEFORE') {
      navItems = [
        { id: 'dashboard', label: t('navigation.dashboard') || 'Home', icon: LayoutDashboard },
        { id: 'shelters', label: t('navigation.shelterInfo') || 'Shelters', icon: Tent },
        { id: 'map', label: t('navigation.map') || 'Map', icon: MapIcon },
        { id: 'essentials', label: t('navigation.essentials') || 'Essentials', icon: ShieldCheck },
        { id: 'more', label: 'More', icon: Menu, isMore: true },
      ];
    } else {
      // DURING Mode: Center slot reserved for prominent SOS action
      navItems = [
        { id: 'dashboard', label: t('navigation.duringDashboard') || 'Home', icon: LayoutDashboard },
        { id: 'shelters', label: t('navigation.shelterInfo') || 'Shelters', icon: Tent },
        { id: 'safe', label: 'SOS', icon: LifeBuoy, isSosCenter: true },
        { id: 'maps', label: t('navigation.maps') || 'Maps', icon: MapIcon },
        { id: 'more', label: 'More', icon: Menu, isMore: true },
      ];
    }
  } else if (user.role === 'AUTHORITY') {
    if (mode === 'BEFORE') {
      navItems = [
        { id: 'dashboard', label: t('navigation.dashboard') || 'Command', icon: LayoutDashboard },
        { id: 'map', label: t('navigation.map') || 'Map', icon: MapIcon },
        { id: 'occupancy', label: t('navigation.occupancy') || 'Occupancy', icon: Building2 },
        { id: 'threats', label: t('navigation.threats') || 'Threats', icon: AlertOctagon },
        { id: 'more', label: 'More', icon: Menu, isMore: true },
      ];
    } else {
      navItems = [
        { id: 'dashboard', label: t('navigation.duringDashboard') || 'Command', icon: LayoutDashboard },
        { id: 'rescue', label: t('navigation.rescue') || 'Rescue', icon: Radio },
        { id: 'maps', label: t('navigation.maps') || 'Maps', icon: MapIcon },
        { id: 'analytics', label: t('navigation.liveAnalytics') || 'Analytics', icon: BarChart3 },
        { id: 'more', label: 'More', icon: Menu, isMore: true },
      ];
    }
  } else {
    // RESCUER
    if (mode === 'BEFORE') {
      navItems = [
        { id: 'dashboard', label: t('navigation.dashboard') || 'Field Hub', icon: LayoutDashboard },
        { id: 'map', label: t('navigation.map') || 'Map', icon: MapIcon },
        { id: 'shelters', label: t('navigation.shelterInfo') || 'Shelters', icon: Tent },
        { id: 'weather', label: t('navigation.operationalWeather') || 'Weather', icon: CloudRain },
        { id: 'more', label: 'More', icon: Menu, isMore: true },
      ];
    } else {
      navItems = [
        { id: 'rescue', label: t('navigation.rescue') || 'Missions', icon: Radio },
        { id: 'maps', label: t('navigation.maps') || 'Map', icon: MapIcon },
        { id: 'buildings', label: t('navigation.buildings') || 'Buildings', icon: Building2 },
        { id: 'hospitals', label: t('navigation.hospitalInfo') || 'Hospitals', icon: Cross },
        { id: 'more', label: 'More', icon: Menu, isMore: true },
      ];
    }
  }

  const activeTabId = mode === 'BEFORE' ? activeBeforeTab : activeDuringTab;

  return (
    <nav
      id="mobile-bottom-nav"
      data-testid="mobile-bottom-nav"
      aria-label="Mobile Bottom Navigation"
      className={`fixed bottom-0 inset-x-0 z-40 lg:hidden border-t backdrop-blur-md select-none transition-colors duration-200 ${
        isDark
          ? 'bg-[#0B132B]/95 border-[#1C2541] text-slate-300'
          : 'bg-white/95 border-[#C8D9E6]/80 text-[#2F4156]'
      }`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="h-[60px] grid grid-cols-5 items-stretch px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = !item.isMore && activeTabId === item.id;

          // Elevated Center SOS Slot in Citizen During mode
          if (item.isSosCenter) {
            return (
              <div key={item.id} className="flex items-center justify-center relative">
                <button
                  type="button"
                  id="mobile-nav-sos"
                  data-testid="mobile-nav-sos"
                  onClick={() => onSelectDuringTab('safe')}
                  aria-label="Emergency SOS Action"
                  className={`-mt-5 w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all duration-200 shadow-lg cursor-pointer ${
                    isActive
                      ? 'bg-red-600 text-white ring-4 ring-red-200 scale-105'
                      : 'bg-red-600 hover:bg-red-700 text-white ring-2 ring-white/80 active:scale-95'
                  }`}
                >
                  <LifeBuoy className="w-6 h-6 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-tight -mt-0.5">
                    SOS
                  </span>
                </button>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              id={`mobile-nav-${item.id}`}
              data-testid={`mobile-nav-${item.id}`}
              onClick={() => {
                if (item.isMore) {
                  onOpenDrawer();
                } else if (mode === 'BEFORE') {
                  onSelectBeforeTab(item.id as BeforeTab);
                } else {
                  onSelectDuringTab(item.id as DuringTab);
                }
              }}
              aria-label={item.label}
              className={`min-h-[48px] py-1 flex flex-col items-center justify-center transition-colors cursor-pointer ${
                isActive
                  ? isDark
                    ? 'text-blue-400 font-bold'
                    : 'text-[#2F4156] font-bold'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-[#567C8D] hover:text-[#2F4156]'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110' : ''
                  }`}
                />
                {isActive && (
                  <span
                    className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                      isDark ? 'bg-blue-400' : 'bg-[#2F4156]'
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-[10px] mt-1 leading-none truncate max-w-[56px] ${
                  isActive ? 'font-black' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
