import { offlineStorageService } from './offlineStorageService';
import { duringApi, RescueRequest, WaterLevel, EmergencyType, PriorityLevel } from '../api/duringApi';
import { authApi } from '../api/authApi';
import { ActiveSosRecord, SosOutboxRecord } from './types';

export interface CreateSosInput {
  latitude?: number;
  longitude?: number;
  address: string;
  description: string;
  peopleCount?: number;
  childrenCount?: number;
  elderlyCount?: number;
  disabledCount?: number;
  injuredCount?: number;
  criticalMedicalNeed?: boolean;
  waterLevel?: WaterLevel;
  emergencyType?: EmergencyType;
  conditions?: string[];
}

export interface CreateSosResult {
  localSos: ActiveSosRecord;
  serverSos?: RescueRequest;
  isOffline: boolean;
}

export const offlineSosService = {
  /**
   * Creates an emergency SOS mutation.
   * ONLINE: Attempts direct server creation with unique clientOperationId. On success, caches record without outbox queue.
   * OFFLINE / TRANSIENT ERROR: Queues mutation into IndexedDB activeSos and sosOutbox with unique clientOperationId.
   */
  async createSos(input: CreateSosInput): Promise<CreateSosResult> {
    // 1. CANONICAL VALIDATION (Refinement 4)
    if (!input.address || !input.address.trim() || !input.description || !input.description.trim()) {
      throw new Error('Address and description are required.');
    }

    // 2. AUTHENTICATION CHECK (Refinement 9)
    const currentUser = authApi.getStoredUser();
    if (!currentUser || !currentUser.id) {
      throw new Error('Please log in to submit an emergency distress request.');
    }

    const now = new Date().toISOString();
    // 3. CLIENT OPERATION ID (UUID) GENERATION (Refinement 7)
    const clientOperationId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'op-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();

    const peopleCount = Math.max(1, Number(input.peopleCount) || 1);
    const childrenCount = Math.max(0, Number(input.childrenCount) || 0);
    const elderlyCount = Math.max(0, Number(input.elderlyCount) || 0);
    const disabledCount = Math.max(0, Number(input.disabledCount) || 0);
    const injuredCount = Math.max(0, Number(input.injuredCount) || 0);
    const criticalMedicalNeed = Boolean(input.criticalMedicalNeed);
    const waterLevel: WaterLevel = input.waterLevel || 'HIGH';
    const emergencyType: EmergencyType = input.emergencyType || 'FLOOD';
    const latitude = Number(input.latitude) || 12.9716;
    const longitude = Number(input.longitude) || 77.5946;
    const address = input.address.trim();
    const description = input.description.trim();

    const conditionList: string[] = ['NEED_RESCUE'];
    if (criticalMedicalNeed) conditionList.push('SERIOUSLY_UNWELL');
    if (injuredCount > 0) conditionList.push('HEAVILY_INJURED');
    if (childrenCount > 0) conditionList.push('CHILDREN_INFANTS_PRESENT');
    if (disabledCount > 0) conditionList.push('PHYSICALLY_DISABLED');
    if (waterLevel === 'HIGH' || waterLevel === 'EXTREME') conditionList.push('WATER_RISING');
    if (emergencyType === 'TRAPPED') conditionList.push('TRAPPED');
    if (emergencyType === 'FIRE') conditionList.push('FIRE');
    if (input.conditions && Array.isArray(input.conditions)) {
      for (const c of input.conditions) {
        if (!conditionList.includes(c)) conditionList.push(c);
      }
    }

    // Local typed SOS representation (NO fake server priority score)
    const localSos: ActiveSosRecord = {
      id: clientOperationId,
      localId: clientOperationId,
      clientOperationId,
      userId: currentUser.id,
      peopleCount,
      childrenCount,
      elderlyCount,
      disabledCount,
      injuredCount,
      criticalMedicalNeed,
      waterLevel,
      emergencyType,
      conditions: conditionList,
      priorityScore: 0, // Explicit 0: No fake priority calculation on client (Section 6)
      priorityLevel: 'LOW',
      description,
      address,
      latitude,
      longitude,
      status: 'PENDING',
      syncStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    const outboxPayload = {
      latitude,
      longitude,
      address,
      description,
      peopleCount,
      childrenCount,
      elderlyCount,
      disabledCount,
      injuredCount,
      criticalMedicalNeed,
      waterLevel,
      emergencyType,
    };

    const outboxItem: SosOutboxRecord = {
      id: clientOperationId,
      userId: currentUser.id,
      actionType: 'CREATE_SOS',
      endpoint: '/rescue-requests',
      payload: outboxPayload,
      clientTimestamp: now,
      syncStatus: 'PENDING',
      retryCount: 0,
    };

    // 4. ONLINE PATH: ATTEMPT DIRECT SERVER SUBMISSION (Refinement 5)
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (isOnline) {
      try {
        const serverSos = await duringApi.submitRescueRequest({
          ...outboxPayload,
          clientOperationId,
        });

        // Online creation succeeded: persist authoritative record as SYNCED without outbox queue
        const syncedSos: ActiveSosRecord = {
          ...localSos,
          id: clientOperationId,
          serverId: serverSos.id,
          syncStatus: 'SYNCED',
          priorityScore: serverSos.priorityScore,
          priorityLevel: serverSos.priorityLevel,
          priorityBreakdown: serverSos.priorityBreakdown,
          status: serverSos.status,
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await offlineStorageService.putActiveSos(syncedSos);

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('stride_active_sos_id', serverSos.id);
        }

        return { localSos: syncedSos, serverSos, isOffline: false };
      } catch (err) {
        console.warn('[offlineSosService] Online transmission failed, enqueuing to offline outbox:', err);
      }
    }

    // 5. OFFLINE / FALLBACK PATH: ATOMICALLY WRITE TO activeSos AND sosOutbox (Refinement 8)
    const putRes = await offlineStorageService.putActiveSosAndOutbox(localSos, outboxItem);
    if (!putRes.ok) {
      throw new Error(`Failed to store emergency request locally: ${putRes.error.message}`);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('stride_active_sos_id', clientOperationId);
    }

    return { localSos, isOffline: true };
  },

  /**
   * Retrieves the current citizen's active SOS record from offline storage.
   * Enforces strict user isolation: returns null if the cached SOS belongs to another user.
   */
  async getActiveSos(userId?: string): Promise<ActiveSosRecord | null> {
    if (!userId) return null;
    const res = await offlineStorageService.getActiveSosByUserId(userId);
    return res.ok ? res.data : null;
  },

  /**
   * Cancels an active SOS locally and in the outbox.
   */
  async cancelSos(operationOrServerId: string): Promise<void> {
    const allSos = await offlineStorageService.getAllActiveSos();
    if (allSos.ok && allSos.data) {
      for (const item of allSos.data) {
        if (item.id === operationOrServerId || item.serverId === operationOrServerId) {
          item.status = 'CANCELLED';
          item.syncStatus = 'SYNCED';
          await offlineStorageService.putActiveSos(item);
          await offlineStorageService.deleteOutboxItem(item.id);
        }
      }
    }
  },
};
