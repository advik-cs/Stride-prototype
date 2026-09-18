import React, { useState, useEffect } from 'react';
import { authService, User } from './services/authService.ts';
import { authApi } from './api/authApi.ts';
import { disasterService, DisasterEvent } from './services/disasterService.ts';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { DashboardLayout, BeforeTab, DuringTab, DisasterMode } from './components/layout/DashboardLayout.tsx';

// Before Components
import { BeforeDashboardView } from './components/before/BeforeDashboardView.tsx';
import { HouseholdMembersView } from './components/before/HouseholdMembersView.tsx';
import { ShelterSelectionView } from './components/before/ShelterSelectionView.tsx';
import { ReconfirmationView } from './components/before/ReconfirmationView.tsx';
import { ExpectedOccupancyView } from './components/before/ExpectedOccupancyView.tsx';
import { PredictedThreatsView } from './components/before/PredictedThreatsView.tsx';
import { BeforeMapView } from './components/before/BeforeMapView.tsx';
import { EssentialsView } from './components/before/EssentialsView.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';

// During Components
import { DuringDashboardView } from './components/during/DuringDashboardView.tsx';
import { AreYouSafeView } from './components/during/AreYouSafeView.tsx';
import { DuringBuildingsView } from './components/during/DuringBuildingsView.tsx';
import { DuringMapView } from './components/during/DuringMapView.tsx';
import { RescueOperationsView } from './components/during/RescueOperationsView.tsx';
import { OperationalWeatherView } from './components/common/OperationalWeatherView.tsx';
import { FloodXView } from './components/floodx/FloodXView.tsx';
import { HospitalInformationView } from './components/hospital/HospitalInformationView.tsx';

import { Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Disaster Mode & Tabs (synchronized with URL)
  const [mode, setMode] = useState<DisasterMode>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      if (p === '/floodx' || window.location.hash === '#floodx') {
        const stored = authService.getStoredUser();
        if (stored?.role === 'CITIZEN') {
          return 'BEFORE';
        }
        return 'FLOODX';
      }
      if (p === '/during' || window.location.hash === '#during') return 'DURING';
    }
    return 'BEFORE';
  });
  const [beforeTab, setBeforeTab] = useState<BeforeTab>('dashboard');
  const [duringTab, setDuringTab] = useState<DuringTab>('dashboard');

  const [disasters, setDisasters] = useState<DisasterEvent[]>([]);
  const [activeDisaster, setActiveDisaster] = useState<DisasterEvent | null>(null);

  useEffect(() => {
    // Synchronize mode with browser back/forward buttons
    const handlePopState = () => {
      const p = window.location.pathname.toLowerCase();
      if (p === '/floodx' || window.location.hash === '#floodx') {
        const stored = authService.getStoredUser();
        if (stored?.role === 'CITIZEN') {
          setMode('BEFORE');
          window.history.replaceState(null, '', '/before');
          return;
        }
        setMode('FLOODX');
      } else if (p === '/during' || window.location.hash === '#during') {
        setMode('DURING');
      } else {
        setMode('BEFORE');
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Initial check of stored user
    const user = authService.getStoredUser();
    if (user) {
      setCurrentUser(user);
      if (user.role === 'CITIZEN' && (window.location.pathname.toLowerCase() === '/floodx' || window.location.hash === '#floodx')) {
        setMode('BEFORE');
        window.history.replaceState(null, '', '/before');
      }
    }
    setAuthChecking(false);
    loadDisasters();

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Protect /floodx from citizen access: immediately redirect to /before and block FLOODX mode
  useEffect(() => {
    if (currentUser?.role === 'CITIZEN' && mode === 'FLOODX') {
      setMode('BEFORE');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/before');
      }
    }
  }, [currentUser?.role, mode]);

  // Protect buildings tab from citizen access
  useEffect(() => {
    if (currentUser?.role === 'CITIZEN' && duringTab === 'buildings') {
      setDuringTab('dashboard');
    }
  }, [currentUser?.role, duringTab]);

  // Protect household and reconfirmation tabs from non-citizen access in BEFORE mode
  useEffect(() => {
    if (currentUser?.role !== 'CITIZEN' && (beforeTab === 'household' || beforeTab === 'reconfirmation')) {
      setBeforeTab('dashboard');
    }
  }, [currentUser?.role, beforeTab]);

  // Protect safe tab from non-citizen access in DURING mode
  useEffect(() => {
    if (currentUser?.role !== 'CITIZEN' && duringTab === 'safe') {
      setDuringTab('dashboard');
    }
  }, [currentUser?.role, duringTab]);

  const loadDisasters = async () => {
    try {
      const list = await disasterService.getDisasters();
      setDisasters(list);
      if (list.length > 0) {
        setActiveDisaster(list[0]);
      }
    } catch (e) {
      console.error('Failed to load disasters:', e);
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    if (user.role === 'CITIZEN' && mode === 'FLOODX') {
      setMode('BEFORE');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/before');
      }
    }
    loadDisasters();
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
  };

  // Switch mode and update browser URL path
  const handleSwitchMode = (newMode: DisasterMode) => {
    if (currentUser?.role === 'CITIZEN' && newMode === 'FLOODX') {
      newMode = 'BEFORE';
    }
    setMode(newMode);
    const targetPath =
      newMode === 'FLOODX' ? '/floodx' : newMode === 'DURING' ? '/during' : '/before';
    if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#F5EFEB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#2F4156]" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <DashboardLayout
      user={currentUser}
      mode={mode}
      onSwitchMode={handleSwitchMode}
      onLogout={handleLogout}
      activeBeforeTab={beforeTab}
      onSelectBeforeTab={(t) => setBeforeTab(t)}
      activeDuringTab={duringTab}
      onSelectDuringTab={(t) => setDuringTab(t)}
      activeDisaster={activeDisaster}
      onSelectDisaster={(d) => setActiveDisaster(d)}
      disasters={disasters}
    >
      {/* MODE 1: BEFORE DISASTER (PREPAREDNESS) */}
      {mode === 'BEFORE' && (
        <>
          {beforeTab === 'dashboard' && (
            <BeforeDashboardView
              user={currentUser}
              activeDisaster={activeDisaster}
              onNavigateTab={(tab) => setBeforeTab(tab)}
            />
          )}

          {beforeTab === 'essentials' && currentUser.role === 'CITIZEN' && (
            <EssentialsView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {beforeTab === 'map' && (
            <ErrorBoundary fallbackTitle="Unable to load Preparedness Map Intelligence">
              <BeforeMapView
                user={currentUser}
                activeDisaster={activeDisaster}
              />
            </ErrorBoundary>
          )}

          {beforeTab === 'household' && currentUser.role === 'CITIZEN' && (
            <HouseholdMembersView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {beforeTab === 'shelters' && (
            <ShelterSelectionView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {beforeTab === 'hospitals' && (
            <HospitalInformationView
              user={currentUser}
              activeDisaster={activeDisaster}
              mode="BEFORE"
              onNavigateTab={(tab) => setBeforeTab(tab as any)}
            />
          )}

          {beforeTab === 'reconfirmation' && currentUser.role === 'CITIZEN' && (
            <ReconfirmationView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {beforeTab === 'occupancy' && currentUser.role !== 'CITIZEN' && (
            <ExpectedOccupancyView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {beforeTab === 'weather' && currentUser.role !== 'CITIZEN' && (
            <OperationalWeatherView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {beforeTab === 'threats' && (
            <PredictedThreatsView
              user={currentUser}
              activeDisaster={activeDisaster}
              disasters={disasters}
              onSelectDisaster={(d) => setActiveDisaster(d)}
              onRefreshDisasters={loadDisasters}
            />
          )}
        </>
      )}

      {/* MODE 2: DURING DISASTER (LIVE INCIDENT COMMAND & RESCUE) */}
      {mode === 'DURING' && (
        <>
          {duringTab === 'dashboard' && (
            <DuringDashboardView
              user={currentUser}
              activeDisaster={activeDisaster}
              onNavigateTab={(t) => setDuringTab(t)}
            />
          )}

          {duringTab === 'safe' && currentUser.role === 'CITIZEN' && (
            <AreYouSafeView
              user={currentUser}
              activeDisaster={activeDisaster}
              onNavigateTab={(t) => setDuringTab(t)}
            />
          )}

          {duringTab === 'buildings' && currentUser.role !== 'CITIZEN' && (
            <DuringBuildingsView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {duringTab === 'shelters' && (
            <ShelterSelectionView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {duringTab === 'hospitals' && (
            <HospitalInformationView
              user={currentUser}
              activeDisaster={activeDisaster}
              mode="DURING"
              onNavigateTab={(tab) => setDuringTab(tab as any)}
            />
          )}

          {duringTab === 'maps' && (
            <ErrorBoundary fallbackTitle="Unable to load Incident Operations Map">
              <DuringMapView
                user={currentUser}
                activeDisaster={activeDisaster}
                onNavigateTab={(t) => setDuringTab(t)}
              />
            </ErrorBoundary>
          )}

          {duringTab === 'rescue' && (
            <RescueOperationsView
              user={currentUser}
              activeDisaster={activeDisaster}
              onNavigateTab={(t) => setDuringTab(t)}
            />
          )}

          {duringTab === 'occupancy' && currentUser.role !== 'CITIZEN' && (
            <ExpectedOccupancyView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}

          {duringTab === 'weather' && currentUser.role !== 'CITIZEN' && (
            <OperationalWeatherView
              user={currentUser}
              activeDisaster={activeDisaster}
            />
          )}
        </>
      )}

      {/* MODE 3: FLOODX SATELLITE INTELLIGENCE (EMBEDDED) */}
      {mode === 'FLOODX' && currentUser.role !== 'CITIZEN' && (
        <FloodXView
          onReturnToMode={(targetMode) => handleSwitchMode(targetMode)}
        />
      )}
    </DashboardLayout>
  );
}
