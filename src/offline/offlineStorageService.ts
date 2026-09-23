import type { IDBPTransaction } from 'idb';
import { openStrideDB } from './db';
import {
  storageOk,
  storageErr,
  type StorageResult,
  type StrideDBSchema,
  type StrideStoreName,
  type AppMetadataRecord,
  type UserSessionRecord,
  type HouseholdRecord,
  type HouseholdMemberRecord,
  type ShelterRecord,
  type HospitalRecord,
  type MapDataRecord,
  type HazardSnapshotRecord,
  type ActiveSosRecord,
  type SosOutboxRecord,
  type SyncMetadataRecord,
} from './types';

/**
 * Executes an operation with the active database.
 * If the database cannot be opened (e.g. private mode, quota error, unsupported),
 * returns a typed `{ ok: false, error: StorageError(code: 'DB_UNAVAILABLE') }`.
 */
async function withDB<T>(
  operation: (db: NonNullable<Awaited<ReturnType<typeof openStrideDB>>>) => Promise<T>
): Promise<StorageResult<T>> {
  try {
    const db = await openStrideDB();
    if (!db) {
      return storageErr('DB_UNAVAILABLE', 'IndexedDB is unavailable or blocked in this environment');
    }
    const result = await operation(db);
    return storageOk(result);
  } catch (err: any) {
    return storageErr('OPERATION_FAILED', err?.message || 'Storage operation failed', err);
  }
}

export const offlineStorageService = {
  // ==========================================================================
  // Store 1: appMetadata
  // ==========================================================================

  async getAppMetadata(key: string): Promise<StorageResult<AppMetadataRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('appMetadata', key);
      return record ?? null;
    });
  },

  async putAppMetadata(record: AppMetadataRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('appMetadata', record);
      return record.key;
    });
  },

  async deleteAppMetadata(key: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('appMetadata', key);
    });
  },

  async getAllAppMetadata(): Promise<StorageResult<AppMetadataRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('appMetadata');
    });
  },

  // ==========================================================================
  // Store 2: userSession
  // ==========================================================================

  async getUserSession(userId: string): Promise<StorageResult<UserSessionRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('userSession', userId);
      return record ?? null;
    });
  },

  async putUserSession(session: UserSessionRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('userSession', session);
      return session.userId;
    });
  },

  async deleteUserSession(userId: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('userSession', userId);
    });
  },

  async getAllUserSessions(): Promise<StorageResult<UserSessionRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('userSession');
    });
  },

  // ==========================================================================
  // Store 3: household
  // ==========================================================================

  async getHousehold(id: string): Promise<StorageResult<HouseholdRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('household', id);
      return record ?? null;
    });
  },

  async getHouseholdByUserId(userId: string): Promise<StorageResult<HouseholdRecord | null>> {
    return withDB(async (db) => {
      const record = await db.getFromIndex('household', 'by-userId', userId);
      return record ?? null;
    });
  },

  async putHousehold(household: HouseholdRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('household', household);
      return household.id;
    });
  },

  async deleteHousehold(id: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('household', id);
    });
  },

  // ==========================================================================
  // Store 4: householdMembers
  // ==========================================================================

  async getHouseholdMember(id: string): Promise<StorageResult<HouseholdMemberRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('householdMembers', id);
      return record ?? null;
    });
  },

  async getHouseholdMembers(householdId: string): Promise<StorageResult<HouseholdMemberRecord[]>> {
    return withDB(async (db) => {
      return db.getAllFromIndex('householdMembers', 'by-householdId', householdId);
    });
  },

  async putHouseholdMember(member: HouseholdMemberRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('householdMembers', member);
      return member.id;
    });
  },

  async putHouseholdMembers(members: HouseholdMemberRecord[]): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      const tx = db.transaction('householdMembers', 'readwrite');
      for (const m of members) {
        await tx.store.put(m);
      }
      await tx.done;
    });
  },

  async deleteHouseholdMember(id: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('householdMembers', id);
    });
  },

  // ==========================================================================
  // Store 5: shelters
  // ==========================================================================

  async getShelter(id: string): Promise<StorageResult<ShelterRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('shelters', id);
      return record ?? null;
    });
  },

  async getAllShelters(): Promise<StorageResult<ShelterRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('shelters');
    });
  },

  async getSheltersByStatus(status: ShelterRecord['status']): Promise<StorageResult<ShelterRecord[]>> {
    return withDB(async (db) => {
      return db.getAllFromIndex('shelters', 'by-status', status);
    });
  },

  async putShelter(shelter: ShelterRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('shelters', shelter);
      return shelter.id;
    });
  },

  async putShelters(shelters: ShelterRecord[]): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      const tx = db.transaction('shelters', 'readwrite');
      for (const s of shelters) {
        await tx.store.put(s);
      }
      await tx.done;
    });
  },

  async deleteShelter(id: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('shelters', id);
    });
  },

  // ==========================================================================
  // Store 6: hospitals
  // ==========================================================================

  async getHospital(id: string): Promise<StorageResult<HospitalRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('hospitals', id);
      return record ?? null;
    });
  },

  async getAllHospitals(): Promise<StorageResult<HospitalRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('hospitals');
    });
  },

  async getHospitalByName(name: string): Promise<StorageResult<HospitalRecord | null>> {
    return withDB(async (db) => {
      const record = await db.getFromIndex('hospitals', 'by-name', name);
      return record ?? null;
    });
  },

  async putHospital(hospital: HospitalRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('hospitals', hospital);
      return hospital.id;
    });
  },

  async putHospitals(hospitals: HospitalRecord[]): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      const tx = db.transaction('hospitals', 'readwrite');
      for (const h of hospitals) {
        await tx.store.put(h);
      }
      await tx.done;
    });
  },

  async deleteHospital(id: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('hospitals', id);
    });
  },

  // ==========================================================================
  // Store 7: mapData
  // ==========================================================================

  async getMapData(id: string): Promise<StorageResult<MapDataRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('mapData', id);
      return record ?? null;
    });
  },

  async getMapDataByDisasterId(disasterId: string): Promise<StorageResult<MapDataRecord[]>> {
    return withDB(async (db) => {
      return db.getAllFromIndex('mapData', 'by-disasterId', disasterId);
    });
  },

  async getAllMapData(): Promise<StorageResult<MapDataRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('mapData');
    });
  },

  async putMapData(data: MapDataRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('mapData', data);
      return data.id;
    });
  },

  async deleteMapData(id: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('mapData', id);
    });
  },

  // ==========================================================================
  // Store 8: hazardSnapshots
  // ==========================================================================

  async getHazardSnapshot(id: string): Promise<StorageResult<HazardSnapshotRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('hazardSnapshots', id);
      return record ?? null;
    });
  },

  async getAllHazardSnapshots(): Promise<StorageResult<HazardSnapshotRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('hazardSnapshots');
    });
  },

  async putHazardSnapshot(snapshot: HazardSnapshotRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('hazardSnapshots', snapshot);
      return snapshot.id;
    });
  },

  async deleteHazardSnapshot(id: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('hazardSnapshots', id);
    });
  },

  // ==========================================================================
  // Store 9: activeSos
  // ==========================================================================

  async getActiveSos(id: string): Promise<StorageResult<ActiveSosRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('activeSos', id);
      return record ?? null;
    });
  },

  async getActiveSosBySyncStatus(
    syncStatus: ActiveSosRecord['syncStatus']
  ): Promise<StorageResult<ActiveSosRecord[]>> {
    return withDB(async (db) => {
      return db.getAllFromIndex('activeSos', 'by-syncStatus', syncStatus);
    });
  },

  async getAllActiveSos(): Promise<StorageResult<ActiveSosRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('activeSos');
    });
  },

  async getActiveSosByUserId(userId: string): Promise<StorageResult<ActiveSosRecord | null>> {
    return withDB(async (db) => {
      const all = await db.getAll('activeSos');
      const userRecord = all.find((r) => r.userId === userId && r.status !== 'CANCELLED');
      return userRecord ?? null;
    });
  },

  async putActiveSos(sos: ActiveSosRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('activeSos', sos);
      return sos.id;
    });
  },

  async deleteActiveSos(id: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('activeSos', id);
    });
  },

  async putActiveSosAndOutbox(
    sos: ActiveSosRecord,
    outbox: SosOutboxRecord
  ): Promise<StorageResult<void>> {
    return this.runTransaction(['activeSos', 'sosOutbox'], 'readwrite', async (tx) => {
      await tx.objectStore('activeSos').put(sos);
      await tx.objectStore('sosOutbox').put(outbox);
    });
  },

  async reconcileSyncedSos(
    localSosId: string,
    outboxId: string,
    serverSos: any
  ): Promise<StorageResult<void>> {
    return this.runTransaction(['activeSos', 'sosOutbox'], 'readwrite', async (tx) => {
      const activeStore = tx.objectStore('activeSos');
      const existing = (await activeStore.get(localSosId)) as ActiveSosRecord | undefined;
      const updated: ActiveSosRecord = {
        ...(existing || {}),
        id: localSosId,
        serverId: serverSos.id,
        syncStatus: 'SYNCED',
        priorityScore: serverSos.priorityScore,
        priorityLevel: serverSos.priorityLevel,
        priorityBreakdown: serverSos.priorityBreakdown,
        status: serverSos.status,
        lastSyncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as ActiveSosRecord;
      await activeStore.put(updated);

      const outboxStore = tx.objectStore('sosOutbox');
      const outboxItem = (await outboxStore.get(outboxId)) as SosOutboxRecord | undefined;
      if (outboxItem) {
        outboxItem.syncStatus = 'SYNCED';
        await outboxStore.put(outboxItem);
      }
    });
  },

  async cancelActiveSosAndOutbox(
    operationOrServerId: string
  ): Promise<StorageResult<void>> {
    return this.runTransaction(['activeSos', 'sosOutbox'], 'readwrite', async (tx) => {
      const activeStore = tx.objectStore('activeSos');
      const outboxStore = tx.objectStore('sosOutbox');
      const allSos = await activeStore.getAll();
      for (const item of allSos) {
        if (item.id === operationOrServerId || item.serverId === operationOrServerId) {
          item.status = 'CANCELLED';
          item.syncStatus = 'SYNCED';
          await activeStore.put(item);
          await outboxStore.delete(item.id);
        }
      }
    });
  },

  // ==========================================================================
  // Store 10: sosOutbox
  // ==========================================================================

  async getOutboxItem(id: string): Promise<StorageResult<SosOutboxRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('sosOutbox', id);
      return record ?? null;
    });
  },

  async getOutboxItemsByStatus(
    syncStatus: SosOutboxRecord['syncStatus']
  ): Promise<StorageResult<SosOutboxRecord[]>> {
    return withDB(async (db) => {
      return db.getAllFromIndex('sosOutbox', 'by-syncStatus', syncStatus);
    });
  },

  async getAllOutboxItems(): Promise<StorageResult<SosOutboxRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('sosOutbox');
    });
  },

  async putOutboxItem(item: SosOutboxRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('sosOutbox', item);
      return item.id;
    });
  },

  async deleteOutboxItem(id: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('sosOutbox', id);
    });
  },

  // ==========================================================================
  // Store 11: syncMetadata
  // ==========================================================================

  async getSyncMetadata(entityName: string): Promise<StorageResult<SyncMetadataRecord | null>> {
    return withDB(async (db) => {
      const record = await db.get('syncMetadata', entityName);
      return record ?? null;
    });
  },

  async getAllSyncMetadata(): Promise<StorageResult<SyncMetadataRecord[]>> {
    return withDB(async (db) => {
      return db.getAll('syncMetadata');
    });
  },

  async putSyncMetadata(metadata: SyncMetadataRecord): Promise<StorageResult<string>> {
    return withDB(async (db) => {
      await db.put('syncMetadata', metadata);
      return metadata.entityName;
    });
  },

  async deleteSyncMetadata(entityName: string): Promise<StorageResult<void>> {
    return withDB(async (db) => {
      await db.delete('syncMetadata', entityName);
    });
  },

  // ==========================================================================
  // Transaction Primitive for Multi-Store Atomic Work
  // ==========================================================================

  /**
   * Executes a multi-store transaction atomically.
   * Useful for future atomic workflows (such as activeSos + sosOutbox updates).
   */
  async runTransaction<T>(
    storeNames: StrideStoreName | StrideStoreName[],
    mode: 'readonly' | 'readwrite',
    operation: (
      tx: IDBPTransaction<StrideDBSchema, StrideStoreName[], typeof mode>
    ) => Promise<T>
  ): Promise<StorageResult<T>> {
    return withDB(async (db) => {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const tx = db.transaction(names, mode);
      const result = await operation(tx);
      await tx.done;
      return result;
    });
  },
};
