import { openDB, type IDBPDatabase } from 'idb';
import type { StrideDBSchema } from './types';

export const STRIDE_DB_NAME = 'stride-offline';
export const STRIDE_DB_VERSION = 1;

let dbInstance: IDBPDatabase<StrideDBSchema> | null = null;
let dbPromise: Promise<IDBPDatabase<StrideDBSchema> | null> | null = null;

/**
 * Checks whether the current runtime environment supports IndexedDB.
 */
export function isIndexedDBSupported(): boolean {
  try {
    if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis) {
      return Boolean(globalThis.indexedDB);
    }
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      return Boolean(window.indexedDB);
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Database Upgrade Handler
 *
 * Implements non-destructive versioning.
 * When incrementing STRIDE_DB_VERSION in future phases:
 * - Use `oldVersion < 2` conditional blocks to add stores/indexes.
 * - NEVER drop or recreate existing stores or indexes destructively.
 * - Data preservation is mandatory across all versions.
 */
export function upgradeStrideDB(
  db: IDBPDatabase<StrideDBSchema>,
  oldVersion: number,
  newVersion: number | null
): void {
  // Version 1: Initial schema with 11 stores and required query indexes
  if (oldVersion < 1) {
    // 1. appMetadata
    if (!db.objectStoreNames.contains('appMetadata')) {
      db.createObjectStore('appMetadata', { keyPath: 'key' });
    }

    // 2. userSession
    if (!db.objectStoreNames.contains('userSession')) {
      db.createObjectStore('userSession', { keyPath: 'userId' });
    }

    // 3. household (Index: userId)
    if (!db.objectStoreNames.contains('household')) {
      const householdStore = db.createObjectStore('household', { keyPath: 'id' });
      householdStore.createIndex('by-userId', 'userId', { unique: false });
    }

    // 4. householdMembers (Index: householdId)
    if (!db.objectStoreNames.contains('householdMembers')) {
      const membersStore = db.createObjectStore('householdMembers', { keyPath: 'id' });
      membersStore.createIndex('by-householdId', 'householdId', { unique: false });
    }

    // 5. shelters (Index: status)
    if (!db.objectStoreNames.contains('shelters')) {
      const shelterStore = db.createObjectStore('shelters', { keyPath: 'id' });
      shelterStore.createIndex('by-status', 'status', { unique: false });
    }

    // 6. hospitals (Index: name)
    if (!db.objectStoreNames.contains('hospitals')) {
      const hospitalStore = db.createObjectStore('hospitals', { keyPath: 'id' });
      hospitalStore.createIndex('by-name', 'name', { unique: false });
    }

    // 7. mapData (Index: disasterId)
    if (!db.objectStoreNames.contains('mapData')) {
      const mapStore = db.createObjectStore('mapData', { keyPath: 'id' });
      mapStore.createIndex('by-disasterId', 'disasterId', { unique: false });
    }

    // 8. hazardSnapshots
    if (!db.objectStoreNames.contains('hazardSnapshots')) {
      db.createObjectStore('hazardSnapshots', { keyPath: 'id' });
    }

    // 9. activeSos (Indexes: syncStatus, updatedAt)
    if (!db.objectStoreNames.contains('activeSos')) {
      const sosStore = db.createObjectStore('activeSos', { keyPath: 'id' });
      sosStore.createIndex('by-syncStatus', 'syncStatus', { unique: false });
      sosStore.createIndex('by-updatedAt', 'updatedAt', { unique: false });
    }

    // 10. sosOutbox (Indexes: syncStatus, clientTimestamp)
    if (!db.objectStoreNames.contains('sosOutbox')) {
      const outboxStore = db.createObjectStore('sosOutbox', { keyPath: 'id' });
      outboxStore.createIndex('by-syncStatus', 'syncStatus', { unique: false });
      outboxStore.createIndex('by-clientTimestamp', 'clientTimestamp', { unique: false });
    }

    // 11. syncMetadata
    if (!db.objectStoreNames.contains('syncMetadata')) {
      db.createObjectStore('syncMetadata', { keyPath: 'entityName' });
    }
  }

  // Version 2+ migrations should be appended below:
  // if (oldVersion < 2) {
  //   // Example: Add new stores or new non-destructive indexes
  // }
}

/**
 * Opens or returns the cached connection to the STRIDE IndexedDB database.
 *
 * Resilient against:
 * - Private browsing restrictions / SecurityError
 * - Unsupported environments (SSR / headless / Node)
 * - Quota errors
 *
 * Returns `null` rather than throwing if the browser environment blocks IndexedDB,
 * allowing STRIDE to boot cleanly.
 */
export async function openStrideDB(): Promise<IDBPDatabase<StrideDBSchema> | null> {
  if (dbInstance) {
    return dbInstance;
  }

  if (dbPromise) {
    return dbPromise;
  }

  if (!isIndexedDBSupported()) {
    return null;
  }

  dbPromise = (async () => {
    try {
      const db = await openDB<StrideDBSchema>(STRIDE_DB_NAME, STRIDE_DB_VERSION, {
        upgrade(database, oldVer, newVer) {
          upgradeStrideDB(database, oldVer, newVer);
        },
        blocked(currentVersion, blockedVersion) {
          console.warn(
            `[STRIDE Offline DB] Database open blocked: current=${currentVersion}, blocked=${blockedVersion}`
          );
        },
        blocking(currentVersion, blockedVersion) {
          console.warn(
            `[STRIDE Offline DB] Closing connection because older version is blocking: current=${currentVersion}, blocked=${blockedVersion}`
          );
          if (dbInstance) {
            dbInstance.close();
            dbInstance = null;
          }
        },
        terminated() {
          console.warn('[STRIDE Offline DB] Database connection unexpectedly terminated.');
          dbInstance = null;
          dbPromise = null;
        },
      });

      dbInstance = db;
      return db;
    } catch (err) {
      console.warn('[STRIDE Offline DB] IndexedDB initialization failed or unavailable:', err);
      return null;
    } finally {
      dbPromise = null;
    }
  })();

  return dbPromise;
}

/**
 * Non-blocking initialization during application startup.
 * Returns true if DB opened successfully, false if unavailable.
 */
export async function initStrideDB(): Promise<boolean> {
  try {
    const db = await openStrideDB();
    return db !== null;
  } catch {
    return false;
  }
}

/**
 * Closes the active database connection, resetting the singleton instance.
 */
export async function closeStrideDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  dbPromise = null;
}

/**
 * Deletes the database (primarily used in test environments).
 */
export async function deleteStrideDB(): Promise<boolean> {
  await closeStrideDB();
  if (!isIndexedDBSupported()) {
    return false;
  }
  try {
    const idbFactory = globalThis.indexedDB || (typeof window !== 'undefined' ? window.indexedDB : null);
    if (!idbFactory) return false;
    await new Promise<void>((resolve, reject) => {
      const req = idbFactory.deleteDatabase(STRIDE_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
    return true;
  } catch (err) {
    console.warn('[STRIDE Offline DB] Failed to delete database:', err);
    return false;
  }
}
