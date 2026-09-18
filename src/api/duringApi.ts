import { DURING_API_BASE_URL, ApiError } from './config';

/**
 * Standard HTTP helper for DURING Backend
 */
async function duringRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token =
    localStorage.getItem('stride_during_token') ||
    localStorage.getItem('stride_token') ||
    localStorage.getItem('stride_before_token');
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${DURING_API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = json?.error?.message || json?.message || json?.error || `Request failed with status ${res.status}`;
      throw new ApiError(msg, res.status, json?.error?.details || json?.details);
    }

    // Unpack { success: true, data: ... }
    return (json && json.data !== undefined ? json.data : json) as T;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || 'Network communication failure with DURING backend.', 0);
  }
}

export type WaterLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type EmergencyType = 'FLOOD' | 'MEDICAL' | 'TRAPPED' | 'STRUCTURAL_DANGER' | 'FIRE' | 'OTHER';
export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type RescueStatus = 'PENDING' | 'ACKNOWLEDGED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESCUED' | 'CANCELLED';
export type TeamStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';

export interface DuringUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'CITIZEN' | 'AUTHORITY' | 'RESCUER';
  teamId?: string | null;
  team?: RescueTeam | null;
  createdAt?: string;
}

export interface RescueTeam {
  id: string;
  name: string;
  type: string;
  capacity: number;
  currentLatitude: number;
  currentLongitude: number;
  status: TeamStatus;
  contactNumber?: string;
  members?: Array<{ id: string; name: string; phone?: string }>;
}

export interface PriorityBreakdown {
  criticalMedical?: number;
  injured?: number;
  children?: number;
  elderly?: number;
  disabled?: number;
  peopleCount?: number;
  waterLevel?: number;
  trappedOrStructural?: number;
}

export interface RescueRequest {
  id: string;
  citizenId: string;
  latitude: number;
  longitude: number;
  address: string;
  description: string;
  peopleCount: number;
  childrenCount: number;
  elderlyCount: number;
  disabledCount: number;
  injuredCount: number;
  criticalMedicalNeed: boolean;
  waterLevel: WaterLevel;
  emergencyType: EmergencyType;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  status: RescueStatus;
  priorityBreakdown?: PriorityBreakdown;
  teamId?: string | null;
  team?: RescueTeam | null;
  citizen?: { id: string; name: string; phone?: string };
  assignedById?: string | null;
  assignedAt?: string | null;
  rescuedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  source?: 'VOICE' | 'MANUAL';
  spokenLocation?: string;
  locationConflict?: boolean;
}

export interface MapRescueRequestMarker {
  id: string;
  latitude: number;
  longitude: number;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  status: RescueStatus;
  peopleCount: number;
  emergencyType: EmergencyType;
  waterLevel: WaterLevel;
  shortDescription: string;
  address: string;
  createdAt: string;
  assignedTeam?: {
    id: string;
    name: string;
    type: string;
    status: string;
    latitude?: number;
    longitude?: number;
    contactNumber?: string;
  } | null;
}

export interface VoiceAssistantResponse {
  transcript?: string;
  mode: 'ASSIST' | 'ASSESS' | 'EMERGENCY';
  intent: string;
  assistantResponse: string;
  extractedInformation: {
    peopleCount?: number;
    childrenCount?: number;
    elderlyCount?: number;
    disabledCount?: number;
    injuredCount?: number;
    criticalMedicalNeed?: boolean;
    waterLevel?: WaterLevel;
    emergencyType?: EmergencyType;
    conditions?: string[];
    spokenLocation?: string;
  };
  existingIncidentFacts?: {
    peopleCount?: number;
    childrenCount?: number;
    elderlyCount?: number;
    disabledCount?: number;
    injuredCount?: number;
    criticalMedicalNeed?: boolean;
    waterLevel?: WaterLevel;
    emergencyType?: EmergencyType;
    conditions?: string[];
    spokenLocation?: string;
  };
  uncertainInformation: string[];
  missingInformation: string[];
  questionTarget?: string;
  shouldCreateOrUpdateSos: boolean;
  locationConflict?: boolean;
  activeRequest?: RescueRequest | null;
  isFallbackExtractor?: boolean;
  sessionId?: string;
  clientRequestId?: string;
}

export const duringApi = {
  // Authentication
  async register(data: {
    name: string;
    email: string;
    phone?: string;
    password?: string;
    role?: 'CITIZEN' | 'AUTHORITY' | 'RESCUER';
    teamId?: string;
  }) {
    return duringRequest<{ user: DuringUser; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        password: data.password || 'Citizen123!',
        role: data.role || 'CITIZEN',
      }),
    });
  },

  async login(data: { email: string; password?: string }) {
    return duringRequest<{ user: DuringUser; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        password: data.password || 'Citizen123!',
      }),
    });
  },

  async getMe() {
    return duringRequest<{ user: DuringUser }>('/auth/me');
  },

  // Citizen SOS Operations
  async submitRescueRequest(data: {
    latitude: number;
    longitude: number;
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
  }): Promise<RescueRequest> {
    return duringRequest<RescueRequest>('/rescue-requests', {
      method: 'POST',
      body: JSON.stringify({
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        address: data.address.trim(),
        description: data.description.trim(),
        peopleCount: Math.max(1, Number(data.peopleCount) || 1),
        childrenCount: Math.max(0, Number(data.childrenCount) || 0),
        elderlyCount: Math.max(0, Number(data.elderlyCount) || 0),
        disabledCount: Math.max(0, Number(data.disabledCount) || 0),
        injuredCount: Math.max(0, Number(data.injuredCount) || 0),
        criticalMedicalNeed: !!data.criticalMedicalNeed,
        waterLevel: data.waterLevel || 'MEDIUM',
        emergencyType: data.emergencyType || 'FLOOD',
      }),
    });
  },

  async getMyRequests(): Promise<RescueRequest[]> {
    return duringRequest<RescueRequest[]>('/rescue-requests/my');
  },

  async getRequestById(id: string): Promise<RescueRequest> {
    return duringRequest<RescueRequest>(`/rescue-requests/${id}`);
  },

  async cancelRequest(id: string): Promise<RescueRequest> {
    return duringRequest<RescueRequest>(`/rescue-requests/${id}/cancel`, {
      method: 'PATCH',
    });
  },

  // STRIDE Voice Emergency AI Assistant (Text fallback / Direct transcript)
  async voiceEmergencyChat(data: {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentLocation?: { latitude: number; longitude: number };
    activeRequestId?: string;
    sessionId?: string;
    clientRequestId?: string;
  }): Promise<VoiceAssistantResponse> {
    return duringRequest<VoiceAssistantResponse>('/voice/emergency-chat', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // STRIDE Voice Emergency AI Assistant (Audio recording upload via MediaRecorder)
  async voiceEmergencyAudio(data: {
    audioBlob: Blob;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentLocation?: { latitude: number; longitude: number };
    activeRequestId?: string;
    sessionId?: string;
    clientRequestId?: string;
  }): Promise<VoiceAssistantResponse & { transcript: string }> {
    const formData = new FormData();
    formData.append('audio', data.audioBlob, 'recording.webm');
    if (data.sessionId) {
      formData.append('sessionId', data.sessionId);
    }
    if (data.clientRequestId) {
      formData.append('clientRequestId', data.clientRequestId);
    }
    if (data.history && data.history.length > 0) {
      formData.append('history', JSON.stringify(data.history));
    }
    if (data.currentLocation) {
      formData.append('currentLocation', JSON.stringify(data.currentLocation));
    }
    if (data.activeRequestId) {
      formData.append('activeRequestId', data.activeRequestId);
    }

    return duringRequest<VoiceAssistantResponse & { transcript: string }>('/voice/emergency-audio', {
      method: 'POST',
      body: formData,
    });
  },

  // Authority Dispatch Operations
  async getRankedRequests(): Promise<RescueRequest[]> {
    return duringRequest<RescueRequest[]>('/authority/rescue-requests/ranked');
  },

  async getMapRequests(): Promise<MapRescueRequestMarker[]> {
    return duringRequest<MapRescueRequestMarker[]>('/authority/map/rescue-requests');
  },

  async getRequestsFiltered(params: {
    status?: string;
    priorityLevel?: string;
    emergencyType?: string;
    page?: number;
    limit?: number;
  }): Promise<{ requests: RescueRequest[]; total: number; page: number; limit: number }> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.priorityLevel) query.set('priorityLevel', params.priorityLevel);
    if (params.emergencyType) query.set('emergencyType', params.emergencyType);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    return duringRequest(`/authority/rescue-requests?${query.toString()}`);
  },

  async getRequestDetails(id: string): Promise<RescueRequest> {
    return duringRequest<RescueRequest>(`/authority/rescue-requests/${id}`);
  },

  async assignTeam(requestId: string, teamId: string): Promise<{ id: string; status: RescueStatus; teamId: string; team: RescueTeam }> {
    return duringRequest(`/authority/rescue-requests/${requestId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ teamId }),
    });
  },

  async updateAuthorityRequestStatus(requestId: string, status: 'ACKNOWLEDGED' | 'CANCELLED'): Promise<RescueRequest> {
    return duringRequest<RescueRequest>(`/authority/rescue-requests/${requestId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async getTeamRecommendations(requestId: string): Promise<any[]> {
    return duringRequest<any[]>(`/authority/teams/recommendations/${requestId}`);
  },

  // Rescue Teams
  async getTeams(): Promise<RescueTeam[]> {
    return duringRequest<RescueTeam[]>('/teams');
  },

  async getAvailableTeams(): Promise<RescueTeam[]> {
    return duringRequest<RescueTeam[]>('/teams/available');
  },

  async createTeam(data: Partial<RescueTeam>): Promise<RescueTeam> {
    return duringRequest<RescueTeam>('/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTeamStatus(teamId: string, status: TeamStatus): Promise<RescueTeam> {
    return duringRequest<RescueTeam>(`/teams/${teamId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async updateTeamLocation(teamId: string, latitude: number, longitude: number): Promise<RescueTeam> {
    return duringRequest<RescueTeam>(`/teams/${teamId}/location`, {
      method: 'PATCH',
      body: JSON.stringify({ latitude, longitude }),
    });
  },

  // Rescuer Mission Execution
  async getAssignedMissions(): Promise<RescueRequest[]> {
    return duringRequest<RescueRequest[]>('/rescuer/assignments');
  },

  async getMissionDetails(id: string): Promise<RescueRequest> {
    return duringRequest<RescueRequest>(`/rescuer/assignments/${id}`);
  },

  async updateMissionStatus(requestId: string, status: 'IN_PROGRESS' | 'RESCUED'): Promise<RescueRequest> {
    return duringRequest<RescueRequest>(`/rescuer/assignments/${requestId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async updateRescuerLocation(latitude: number, longitude: number): Promise<any> {
    return duringRequest<any>('/rescuer/location', {
      method: 'PATCH',
      body: JSON.stringify({ latitude, longitude }),
    });
  },
};
