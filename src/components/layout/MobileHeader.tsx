import React, { useState } from 'react';
import { Menu, Bell, AlertTriangle } from 'lucide-react';
import { StrideLogo } from '../common/StrideLogo';
import { LanguageSelectorDropdown } from '../common/LanguageSelectorDropdown';
import { DisasterEvent } from '../../services/disasterService';
import { NotificationItem } from '../../services/notificationService';
import { DisasterMode } from './DashboardLayout';

export interface MobileHeaderProps {
  mode: DisasterMode;
  activeDisaster: DisasterEvent | null;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onOpenDrawer: () => void;
  isDark?: boolean;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  mode,
  activeDisaster,
  notifications,
  unreadCount,
  onMarkRead,
  onOpenDrawer,
  isDark = false,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <>
      <header
        id="mobile-header"
        data-testid="mobile-header"
        className={`lg:hidden sticky top-0 z-30 h-[52px] px-3 flex items-center justify-between border-b transition-colors duration-200 select-none ${
          isDark
            ? 'bg-[#0B132B]/95 border-[#1C2541] text-slate-100 backdrop-blur-md'
            : 'bg-white/95 border-[#C8D9E6]/80 text-[#2F4156] backdrop-blur-md'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        {/* Left: Hamburger Menu Trigger + Brand Logo */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            id="mobile-hamburger-btn"
            data-testid="mobile-hamburger-btn"
            onClick={onOpenDrawer}
            aria-label="Open navigation menu"
            className={`min-w-[44px] min-h-[44px] p-2.5 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? 'text-slate-200 hover:text-white hover:bg-[#1C2541]'
                : 'text-[#2F4156] hover:bg-[#F5EFEB]'
            }`}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            <StrideLogo size="sm" showSubtitle={false} light={isDark} />
          </div>
        </div>

        {/* Center / Inline: Active Disaster Alert Status Pill */}
        {activeDisaster ? (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border transition-all max-w-[130px] sm:max-w-[180px] truncate ${
              activeDisaster.alertLevel === 'RED'
                ? 'bg-red-500/15 border-red-500/40 text-red-700'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-800'
            }`}
            title={`[${activeDisaster.alertLevel}] ${activeDisaster.title}`}
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                activeDisaster.alertLevel === 'RED'
                  ? 'bg-red-600 animate-ping'
                  : 'bg-amber-500'
              }`}
            />
            <span className="truncate">{activeDisaster.title}</span>
          </div>
        ) : null}

        {/* Right: Language Selector + Notification Bell */}
        <div className="flex items-center gap-1">
          {/* Multilingual Selector */}
          <LanguageSelectorDropdown
            isDark={isDark}
            id="mobile-header-language-selector"
            className="scale-90 origin-right"
          />

          {/* Notification Bell */}
          <div className="relative">
            <button
              type="button"
              id="mobile-notification-bell"
              data-testid="mobile-notification-bell"
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              className={`min-w-[44px] min-h-[44px] p-2.5 rounded-xl relative flex items-center justify-center transition-colors cursor-pointer ${
                isDark
                  ? 'text-slate-200 hover:bg-[#1C2541]'
                  : 'text-[#2F4156] hover:bg-[#F5EFEB]'
              }`}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Notifications Overlay / Dropdown for Mobile */}
      {showNotifications && (
        <div
          id="mobile-notifications-panel"
          data-testid="mobile-notifications-panel"
          className="fixed inset-x-3 top-[56px] z-50 rounded-2xl shadow-2xl p-4 border max-h-[75vh] flex flex-col lg:hidden animate-fade-in"
          style={{
            backgroundColor: isDark ? '#1C2541' : '#FFFFFF',
            borderColor: isDark ? '#334155' : '#C8D9E6',
            color: isDark ? '#E2E8F0' : '#2F4156',
          }}
        >
          <div
            className={`flex items-center justify-between pb-3 border-b ${
              isDark ? 'border-[#334155]' : 'border-[#F5EFEB]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider">
                Disaster Intelligence Alerts
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  {unreadCount} New
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              className="text-xs font-bold px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              Close
            </button>
          </div>

          <div className="overflow-y-auto mt-2 space-y-2 flex-1 max-h-[60vh]">
            {notifications.length === 0 ? (
              <p className="text-xs text-center py-6 text-slate-400">
                No active notifications
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-xl border text-xs transition ${
                    n.status === 'UNREAD'
                      ? isDark
                        ? 'bg-[#0B132B]/90 border-blue-800/60 text-slate-200'
                        : 'bg-[#C8D9E6]/25 border-[#567C8D]/40 text-[#2F4156]'
                      : isDark
                      ? 'bg-[#1C2541] border-[#334155] text-slate-400'
                      : 'bg-white border-[#F5EFEB] text-[#567C8D]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[10px] uppercase text-amber-700">
                      {n.type.replace('_', ' ')}
                    </span>
                    {n.status === 'UNREAD' && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(n.id)}
                        className="text-[10px] font-semibold underline text-blue-600 hover:text-blue-800"
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
    </>
  );
};
