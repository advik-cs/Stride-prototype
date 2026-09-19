/**
 * Centralized Shared Domain Types for STRIDE
 * 
 * Provides unified type definitions and contracts across Citizens,
 * Incident Command Authorities, and Tactical First Responders.
 * 
 * Note: Pure type and interface declarations only — zero runtime side effects.
 */

// ============================================================================
// 1. Roles & Authentication
// ============================================================================

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

export type User = UnifiedUser;

export interface DemoCredential {
  name: string;
  role: UserRole;
  duringEmail: string;
  duringPassword: string;
  beforeMobile: string;
  beforePassword: string;
  identityBadge: string;
}

// ============================================================================
// 2. Disaster Modes & Navigation
// ============================================================================

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

// ============================================================================
// 3. Disaster Events & Geographic Zones
// ============================================================================

export interface AffectedZone {
  id: string;
  name: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  polygonGeoJson: string | any[];
  radiusKm?: number;
}

export interface DisasterEvent {
  id: string;
  title: string;
  description?: string;
  type: string;
  alertLevel: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  status: 'PREDICTED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  predictedStartTime?: string;
  predictedEndTime?: string;
  affectedZones?: AffectedZone[];
}

export interface BuildingIntelligence {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  floors: number;
  totalOccupants: number;
  evacuatedCount: number;
  inDistressCount: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  vulnerableCount: number;
}

// ============================================================================
// 4. Households & Citizen Demographics
// ============================================================================

export interface ExpectedLocation {
  id?: string;
  expectedType: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN';
  shelterId?: string;
  otherCity?: string;
  reconfirmedStatus?: 'SAME_PLAN' | 'CHANGE_LOCATION' | 'NOT_SURE';
  reconfirmedAt?: string;
}

export interface HouseholdMember {
  id: string;
  name: string;
  age: number;
  category: 'ADULT' | 'CHILD' | 'ELDERLY';
  relationship: string;
  expectedLocations?: ExpectedLocation[];
}

export interface Household {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  userId: string;
  onboardingCompleted?: boolean;
  members: HouseholdMember[];
}

// ============================================================================
// 5. Emergency Shelters & Hospitals
// ============================================================================

export interface Shelter {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
  contactNumber: string;
  status: 'ACTIVE' | 'NEAR_CAPACITY' | 'FULL' | 'CLOSED';
}

export interface ShelterOccupancy extends Shelter {
  expectedCount: number;
  occupancyPercentage: number;
  availableCapacity: number;
}

export interface Hospital {
  id: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  phone: string;
  totalBeds: number;
  availableBeds: number;
  icuBeds: number;
  icuAvailable: number;
  doctorCount: number;
  doctorsOnDuty: number;
  hasEmergencyUnit: boolean;
  hasTraumaCenter: boolean;
  hasOxygenSupply: boolean;
  hasBackupPower: boolean;
  distanceKm?: number;
  distance?: number;
  status?: string;
  specialities?: string[];
}

export interface EmergencyFacility {
  id: string;
  name: string;
  type: 'HOSPITAL' | 'FIRE_STATION' | 'POLICE_STATION' | 'CHECKPOINT';
  address: string;
  latitude: number;
  longitude: number;
  contactNumber: string;
}

// ============================================================================
// 6. Emergency Requests, SOS & Rescue Teams
// ============================================================================

export type WaterLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type EmergencyType = 'FLOOD' | 'MEDICAL' | 'TRAPPED' | 'STRUCTURAL_DANGER' | 'FIRE' | 'OTHER';
export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type RescueStatus = 'PENDING' | 'ACKNOWLEDGED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESCUED' | 'CANCELLED';
export type TeamStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';

export interface RescueRequest {
  id: string;
  householdMemberId?: string;
  citizenName: string;
  contactNumber: string;
  latitude: number;
  longitude: number;
  address?: string;
  peopleCount: number;
  waterLevel: WaterLevel;
  emergencyType: EmergencyType;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  rescueStatus: RescueStatus;
  conditions: string[];
  assignedTeamId?: string;
  assignedTeamName?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RescueTeam {
  id: string;
  name: string;
  type: string;
  leader: string;
  capability: string;
  capacity: number;
  currentLatitude: number;
  currentLongitude: number;
  status: TeamStatus;
  contactNumber: string;
}

// ============================================================================
// 7. Operational Analytics
// ============================================================================

export interface OperationalAnalyticsSummary {
  status: string;
  timestamp: string;
  disaster: {
    id: string;
    title: string;
    type: string;
    alertLevel: string;
    status: string;
  } | null;
  headcount: {
    totalExpected: number;
    confirmedSafe: number;
    inDistress: number;
    unaccounted: number;
    resolvedPercentage: number;
  };
  requests: {
    total: number;
    pending: number;
    assigned: number;
    safelyRescued: number;
    notFound: number;
    criticalPriority: number;
    highPriority: number;
    moderatePriority: number;
  };
  shelters: {
    totalShelters: number;
    totalCapacity: number;
    totalExpectedArrivals: number;
    remainingBuffer: number;
    occupancyRate: number;
    criticalSheltersCount: number;
    list: Array<{
      id: string;
      name: string;
      address: string;
      capacity: number;
      expectedArrivals: number;
      remainingCapacity: number;
      occupancyPercentage: number;
      status: string;
    }>;
  };
  demographics: {
    totalRegistered: number;
    children: number;
    elderly: number;
    adults: number;
    disabled: number;
  };
}

// ============================================================================
// 8. Notifications
// ============================================================================

export interface NotificationItem {
  id: string;
  userId: string;
  disasterId?: string;
  type: 'DISASTER_ALERT' | 'EXPECTED_LOCATION_REQUEST' | 'RECONFIRMATION' | 'SHELTER_UPDATE';
  message: string;
  status: 'UNREAD' | 'READ';
  createdAt: string;
  readAt?: string;
}
