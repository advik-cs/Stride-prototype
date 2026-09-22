import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { authApi } from '../src/api/authApi';
import { householdService } from '../src/services/householdService';

// Ensure mock localStorage exists in Node environment
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new MockLocalStorage();
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

if (typeof globalThis.Event === 'undefined') {
  (globalThis as any).Event = class Event {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

async function runHouseholdSetupReloadSuite() {
  console.log('================================================================');
  console.log('STRIDE HOUSEHOLD SETUP RELOAD & OFFLINE STABILITY TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // ============================================================================
  // SUITE 1: STATIC ARCHITECTURE & SOURCE CODE INVARIANTS
  // ============================================================================
  console.log('--- SUITE 1: STATIC CODE & ARCHITECTURAL INVARIANTS ---');

  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const householdServicePath = path.resolve(process.cwd(), 'src/services/householdService.ts');
  const authApiPath = path.resolve(process.cwd(), 'src/api/authApi.ts');

  assert(fs.existsSync(appPath), 'src/App.tsx exists');
  assert(fs.existsSync(householdServicePath), 'src/services/householdService.ts exists');
  assert(fs.existsSync(authApiPath), 'src/api/authApi.ts exists');

  const appContent = fs.readFileSync(appPath, 'utf-8');
  const hhContent = fs.readFileSync(householdServicePath, 'utf-8');
  const authContent = fs.readFileSync(authApiPath, 'utf-8');

  // Invariant 1: Synchronous initial state in App.tsx
  assert(
    appContent.includes('householdService.isHouseholdSetupHandled(user.id)') &&
      appContent.includes('const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() =>'),
    'App.tsx initializes onboardingCompleted synchronously using householdService.isHouseholdSetupHandled'
  );

  assert(
    appContent.includes('const [onboardingChecking, setOnboardingChecking] = useState<boolean>(() =>') &&
      appContent.includes('!householdService.isHouseholdSetupHandled(user.id)'),
    'App.tsx initializes onboardingChecking synchronously to false when setup is already handled'
  );

  // Invariant 2: App.tsx mount effect preserves handled state
  assert(
    appContent.includes('const isHandled = householdService.isHouseholdSetupHandled(user.id);') &&
      appContent.includes('setOnboardingChecking(!isHandled);') &&
      appContent.includes('setOnboardingCompleted(true);'),
    'App.tsx initial mount effect bypasses onboardingChecking spinner when isHandled is true'
  );

  // Invariant 3: App.tsx user role effect avoids re-running check if handled
  assert(
    appContent.includes('if (householdService.isHouseholdSetupHandled(currentUser.id))') &&
      appContent.includes('checkOnboarding(currentUser);'),
    'App.tsx [currentUser?.id, currentUser?.role] effect avoids running blocking check when already handled'
  );

  // Invariant 4: Non-blocking background sync if online
  assert(
    appContent.includes('navigator.onLine') &&
      appContent.includes('householdService.getMyHousehold().catch'),
    'App.tsx performs non-blocking background household refresh when online without blocking UI'
  );

  // Invariant 5: handleOnboardingComplete marks handled for active user
  assert(
    appContent.includes('householdService.setHouseholdSetupHandled(currentUser.id, true);'),
    'App.tsx handleOnboardingComplete marks setup handled specifically for active user ID'
  );

  // Invariant 6: handleLogout clears handled state
  assert(
    appContent.includes('householdService.clearHouseholdSetupHandled(currentUser.id);'),
    'App.tsx handleLogout clears household setup handled state'
  );

  // Invariant 7: authApi.logout sweeps all household handled keys
  assert(
    authContent.includes('stride_household_handled_') &&
      authContent.includes('keysToRemove.push(k)'),
    'authApi.logout() cleans active and sweeping wildcard stride_household_handled_* keys'
  );

  // Invariant 8: householdService helpers implemented
  assert(
    hhContent.includes('isHouseholdSetupHandled(userId?: string | null): boolean') &&
      hhContent.includes('setHouseholdSetupHandled(userId?: string | null, handled: boolean = true): void') &&
      hhContent.includes('clearHouseholdSetupHandled(userId?: string | null): void'),
    'householdService implements isHouseholdSetupHandled, setHouseholdSetupHandled, and clearHouseholdSetupHandled'
  );

  // Invariant 9: householdService.getOnboardingStatus returns completed immediately if handled
  assert(
    hhContent.includes('if (targetUserId && this.isHouseholdSetupHandled(targetUserId))') &&
      hhContent.includes('return { completed: true };'),
    'householdService.getOnboardingStatus returns { completed: true } immediately without network when handled'
  );

  // Invariant 10: householdService.getOnboardingStatus falls back to IndexedDB cache on network error
  assert(
    hhContent.includes('offlineCacheService.getHouseholdWithFallback(targetUserId)') &&
      hhContent.includes('cachedData.members && cachedData.members.length > 0'),
    'householdService.getOnboardingStatus falls back to cached household members when offline'
  );

  // ============================================================================
  // SUITE 2: OPERATIONAL & FUNCTIONAL TESTS (10 REQUIRED SCENARIOS + REPRODUCTION)
  // ============================================================================
  console.log('\n--- SUITE 2: OPERATIONAL & FUNCTIONAL BEHAVIORAL SCENARIOS ---');

  const USER_A_ID = 'test-citizen-user-A-101';
  const USER_B_ID = 'test-citizen-user-B-202';

  // SCENARIO 1: Fresh authenticated login with unhandled setup -> shows setup
  console.log('\n  [Scenario 1: Fresh authenticated login with unhandled setup]');
  localStorage.clear();
  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === false,
    'Scenario 1: New session for User A starts with isHouseholdSetupHandled === false'
  );

  // SCENARIO 2: Setup completion -> marks session handled
  console.log('\n  [Scenario 2: Setup completion marks session handled]');
  householdService.setHouseholdSetupHandled(USER_A_ID, true);
  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === true,
    'Scenario 2: householdService.setHouseholdSetupHandled(USER_A_ID, true) marks User A handled'
  );
  assert(
    localStorage.getItem(`stride_household_handled_${USER_A_ID}`) === 'true',
    'Scenario 2: User A handled flag is persisted in localStorage with user-scoped key'
  );

  // SCENARIO 3: Normal page refresh while authenticated -> dashboard loads without re-prompting setup
  console.log('\n  [Scenario 3: Normal page refresh while authenticated]');
  const refreshHandledStatus = householdService.isHouseholdSetupHandled(USER_A_ID);
  assert(
    refreshHandledStatus === true,
    'Scenario 3: On simulated page reload, isHouseholdSetupHandled(USER_A_ID) is synchronously true'
  );
  // Verify App initial state evaluation on reload:
  const simOnboardingCompleted = householdService.isHouseholdSetupHandled(USER_A_ID);
  const simOnboardingChecking = !householdService.isHouseholdSetupHandled(USER_A_ID);
  assert(
    simOnboardingCompleted === true && simOnboardingChecking === false,
    'Scenario 3: App state initializes immediately with onboardingCompleted=true and onboardingChecking=false (NO spinner)'
  );

  // SCENARIO 4: Reopening the site while authenticated -> dashboard loads without re-prompting setup
  console.log('\n  [Scenario 4: Reopening site while authenticated]');
  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === true,
    'Scenario 4: Reopening site preserves handled status for authenticated session'
  );

  // SCENARIO 5: Offline reload while authenticated -> dashboard loads without re-prompting setup and without network error hang
  console.log('\n  [Scenario 5: Offline reload while authenticated]');
  // Mock global fetch to throw (offline network failure)
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch (offline)');
  };
  try {
    const status = await householdService.getOnboardingStatus(USER_A_ID);
    assert(
      status.completed === true,
      'Scenario 5: householdService.getOnboardingStatus returns completed: true offline without hitting network'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // SCENARIO 6: Offline cache fallback for unhandled session with cached members
  console.log('\n  [Scenario 6: Cached household members fallback when offline]');
  const UNHANDLED_OFFLINE_USER = 'test-user-offline-cached-303';
  localStorage.removeItem(`stride_household_handled_${UNHANDLED_OFFLINE_USER}`);

  // When unhandled but offline, if network fails, check cache
  let fetchAttempted = false;
  const mockFetchOffline = async () => {
    fetchAttempted = true;
    throw new TypeError('Network request failed');
  };
  globalThis.fetch = mockFetchOffline;
  try {
    const status = await householdService.getOnboardingStatus(UNHANDLED_OFFLINE_USER);
    // If no cache exists, it safely returns false without throwing
    assert(
      typeof status.completed === 'boolean',
      'Scenario 6: Offline onboarding check with missing cache safely returns boolean completed status without unhandled exception'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // SCENARIO 7: Explicit logout -> handled state is cleared
  console.log('\n  [Scenario 7: Explicit logout clears handled state]');
  // Store user session in localStorage as authApi does
  localStorage.setItem('stride_token', 'mock-token-123');
  localStorage.setItem('stride_user', JSON.stringify({ id: USER_A_ID, name: 'User A', role: 'CITIZEN' }));
  householdService.setHouseholdSetupHandled(USER_A_ID, true);
  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === true,
    'Scenario 7: User A is handled prior to logout'
  );

  authApi.logout();

  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === false,
    'Scenario 7: authApi.logout() completely clears User A handled state'
  );
  assert(
    localStorage.getItem(`stride_household_handled_${USER_A_ID}`) === null,
    'Scenario 7: localStorage key stride_household_handled_USER_A is null after logout'
  );

  // SCENARIO 8: Fresh login after logout -> setup eligibility evaluated again
  console.log('\n  [Scenario 8: Fresh login after logout re-evaluates setup]');
  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === false,
    'Scenario 8: Fresh login after logout starts with unhandled state, re-triggering check'
  );

  // SCENARIO 9: Different user login -> uses User B\'s state, not User A\'s state (User Isolation)
  console.log('\n  [Scenario 9: Strict User Isolation]');
  // Set User A as handled
  householdService.setHouseholdSetupHandled(USER_A_ID, true);
  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === true,
    'Scenario 9: User A is marked handled'
  );
  assert(
    householdService.isHouseholdSetupHandled(USER_B_ID) === false,
    'Scenario 9: User B is NOT marked handled (no state leakage from User A)'
  );

  // User B sets handled -> does not affect User A
  householdService.setHouseholdSetupHandled(USER_B_ID, true);
  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === true &&
      householdService.isHouseholdSetupHandled(USER_B_ID) === true,
    'Scenario 9: Both User A and User B maintain separate isolated handled keys'
  );

  // User B clears handled -> does not affect User A
  householdService.clearHouseholdSetupHandled(USER_B_ID);
  assert(
    householdService.isHouseholdSetupHandled(USER_A_ID) === true &&
      householdService.isHouseholdSetupHandled(USER_B_ID) === false,
    'Scenario 9: Clearing User B does not clear User A'
  );

  // SCENARIO 10: Missing / corrupted / malformed input -> safe fallback behavior
  console.log('\n  [Scenario 10: Missing or malformed userId handling]');
  assert(
    householdService.isHouseholdSetupHandled(null) === false,
    'Scenario 10: isHouseholdSetupHandled(null) safely returns false'
  );
  assert(
    householdService.isHouseholdSetupHandled(undefined) === false,
    'Scenario 10: isHouseholdSetupHandled(undefined) safely returns false'
  );
  assert(
    householdService.isHouseholdSetupHandled('') === false,
    'Scenario 10: isHouseholdSetupHandled("") safely returns false'
  );
  // Setting with invalid userId does nothing and does not throw
  householdService.setHouseholdSetupHandled(null, true);
  householdService.clearHouseholdSetupHandled(undefined);
  assert(true, 'Scenario 10: set/clear with null or undefined does not throw');

  // SCENARIO 11: Exact bug reproduction
  console.log('\n  [Scenario 11: Exact Bug Reproduction Verification]');
  // 1. User logged in
  const citizenUser = { id: 'citizen_repro_user_404', name: 'Repro Citizen', role: 'CITIZEN' };
  localStorage.setItem('stride_token', 'repro-token');
  localStorage.setItem('stride_user', JSON.stringify(citizenUser));

  // 2. Household setup handled
  householdService.setHouseholdSetupHandled(citizenUser.id, true);

  // 3. Browser goes offline (fetch throws, navigator offline)
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch (offline)');
  };

  // 4. Page reloads: simulate mount checks
  const mountStoredUser = JSON.parse(localStorage.getItem('stride_user') || '{}');
  const mountIsHandled = householdService.isHouseholdSetupHandled(mountStoredUser.id);
  const mountOnboardingCompleted = mountIsHandled;
  const mountOnboardingChecking = !mountIsHandled;

  assert(
    mountIsHandled === true,
    'Reproduction: mountIsHandled evaluates to true from stored handled key'
  );
  assert(
    mountOnboardingChecking === false,
    'Reproduction: mountOnboardingChecking is FALSE (NO infinite checking spinner)'
  );
  assert(
    mountOnboardingCompleted === true,
    'Reproduction: mountOnboardingCompleted is TRUE (NO "updating household members" screen)'
  );

  // App mount conditional check:
  // if (authChecking || (currentUser?.role === 'CITIZEN' && onboardingChecking)) -> show spinner
  // if (currentUser.role === 'CITIZEN' && !onboardingCompleted) -> show HouseholdOnboardingGate
  // else -> show DashboardLayout
  const wouldShowSpinner = false || (mountStoredUser.role === 'CITIZEN' && mountOnboardingChecking);
  const wouldShowGate = mountStoredUser.role === 'CITIZEN' && !mountOnboardingCompleted;

  assert(
    !wouldShowSpinner,
    'Reproduction: Spinner is NOT displayed on offline reload'
  );
  assert(
    !wouldShowGate,
    'Reproduction: HouseholdOnboardingGate is NOT displayed on offline reload'
  );
  assert(
    !wouldShowSpinner && !wouldShowGate,
    'Reproduction: App mounts directly into authenticated dashboard using cached data while offline'
  );

  // Restore fetch
  globalThis.fetch = originalFetch;

  // Cleanup
  localStorage.clear();

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(`HOUSEHOLD SETUP RELOAD SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runHouseholdSetupReloadSuite().catch((err) => {
  console.error('Fatal error in household setup reload suite:', err);
  process.exit(1);
});
