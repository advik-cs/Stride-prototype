import React, { useState, useEffect } from 'react';
import { duringApi, RescueRequest, RescueTeam, RescueStatus } from '../../api/duringApi';
import { DisasterEvent } from '../../services/disasterService.ts';
import { User } from '../../services/authService.ts';
import { DuringTab } from '../layout/DashboardLayout.tsx';
import {
  LifeBuoy,
  Users,
  Clock,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  ShieldCheck,
  MapPin,
  ArrowRight,
  HelpCircle,
  X,
  Radio,
  Ban,
  Droplets,
  Activity,
  Check,
  Filter,
  Mic,
} from 'lucide-react';

interface RescueOperationsViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  onNavigateTab: (tab: DuringTab) => void;
}

export const RescueOperationsView: React.FC<RescueOperationsViewProps> = ({
  user,
  activeDisaster,
  onNavigateTab,
}) => {
  const [requests, setRequests] = useState<RescueRequest[]>([]);
  const [myRequests, setMyRequests] = useState<RescueRequest[]>([]);
  const [ownActiveRequest, setOwnActiveRequest] = useState<RescueRequest | null>(null);
  const [assignedMissions, setAssignedMissions] = useState<RescueRequest[]>([]);
  const [availableTeams, setAvailableTeams] = useState<RescueTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>('ALL');

  // Assign Team Modal state
  const [assignModalReq, setAssignModalReq] = useState<RescueRequest | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [user.role]);

  const loadData = async () => {
    try {
      if (user.role === 'CITIZEN') {
        // Clear operational queues so citizen state never stores other records
        setRequests([]);
        setAssignedMissions([]);
        setAvailableTeams([]);
        const activeSosId = localStorage.getItem('stride_active_sos_id');
        if (activeSosId) {
          try {
            const single = await duringApi.getRequestById(activeSosId);
            if (single && single.status !== 'CANCELLED') {
              setOwnActiveRequest(single);
              setMyRequests([single]);
            } else {
              setOwnActiveRequest(null);
              setMyRequests([]);
              localStorage.removeItem('stride_active_sos_id');
            }
          } catch {
            setOwnActiveRequest(null);
            setMyRequests([]);
          }
        } else {
          setOwnActiveRequest(null);
          setMyRequests([]);
        }
      } else if (user.role === 'RESCUER') {
        setOwnActiveRequest(null);
        const [all, missions] = await Promise.all([
          duringApi.getRankedRequests().catch(() => []),
          duringApi.getAssignedMissions().catch(() => []),
        ]);
        setRequests(all);
        setAssignedMissions(missions);
      } else {
        // AUTHORITY
        setOwnActiveRequest(null);
        const [all, teams] = await Promise.all([
          duringApi.getRankedRequests().catch(() => []),
          duringApi.getAvailableTeams().catch(() => []),
        ]);
        setRequests(all);
        setAvailableTeams(teams);
        if (teams.length > 0 && !selectedTeamId) {
          setSelectedTeamId(teams[0].id);
        }
      }
    } catch (e) {
      console.error('Error fetching rescue data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAssignModal = async (req: RescueRequest) => {
    setActionError(null);
    setAssignModalReq(req);
    try {
      const teams = await duringApi.getAvailableTeams();
      setAvailableTeams(teams);
      if (teams.length > 0) {
        setSelectedTeamId(teams[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssignTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalReq || !selectedTeamId) return;
    setAssignLoading(true);
    setActionError(null);
    try {
      await duringApi.assignTeam(assignModalReq.id, selectedTeamId);
      setAssignModalReq(null);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to assign rescue team.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleUpdateStatus = async (reqId: string, status: 'IN_PROGRESS' | 'RESCUED' | 'ACKNOWLEDGED' | 'CANCELLED') => {
    setActionError(null);
    try {
      if (status === 'IN_PROGRESS' || status === 'RESCUED') {
        await duringApi.updateMissionStatus(reqId, status);
      } else {
        await duringApi.updateAuthorityRequestStatus(reqId, status);
      }
      await loadData();
    } catch (err: any) {
      alert('Status update failed: ' + err.message);
    }
  };

  const handleCancelOwnRequest = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this emergency request?')) return;
    try {
      await duringApi.cancelRequest(id);
      localStorage.removeItem('stride_active_sos_id');
      setOwnActiveRequest(null);
      setMyRequests([]);
      await loadData();
    } catch (err: any) {
      alert('Cancellation failed: ' + err.message);
    }
  };

  const getStatusBadge = (status: RescueStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600" />
            Pending Assignment
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-900 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-purple-600" />
            Acknowledged
          </span>
        );
      case 'ASSIGNED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-900 flex items-center gap-1">
            <Users className="w-3 h-3 text-blue-600" />
            Team Assigned
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-900 flex items-center gap-1">
            <Radio className="w-3 h-3 text-indigo-600 animate-pulse" />
            En Route / In Progress
          </span>
        );
      case 'RESCUED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Safely Rescued
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-gray-200 text-gray-800 flex items-center gap-1">
            <Ban className="w-3 h-3 text-gray-600" />
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const getPriorityPill = (score: number, level: string) => {
    let bg = 'bg-red-600 text-white';
    if (level === 'HIGH') bg = 'bg-amber-600 text-white';
    if (level === 'MEDIUM') bg = 'bg-yellow-500 text-[#2F4156]';
    if (level === 'LOW') bg = 'bg-gray-500 text-white';

    return (
      <div className={`px-3 py-1 rounded-xl flex items-center gap-1.5 font-bold text-xs shadow-sm ${bg}`}>
        <span>Score: {score}</span>
        <span className="text-[10px] uppercase font-extrabold opacity-90">({level})</span>
      </div>
    );
  };

  const filteredRequests = requests.filter((r) => {
    if (filterPriority === 'ALL') return true;
    return r.priorityLevel === filterPriority;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {user.role === 'CITIZEN' ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider">
                Household Safety Telemetry
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight mt-1">
              Rescue & Emergency Assistance Status
            </h1>
            <p className="text-xs sm:text-sm font-medium text-[#567C8D] mt-1">
              Real-time safety telemetry and emergency dispatch updates for your registered household.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
              <span className="text-xs font-extrabold text-red-600 uppercase tracking-wider">
                Live Priority Triage Queue
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight mt-1">
              {user.role === 'AUTHORITY'
                ? 'Authority Emergency Dispatch Queue'
                : 'Field Rescue Operations & Missions'}
            </h1>
            <p className="text-sm font-medium text-[#567C8D] mt-1">
              Server-ranked dispatch queue ordered by calculated priority score (0-100) descending.
            </p>
          </div>
        )}

        {user.role === 'CITIZEN' && (
          <button
            type="button"
            onClick={() => onNavigateTab('safe')}
            className="w-full sm:w-auto px-4 py-3 min-h-[48px] rounded-2xl lg:rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <LifeBuoy className="w-4 h-4 text-white" />
            <span>{ownActiveRequest ? 'Update Status in "Are You Safe?"' : 'Are You Safe? / Request SOS'}</span>
          </button>
        )}
      </div>

      {/* CITIZEN VIEW: Safe Status Screen or Own Single Household Distress */}
      {user.role === 'CITIZEN' && (
        <div className="space-y-6">
          {ownActiveRequest ? (
            /* Single Household Active Distress Signal */
            <div className="bg-white rounded-3xl p-4 sm:p-6 lg:p-8 border border-red-200 shadow-sm space-y-5 lg:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 pb-4 sm:pb-5 border-b border-red-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-red-100 text-red-700">
                      Active Emergency Distress Call
                    </span>
                    <span className="text-xs text-[#567C8D] font-mono">
                      #{ownActiveRequest.id.slice(0, 8)}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                    Household Rescue Dispatch Status
                  </h2>
                  <p className="text-xs text-[#567C8D]">
                    Your distress beacon is active and monitored by disaster command centers.
                  </p>
                </div>
                <div>
                  {getStatusBadge(ownActiveRequest.status)}
                </div>
              </div>

              {/* Household Distress Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-[#F5EFEB]/60 border border-[#C8D9E6]/60 space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 text-[#2F4156] font-bold text-sm">
                    <MapPin className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>{ownActiveRequest.address}</span>
                  </div>
                  <p className="text-xs text-[#567C8D] pl-6 italic">
                    "{ownActiveRequest.description}"
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-[#C8D9E6]/40">
                    <span className="text-[#567C8D]">Emergency Type:</span>
                    <span className="font-bold text-red-600">{ownActiveRequest.emergencyType}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#567C8D]">Flood Water Level:</span>
                    <span className="font-bold text-[#2F4156]">{ownActiveRequest.waterLevel}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#F5EFEB]/60 border border-[#C8D9E6]/60 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#567C8D]">Household Members:</span>
                    <span className="font-bold text-[#2F4156]">{ownActiveRequest.peopleCount} individuals</span>
                  </div>
                  {(ownActiveRequest.childrenCount > 0 || ownActiveRequest.elderlyCount > 0 || ownActiveRequest.injuredCount > 0 || ownActiveRequest.disabledCount > 0) && (
                    <div className="text-[11px] text-[#567C8D] flex flex-wrap gap-2 pt-0.5">
                      {ownActiveRequest.childrenCount > 0 && <span className="px-2 py-0.5 rounded bg-white border border-[#C8D9E6]">Children: {ownActiveRequest.childrenCount}</span>}
                      {ownActiveRequest.elderlyCount > 0 && <span className="px-2 py-0.5 rounded bg-white border border-[#C8D9E6]">Elderly: {ownActiveRequest.elderlyCount}</span>}
                      {ownActiveRequest.injuredCount > 0 && <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-semibold">Injured: {ownActiveRequest.injuredCount}</span>}
                      {ownActiveRequest.disabledCount > 0 && <span className="px-2 py-0.5 rounded bg-white border border-[#C8D9E6]">Disabled: {ownActiveRequest.disabledCount}</span>}
                    </div>
                  )}
                  <div className="pt-2 border-t border-[#C8D9E6]/40">
                    <span className="text-[#567C8D] block mb-1">Assigned Rescue Unit:</span>
                    {ownActiveRequest.team ? (
                      <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-bold text-xs flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>{ownActiveRequest.team.name} ({ownActiveRequest.team.type})</span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                        <span>Disaster command center is allocating the nearest response squad...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions for Own Active Request */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-red-100">
                <button
                  type="button"
                  onClick={() => onNavigateTab('safe')}
                  className="w-full sm:w-auto px-4 py-3 min-h-[48px] sm:min-h-0 sm:py-2 rounded-xl bg-[#2F4156] hover:bg-[#1f2c3a] text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Update Status in "Are You Safe?"</span>
                </button>

                {ownActiveRequest.status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => handleCancelOwnRequest(ownActiveRequest.id)}
                    className="w-full sm:w-auto px-4 py-3 min-h-[48px] sm:min-h-0 sm:py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cancel Distress Call</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Reassuring Safe Card */
            <div className="p-5 sm:p-8 lg:p-10 rounded-3xl bg-white border border-[#C8D9E6] shadow-sm text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                  No Active Emergency Distress Calls
                </h2>
                <p className="text-xs sm:text-sm text-[#567C8D]">
                  Your household has not reported an active emergency.
                </p>
              </div>
              <p className="text-xs text-[#567C8D] max-w-lg mx-auto leading-relaxed">
                Your registered household is currently recorded as safe. If flood waters rise, structural damage occurs, or you require emergency evacuation assistance, click below to signal disaster response teams immediately.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('safe')}
                  className="w-full sm:w-auto px-6 py-3.5 min-h-[48px] rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition inline-flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <LifeBuoy className="w-4 h-4 text-white" />
                  <span>Are You Safe? / Request SOS</span>
                </button>
              </div>
            </div>
          )}

          {/* Emergency Helplines & Disaster Response Hotlines */}
          <div className="bg-white rounded-3xl p-4 sm:p-6 lg:p-8 border border-[#C8D9E6] shadow-sm space-y-4 sm:space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-red-600" />
                <h3 className="text-base font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                  Emergency Helplines & Disaster Response Hotlines
                </h3>
              </div>
              <p className="text-xs text-[#567C8D] mt-0.5">
                Direct 24/7 lines to state disaster command centers, medical dispatch, and rescue forces.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <a
                href="tel:112"
                className="p-3.5 sm:p-4 min-h-[64px] rounded-2xl bg-[#F5EFEB]/60 hover:bg-red-50/60 border border-[#C8D9E6]/80 hover:border-red-300 transition group flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                  112
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#2F4156] group-hover:text-red-700 transition">
                    National Emergency Helpline
                  </h4>
                  <p className="text-[11px] text-[#567C8D] mt-0.5">
                    Unified 24/7 police, fire, ambulance & disaster dispatch
                  </p>
                </div>
              </a>

              <a
                href="tel:1070"
                className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-blue-50/60 border border-[#C8D9E6]/80 hover:border-blue-300 transition group flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                  1070
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#2F4156] group-hover:text-blue-700 transition">
                    State Disaster Management (SDMA)
                  </h4>
                  <p className="text-[11px] text-[#567C8D] mt-0.5">
                    State Emergency Operations Center (SEOC) Control Room
                  </p>
                </div>
              </a>

              <a
                href="tel:1077"
                className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-blue-50/60 border border-[#C8D9E6]/80 hover:border-blue-300 transition group flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-[#2F4156] text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                  1077
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#2F4156] group-hover:text-[#1f2c3a] transition">
                    District Disaster Control Room
                  </h4>
                  <p className="text-[11px] text-[#567C8D] mt-0.5">
                    District Collectorate Emergency Operations Room (DEOC)
                  </p>
                </div>
              </a>

              <a
                href="tel:108"
                className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-emerald-50/60 border border-[#C8D9E6]/80 hover:border-emerald-300 transition group flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                  108
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#2F4156] group-hover:text-emerald-700 transition">
                    Emergency Medical Ambulance
                  </h4>
                  <p className="text-[11px] text-[#567C8D] mt-0.5">
                    Immediate trauma, patient transport and medical assistance
                  </p>
                </div>
              </a>

              <a
                href="tel:101"
                className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-amber-50/60 border border-[#C8D9E6]/80 hover:border-amber-300 transition group flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                  101
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#2F4156] group-hover:text-amber-700 transition">
                    Fire & Rescue Services
                  </h4>
                  <p className="text-[11px] text-[#567C8D] mt-0.5">
                    Flood boat rescue, structural evacuation and fire service
                  </p>
                </div>
              </a>

              <a
                href="tel:1091"
                className="p-4 rounded-2xl bg-[#F5EFEB]/60 hover:bg-purple-50/60 border border-[#C8D9E6]/80 hover:border-purple-300 transition group flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                  1091
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#2F4156] group-hover:text-purple-700 transition">
                    Women & Child Disaster Safety
                  </h4>
                  <p className="text-[11px] text-[#567C8D] mt-0.5">
                    Specialized distress protection and child safety helpline
                  </p>
                </div>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* RESCUER VIEW: Assigned missions specifically allocated to this unit */}
      {user.role === 'RESCUER' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-blue-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded bg-blue-100 text-blue-900">
                FIELD UNIT ASSIGNMENTS
              </span>
              <h2 className="text-lg font-bold text-[#2F4156] mt-1">
                Your Assigned Active Missions ({assignedMissions.length})
              </h2>
            </div>
          </div>

          {assignedMissions.length === 0 ? (
            <p className="text-xs text-[#567C8D] py-4">No missions currently dispatched to your unit.</p>
          ) : (
            <div className="space-y-4">
              {assignedMissions.map((m) => (
                <div
                  key={m.id}
                  className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {getPriorityPill(m.priorityScore, m.priorityLevel)}
                      {getStatusBadge(m.status)}
                      {m.source === 'VOICE' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1 shadow-sm">
                          <Mic className="w-3 h-3 text-blue-600" />
                          VOICE SOS
                        </span>
                      )}
                      {m.locationConflict && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1 shadow-sm">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Location Discrepancy
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-[#2F4156]">{m.address}</h4>
                    <p className="text-xs text-[#567C8D]">"{m.description}"</p>
                    <div className="text-[11px] text-[#567C8D] flex flex-wrap gap-3 pt-1">
                      <span>Citizen: <strong>{m.citizen?.name}</strong></span>
                      <span>Phone: <strong>{m.citizen?.phone}</strong></span>
                      <span>People: <strong>{m.peopleCount}</strong></span>
                      <span>Water Level: <strong>{m.waterLevel}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {m.status === 'ASSIGNED' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(m.id, 'IN_PROGRESS')}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>En Route</span>
                      </button>
                    )}
                    {m.status === 'IN_PROGRESS' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(m.id, 'RESCUED')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark Rescued</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AUTHORITY & RESCUER VIEW: Ranked Emergency Triage Queue */}
      {(user.role === 'AUTHORITY' || user.role === 'RESCUER') && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#C8D9E6] shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                All Emergency Triage Calls (Ranked Queue)
              </h3>
              <p className="text-xs text-[#567C8D]">
                Sorted by Backend Risk Algorithm (<strong className="text-red-600">priorityScore DESC</strong>, createdAt ASC).
              </p>
            </div>

            {/* Filter by Priority */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#567C8D]">Filter:</span>
              <div className="p-1 rounded-xl bg-[#F5EFEB] border border-[#C8D9E6] flex items-center text-xs font-semibold">
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setFilterPriority(lvl)}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      filterPriority === lvl
                        ? lvl === 'CRITICAL'
                          ? 'bg-red-600 text-white font-bold'
                          : 'bg-[#2F4156] text-white font-bold'
                        : 'text-[#567C8D] hover:text-[#2F4156]'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {filteredRequests.map((req) => {
              const isCritical = req.priorityLevel === 'CRITICAL';

              return (
                <div
                  key={req.id}
                  className={`p-5 sm:p-6 rounded-2xl border transition flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 ${
                    isCritical
                      ? 'bg-red-50/40 border-red-300 ring-1 ring-red-200'
                      : req.status === 'PENDING'
                      ? 'bg-amber-50/30 border-amber-200'
                      : 'bg-white border-[#C8D9E6]/70'
                  }`}
                >
                  {/* Left Details with Score */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-16 h-16 rounded-2xl bg-red-600 text-white flex flex-col items-center justify-center flex-shrink-0 shadow-md">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-red-200">SCORE</span>
                      <span className="text-2xl font-bold font-['Space_Grotesk',sans-serif] leading-none">
                        {req.priorityScore}
                      </span>
                      <span className="text-[8px] font-extrabold uppercase mt-0.5 text-red-100">
                        {req.priorityLevel}
                      </span>
                    </div>

                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-bold text-[#2F4156]">
                          {req.address}
                        </h4>
                        {getStatusBadge(req.status)}
                        {req.source === 'VOICE' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1 shadow-sm">
                            <Mic className="w-3 h-3 text-blue-600" />
                            VOICE SOS
                          </span>
                        )}
                        {req.locationConflict && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1 shadow-sm" title={req.spokenLocation ? `Spoken: ${req.spokenLocation}` : 'Location Discrepancy'}>
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Location Discrepancy {req.spokenLocation ? `(Spoken: ${req.spokenLocation})` : ''}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#2F4156] bg-white/90 p-2.5 rounded-xl border border-[#C8D9E6]/60 font-medium">
                        "{req.description}"
                      </p>

                      {/* Metadata row */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#567C8D] pt-1">
                        <span>Citizen: <strong>{req.citizen?.name || 'Citizen'}</strong> ({req.citizen?.phone || 'N/A'})</span>
                        <span>•</span>
                        <span>People: <strong>{req.peopleCount}</strong> (Injured: {req.injuredCount}, Disabled: {req.disabledCount})</span>
                        <span>•</span>
                        <span>Water: <strong className="text-red-600">{req.waterLevel}</strong></span>
                        <span>•</span>
                        <span>Type: <strong>{req.emergencyType}</strong></span>
                      </div>

                      {req.team && (
                        <div className="text-xs font-semibold text-blue-800 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 mt-2 inline-flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" />
                          <span>Assigned Squad: <strong>{req.team.name}</strong> ({req.team.type})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions for Authority & Rescuer */}
                  <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
                    {user.role === 'AUTHORITY' && req.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(req.id, 'ACKNOWLEDGED')}
                          className="px-3 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold transition cursor-pointer"
                        >
                          Acknowledge
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(req)}
                          className="px-4 py-2 rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5 text-[#C8D9E6]" />
                          <span>Assign Team</span>
                        </button>
                      </>
                    )}

                    {user.role === 'AUTHORITY' && req.status === 'ACKNOWLEDGED' && (
                      <button
                        type="button"
                        onClick={() => handleOpenAssignModal(req)}
                        className="px-4 py-2 rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-[#C8D9E6]" />
                        <span>Assign Team</span>
                      </button>
                    )}

                    {req.status === 'ASSIGNED' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(req.id, 'IN_PROGRESS')}
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>Deploy En Route</span>
                      </button>
                    )}

                    {req.status === 'IN_PROGRESS' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(req.id, 'RESCUED')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span>Mark Rescued</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assign Team Modal for Authority */}
      {assignModalReq && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#C8D9E6] shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-[#F5EFEB]">
              <div>
                <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                  Dispatch Rescue Unit
                </h3>
                <p className="text-xs text-[#567C8D]">
                  Priority Score: {assignModalReq.priorityScore} • {assignModalReq.address}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalReq(null)}
                className="p-1 rounded-lg text-[#567C8D] hover:text-[#2F4156] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
                {actionError}
              </div>
            )}

            <form onSubmit={handleAssignTeamSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                  Select Available Rescue Team
                </label>
                {availableTeams.length === 0 ? (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                    No teams currently marked as AVAILABLE. Responders may be on active missions.
                  </div>
                ) : (
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-semibold text-[#2F4156] outline-none"
                  >
                    {availableTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.type} - Capacity: {t.capacity})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="p-3 rounded-xl bg-[#F5EFEB] text-[11px] text-[#567C8D]">
                Assigning this unit will automatically transition the request to <strong>ASSIGNED</strong> and set the team's operational status to <strong>BUSY</strong>.
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAssignModalReq(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#567C8D] hover:text-[#2F4156] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignLoading || availableTeams.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {assignLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Dispatch</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
