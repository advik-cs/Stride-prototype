import { beforeApi } from './beforeApi';
import { duringApi } from './duringApi';
import { ApiError } from './config';

export type UserRole = 'CITIZEN' | 'AUTHORITY' | 'RESCUER';

export interface UnifiedUser {
  id: string;
  name: string;
  email?: string;
  mobileNumber?: string;
  testIdentityNumber?: string;
  role: UserRole;
  phone?: string;
}

export interface DemoCredential {
  name: string;
  role: UserRole;
  duringEmail: string;
  duringPassword: string;
  beforeMobile: string;
  beforePassword: string;
  identityBadge: string;
}

export const DEMO_CREDENTIALS: Record<UserRole, DemoCredential> = {
  CITIZEN: {
    name: 'Ramesh Iyer',
    role: 'CITIZEN',
    duringEmail: 'citizen1@demo.com',
    duringPassword: 'Citizen123!',
    beforeMobile: '9800000011',
    beforePassword: 'StrongPassword123!',
    identityBadge: '5432 8901 2345',
  },
  AUTHORITY: {
    name: 'Commander Arjun Rao',
    role: 'AUTHORITY',
    duringEmail: 'authority@demo.com',
    duringPassword: 'Authority123!',
    beforeMobile: '9800000001',
    beforePassword: 'StrongPassword123!',
    identityBadge: 'AUTH-COMMAND-01',
  },
  RESCUER: {
    name: 'Inspector Rajesh Kumar',
    role: 'RESCUER',
    duringEmail: 'rescuer1@demo.com',
    duringPassword: 'Rescuer123!',
    beforeMobile: '9800000001',
    beforePassword: 'StrongPassword123!',
    identityBadge: 'RES-NDRF-88210',
  },
};

export const authApi = {
  getStoredUser(): UnifiedUser | null {
    try {
      const u = localStorage.getItem('stride_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  logout(): void {
    localStorage.removeItem('stride_token');
    localStorage.removeItem('stride_before_token');
    localStorage.removeItem('stride_during_token');
    localStorage.removeItem('stride_user');
    localStorage.removeItem('stride_active_sos_id');
    window.dispatchEvent(new Event('stride_auth_changed'));
  },

  /**
   * Log into both backends using deterministic credentials for the given role
   */
  async loginDemo(role: UserRole): Promise<UnifiedUser> {
    const cred = DEMO_CREDENTIALS[role];

    let duringToken = '';
    let beforeToken = '';
    let userId = '';
    let name = cred.name;

    // 1. Authenticate with DURING backend
    try {
      const duringRes = await duringApi.login({
        email: cred.duringEmail,
        password: cred.duringPassword,
      });
      duringToken = duringRes.token;
      userId = duringRes.user.id;
      name = duringRes.user.name || cred.name;
    } catch (err) {
      console.warn('DURING demo login fallback:', err);
    }

    // 2. Authenticate with BEFORE backend
    try {
      const beforeRes = await beforeApi.login({
        mobileNumber: cred.beforeMobile,
        password: cred.beforePassword,
        name: cred.name,
        testIdentityNumber: cred.identityBadge,
        role: cred.role,
      });
      beforeToken = beforeRes.token;
      if (!userId) userId = beforeRes.user.id;
    } catch (err) {
      console.warn('BEFORE demo login fallback:', err);
    }

    if (duringToken) localStorage.setItem('stride_during_token', duringToken);
    if (beforeToken) localStorage.setItem('stride_before_token', beforeToken);
    // Legacy single token fallback
    localStorage.setItem('stride_token', duringToken || beforeToken);

    const user: UnifiedUser = {
      id: userId || `demo-${role.toLowerCase()}`,
      name,
      email: cred.duringEmail,
      mobileNumber: cred.beforeMobile,
      testIdentityNumber: cred.identityBadge,
      role,
    };

    localStorage.setItem('stride_user', JSON.stringify(user));
    window.dispatchEvent(new Event('stride_auth_changed'));
    return user;
  },

  /**
   * Universal Login supporting custom inputs
   */
  async loginCustom(params: {
    identifier: string; // Email, mobile number, or Aadhaar
    password?: string;
    role: UserRole;
    name?: string;
  }): Promise<UnifiedUser> {
    const isEmail = params.identifier.includes('@');
    const cleanId = params.identifier.replace(/\s+/g, '');
    const password = params.password || 'StrongPassword123!';
    const role = params.role;

    let duringToken = '';
    let beforeToken = '';
    let userId = '';
    let userName = params.name || (role === 'CITIZEN' ? 'STRIDE Citizen' : role === 'AUTHORITY' ? 'Authority Dispatcher' : 'Rescuer Officer');

    // Attempt DURING backend authentication
    try {
      const duringEmail = isEmail ? cleanId : `${cleanId}@stride.emergency`;
      try {
        const res = await duringApi.login({ email: duringEmail, password });
        duringToken = res.token;
        userId = res.user.id;
        userName = res.user.name || userName;
      } catch (err: any) {
        // If user not found, auto-register
        if (err.statusCode === 401 || err.statusCode === 404 || err.message?.includes('Invalid')) {
          const regRes = await duringApi.register({
            name: userName,
            email: duringEmail,
            password,
            role,
            phone: !isEmail ? cleanId : undefined,
          });
          duringToken = regRes.token;
          userId = regRes.user.id;
        }
      }
    } catch (e) {
      console.warn('DURING login attempt warning:', e);
    }

    // Attempt BEFORE backend authentication
    try {
      const mobileNumber = !isEmail && cleanId.length >= 8 ? cleanId : '9800000011';
      try {
        const beforeRes = await beforeApi.login({
          mobileNumber,
          password,
          name: userName,
          testIdentityNumber: cleanId,
          role,
        });
        beforeToken = beforeRes.token;
        if (!userId) userId = beforeRes.user.id;
      } catch (err: any) {
        // If not found in BEFORE, try signup
        if (err.statusCode === 401 || err.statusCode === 404 || err.message?.includes('Invalid')) {
          const signupRes = await beforeApi.signup({
            name: userName,
            testIdentityNumber: cleanId,
            mobileNumber,
            password,
            role: role === 'AUTHORITY' ? 'RESCUER' : role,
          });
          beforeToken = signupRes.token;
          if (!userId) userId = signupRes.user.id;
        }
      }
    } catch (e) {
      console.warn('BEFORE login attempt warning:', e);
    }

    // Fallback: If one backend token is missing, backfill with demo token of that role so tabs work seamlessly
    if (!duringToken) {
      try {
        const demoDuring = await duringApi.login({
          email: DEMO_CREDENTIALS[role].duringEmail,
          password: DEMO_CREDENTIALS[role].duringPassword,
        });
        duringToken = demoDuring.token;
      } catch {}
    }
    if (!beforeToken) {
      try {
        const demoBefore = await beforeApi.login({
          mobileNumber: DEMO_CREDENTIALS[role].beforeMobile,
          password: DEMO_CREDENTIALS[role].beforePassword,
        });
        beforeToken = demoBefore.token;
      } catch {}
    }

    if (duringToken) localStorage.setItem('stride_during_token', duringToken);
    if (beforeToken) localStorage.setItem('stride_before_token', beforeToken);
    localStorage.setItem('stride_token', duringToken || beforeToken);

    const user: UnifiedUser = {
      id: userId || `user-${Date.now()}`,
      name: userName,
      email: isEmail ? cleanId : `${cleanId}@stride.emergency`,
      mobileNumber: !isEmail ? cleanId : '9800000011',
      testIdentityNumber: cleanId,
      role,
    };

    localStorage.setItem('stride_user', JSON.stringify(user));
    window.dispatchEvent(new Event('stride_auth_changed'));
    return user;
  },
};
