import type { DBSchema } from 'idb';
import type {
  UserRole,
  WaterLevel,
  EmergencyType,
  PriorityLevel,
  RescueStatus,
} from '../types/index';

// ============================================================================
// Typed Storage Errors & Results
// ============================================================================

export type StorageErrorCode =
  | 'DB_UNAVAILABLE'
  | 'OPERATION_FAILED'
  | 'TRANSACTION_ABORTED'
  | 'NOT_FOUND'
  | 'SCHEMA_MISMATCH';

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: StorageErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export type StorageResult<T> =
  | { ok: true; data: T; error?: undefined }
  | { ok: false; error: StorageError; data?: undefined };

export type DataSource = 'server' | 'cache' | 'none';

export interface CachedDataResult<T> {
  data: T;
  source: DataSource;
  lastSyncedAt?: string;
  isStale?: boolean;
}

export type FallbackResult<T> = StorageResult<CachedDataResult<T>>;

export function storageOk<T>(data: T): StorageResult<T> {
  return { ok: true, data };
}

export function storageErr<T = never>(
  code: StorageErrorCode,
  message: string,
  cause?: unknown
): StorageResult<T> {
  return { ok: false, error: new StorageError(message, code, cause) };
}

// ============================================================================
// Store Record Schemas (11 Stores)
// ============================================================================

/**
 * Store 1: appMetadata
 * Key: string
 */
export interface AppMetadataRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

/**
 * Store 2: userSession
 * Key: userId (string)
 */
export interface UserSessionRecord {
  userId: string;
  name: string;
  role: UserRole;
  mobileNumber?: string;
  testIdentityNumber?: string;
  householdId?: string;
  tokenExpiry?: string;
  lastAuthenticated: string;
}

/**
 * Store 3: household
 * Key: id (string)
 * Index: userId
 */
export interface HouseholdRecord {
  id: string;
  userId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  onboardingCompleted: boolean;
  lastSyncedAt?: string;
}

/**
 * Store 4: householdMembers
 * Key: id (string)
 * Index: householdId
 */
export interface HouseholdMemberRecord {
  id: string;
  householdId: string;
  name: string;
  age: number;
  relationship: string;
  category: 'ADULT' | 'CHILD' | 'ELDERLY';
  emergencyStatus?: string;
  syncStatus?: 'SYNCED' | 'PENDING' | 'ERROR';
}

/**
 * Store 5: shelters
 * Key: id (string)
 * Index: status
 */
export interface ShelterRecord {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
  contactNumber: string;
  status: 'ACTIVE' | 'NEAR_CAPACITY' | 'FULL' | 'CLOSED';
  lastSyncedAt?: string;
}

/**
 * Store 6: hospitals
 * Key: id (string)
 * Index: name
 */
export interface HospitalDoctorRecord {
  name: string;
  speciality: string;
  onDuty: boolean;
  contact?: string;
}

export interface HospitalRecord {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contactNumber: string;
  totalBeds: number;
  availableBeds: number;
  icuBedsAvailable: number;
  specialities: string[];
  doctors: HospitalDoctorRecord[];
  disclaimer: string;
  lastSyncedAt?: string;
}

/**
 * Store 7: mapData
 * Key: id (string)
 * Index: disasterId
 */
export interface MapDataRecord {
  id: string;
  disasterId: string;
  name: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  polygonGeoJson: string | any[];
  radiusKm?: number;
  lastSyncedAt?: string;
}

/**
 * Store 8: hazardSnapshots
 * Key: id (string)
 */
export interface HazardSnapshotRecord {
  id: string;
  temperature: number;
  apparentTemperature: number;
  precipitation: number;
  relativeHumidity: number;
  windSpeed: number;
  floodRiskLevel: string;
  badge: string;
  recordedAt: string;
  expiresAt: string;
}

/**
 * Store 9: activeSos
 * Key: id (string)
 * Indexes: syncStatus, updatedAt
 */
export interface SosPriorityBreakdown {
  criticalMedical?: number;
  injured?: number;
  children?: number;
  elderly?: number;
  disabled?: number;
  peopleCount?: number;
  waterLevel?: number;
  trappedOrStructural?: number;
}

export interface ActiveSosRecord {
  id: string;
  localId?: string;
  serverId?: string;
  disasterId?: string;
  householdMemberId?: string;
  userId?: string;
  peopleCount: number;
  childrenCount: number;
  elderlyCount: number;
  disabledCount: number;
  injuredCount: number;
  criticalMedicalNeed: boolean;
  waterLevel: WaterLevel;
  emergencyType: EmergencyType;
  conditions: string[];
  priorityScore: number;
  priorityLevel: PriorityLevel;
  priorityBreakdown?: SosPriorityBreakdown;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  status: RescueStatus;
  syncStatus: 'SYNCED' | 'PENDING' | 'ERROR';
  clientOperationId?: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
}

/**
 * Store 10: sosOutbox
 * Key: id (client operation UUID string)
 * Indexes: syncStatus, clientTimestamp
 */
export interface SosOutboxRecord {
  id: string;
  userId?: string;
  actionType: 'CREATE_SOS' | 'UPDATE_SOS' | 'CANCEL_SOS';
  endpoint: string;
  payload: unknown;
  clientTimestamp: string;
  syncStatus: 'PENDING' | 'IN_FLIGHT' | 'FAILED';
  retryCount: number;
  lastError?: string;
}

/**
 * Store 11: syncMetadata
 * Key: entityName (string)
 */
export type SyncState = 'IDLE' | 'SYNCING' | 'ERROR';

export interface SyncMetadataRecord {
  entityName: string;
  lastSyncTime: string;
  recordCount: number;
  syncState: SyncState;
}

// ============================================================================
// Complete Typed DBSchema for idb
// ============================================================================

export type StrideStoreName =
  | 'appMetadata'
  | 'userSession'
  | 'household'
  | 'householdMembers'
  | 'shelters'
  | 'hospitals'
  | 'mapData'
  | 'hazardSnapshots'
  | 'activeSos'
  | 'sosOutbox'
  | 'syncMetadata';

export interface StrideDBSchema extends DBSchema {
  appMetadata: {
    key: string;
    value: AppMetadataRecord;
  };
  userSession: {
    key: string;
    value: UserSessionRecord;
  };
  household: {
    key: string;
    value: HouseholdRecord;
    indexes: {
      'by-userId': string;
    };
  };
  householdMembers: {
    key: string;
    value: HouseholdMemberRecord;
    indexes: {
      'by-householdId': string;
    };
  };
  shelters: {
    key: string;
    value: ShelterRecord;
    indexes: {
      'by-status': string;
    };
  };
  hospitals: {
    key: string;
    value: HospitalRecord;
    indexes: {
      'by-name': string;
    };
  };
  mapData: {
    key: string;
    value: MapDataRecord;
    indexes: {
      'by-disasterId': string;
    };
  };
  hazardSnapshots: {
    key: string;
    value: HazardSnapshotRecord;
  };
  activeSos: {
    key: string;
    value: ActiveSosRecord;
    indexes: {
      'by-syncStatus': string;
      'by-updatedAt': string;
    };
  };
  sosOutbox: {
    key: string;
    value: SosOutboxRecord;
    indexes: {
      'by-syncStatus': string;
      'by-clientTimestamp': string;
    };
  };
  syncMetadata: {
    key: string;
    value: SyncMetadataRecord;
  };
}
