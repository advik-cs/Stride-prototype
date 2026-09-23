import React, { useState, useEffect } from 'react';
import { shelterService, ShelterOccupancy } from '../../services/shelterService.ts';
import { householdService, Household } from '../../services/householdService.ts';
import { disasterService, DisasterEvent } from '../../services/disasterService.ts';
import { User } from '../../services/authService.ts';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  Tent,
  MapPin,
  Phone,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Plus,
  Loader2,
  X,
  Clock,
} from 'lucide-react';
import { formatLastUpdated } from '../../offline/offlineDateUtils.ts';
import { useConnectivityStatus } from '../../offline/useConnectivityStatus.ts';

interface ShelterSelectionViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  isOffline?: boolean;
}

export function cleanShelterName(name: string): string {
  return (name || '')
    .replace(/\s*\((?:demo\s*[^)]*|demo)\)/gi, '')
    .replace(/\s*-\s*demo/gi, '')
    .trim();
}

export const ShelterSelectionView: React.FC<ShelterSelectionViewProps> = ({
  user,
  activeDisaster,
  isOffline: propOffline,
}) => {
  const { t } = useLanguage();
  const { isOffline: hookOffline } = useConnectivityStatus();
  const [shelters, setShelters] = useState<ShelterOccupancy[]>([]);
  const [shelterMeta, setShelterMeta] = useState<{ source?: 'server' | 'cache' | 'none'; lastSyncedAt?: string; isStale?: boolean }>({});

  const isOffline = propOffline !== undefined
    ? propOffline
    : (hookOffline || (typeof navigator !== 'undefined' && !navigator.onLine) || shelterMeta.source === 'cache');
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigningShelterId, setAssigningShelterId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Add Shelter Modal for Rescuer
  const [showAddModal, setShowAddModal] = useState(false);
  const [newShelterName, setNewShelterName] = useState('');
  const [newShelterAddress, setNewShelterAddress] = useState('');
  const [newShelterCapacity, setNewShelterCapacity] = useState<number | ''>(30);
  const [newShelterContact, setNewShelterContact] = useState('');
  const [newShelterLat, setNewShelterLat] = useState<number | ''>(13.08);
  const [newShelterLng, setNewShelterLng] = useState<number | ''>(80.27);
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    loadSheltersAndHousehold();
  }, [activeDisaster?.id]);

  const loadSheltersAndHousehold = async () => {
    setLoading(true);
    try {
      const [res, hh] = await Promise.all([
        shelterService.getSheltersWithMeta(activeDisaster?.id),
        householdService.getMyHousehold().catch(() => null),
      ]);
      setShelters(res.shelters);
      setShelterMeta({ source: res.source, lastSyncedAt: res.lastSyncedAt, isStale: res.isStale });
      setHousehold(hh);
    } catch (e) {
      console.error('Error loading shelters in ShelterSelectionView:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectShelterForHousehold = async (shelterId: string) => {
    if (!activeDisaster || !household) return;
    setAssigningShelterId(shelterId);
    try {
      // Set all household members to this shelter
      const payload = household.members.map((m) => ({
        householdMemberId: m.id,
        expectedLocationType: 'SHELTER' as const,
        shelterId,
      }));

      await disasterService.setExpectedLocations(activeDisaster.id, payload);
      // Reload updated occupancies
      const updated = await shelterService.getShelterOccupancy(activeDisaster.id);
      setShelters(updated);
    } catch (err: any) {
      alert('Failed to select shelter: ' + err.message);
    } finally {
      setAssigningShelterId(null);
    }
  };

  const handleCreateShelter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShelterName.trim() || !newShelterCapacity) return;
    setCreateLoading(true);
    try {
      await shelterService.createShelter({
        name: newShelterName.trim(),
        address: newShelterAddress.trim() || 'Coastal Zone Relief Outpost',
        capacity: Number(newShelterCapacity),
        contactNumber: newShelterContact.trim() || '+91 44 2498 1000',
        latitude: Number(newShelterLat) || 13.08,
        longitude: Number(newShelterLng) || 80.27,
      });

      if (activeDisaster) {
        const updated = await shelterService.getShelterOccupancy(activeDisaster.id);
        setShelters(updated);
      }
      setShowAddModal(false);
      setNewShelterName('');
    } catch (err: any) {
      alert(err.message || 'Failed to create shelter.');
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredShelters = shelters.filter((s) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'OVER_CAPACITY') {
      return s.status === 'OVER_CAPACITY' || s.status === 'FULL';
    }
    return s.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {t('shelters.available')}
          </span>
        );
      case 'NEAR_CAPACITY':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            {t('shelters.nearCapacity')}
          </span>
        );
      case 'OVER_CAPACITY':
      case 'FULL':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            {t('shelters.overCapacity')}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
            {t('navigation.shelterInfo')}
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[#567C8D] mt-1">
            {user.role === 'AUTHORITY'
              ? 'Real-time shelter capacities, operational status, and remaining capacity calculations.'
              : 'Designated relief centers, address details, and operational status directory.'}
          </p>
          {isOffline && shelterMeta.lastSyncedAt && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-full text-xs font-medium">
              <Clock className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
              <span>{formatLastUpdated(shelterMeta.lastSyncedAt, shelterMeta.isStale, true)}</span>
              <span className="text-amber-600">· Occupancy reflects the last saved update and may have changed.</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {/* Status Filter Tabs */}
          <div className="p-1 rounded-xl bg-white border border-[#C8D9E6] flex items-center text-xs font-semibold overflow-x-auto no-scrollbar max-w-full flex-shrink-0">
            {['ALL', 'AVAILABLE', 'NEAR_CAPACITY', 'OVER_CAPACITY'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-2 sm:py-1.5 min-h-[38px] whitespace-nowrap rounded-lg transition cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-[#2F4156] text-white shadow-sm font-bold'
                    : 'text-[#567C8D] hover:text-[#2F4156]'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          {user.role === 'RESCUER' && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm flex-shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#C8D9E6]" />
              <span>Add Shelter</span>
            </button>
          )}
        </div>
      </div>

      {/* Shelter Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-[#C8D9E6]">
          <Loader2 className="w-8 h-8 animate-spin text-[#567C8D] mb-2" />
          <p className="text-xs font-semibold text-[#567C8D]">Loading designated shelters...</p>
        </div>
      ) : filteredShelters.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-[#C8D9E6] p-8">
          <Tent className="w-12 h-12 text-[#567C8D] mx-auto mb-3 opacity-40" />
          <h3 className="text-lg font-bold text-[#2F4156]">
            {typeof navigator !== 'undefined' && !navigator.onLine
              ? 'No Cached Shelters Available'
              : 'No shelters found'}
          </h3>
          <p className="text-xs text-[#567C8D] mt-1">
            {typeof navigator !== 'undefined' && !navigator.onLine
              ? 'No saved shelter data is available on this device yet. Connect to the internet to load and cache designated emergency shelters.'
              : statusFilter === 'ALL'
              ? 'No registered shelters in this region.'
              : `No shelters currently marked as ${statusFilter.replace('_', ' ')}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredShelters.map((shelter) => {
            const isOverCapacity = shelter.status === 'OVER_CAPACITY' || shelter.remainingCapacity < 0;
            const isNearCapacity = shelter.status === 'NEAR_CAPACITY';

            return (
              <div
                key={shelter.id}
                className={`bg-white rounded-3xl p-5 sm:p-6 border shadow-sm hover:shadow-md transition flex flex-col justify-between ${
                  isOverCapacity
                    ? 'border-red-300 ring-1 ring-red-200'
                    : isNearCapacity
                    ? 'border-amber-300'
                    : 'border-[#C8D9E6]/70'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-11 h-11 rounded-2xl bg-[#567C8D]/15 flex items-center justify-center text-[#2F4156] flex-shrink-0">
                      <Tent className="w-5 h-5" />
                    </div>
                    {getStatusBadge(shelter.status)}
                  </div>

                  <h3 className="text-base font-bold text-[#2F4156] mt-4 leading-tight">
                    {cleanShelterName(shelter.name)}
                  </h3>
                  <p className="text-xs text-[#567C8D] mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[#567C8D]" />
                    <span className="line-clamp-1">{shelter.address}</span>
                  </p>

                  {/* Capacity Progress Bar */}
                  <div className="mt-4 sm:mt-5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-[#567C8D]">
                        {shelterMeta.source === 'cache' ? 'Occupancy Trend (Cached Snapshot)' : 'Occupancy Trend'}
                      </span>
                      <span
                        className={
                          shelter.hasOccupancyData === false || shelter.occupancyUnavailable
                            ? 'text-[#567C8D]'
                            : isOverCapacity
                            ? 'text-red-600'
                            : isNearCapacity
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }
                      >
                        {shelter.hasOccupancyData === false || shelter.occupancyUnavailable
                          ? '—'
                          : `${Math.min(100, Math.round(shelter.occupancyPercentage))}% Full`}
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-[#F5EFEB] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOverCapacity
                            ? 'bg-red-600'
                            : isNearCapacity
                            ? 'bg-amber-500'
                            : 'bg-emerald-600'
                        }`}
                        style={{
                          width: `${shelter.hasOccupancyData === false || shelter.occupancyUnavailable ? 0 : Math.min(100, Math.max(0, shelter.occupancyPercentage))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Capacity & Arrivals Grid */}
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-[#F5EFEB] text-center">
                    <div className="p-2 sm:p-2.5 rounded-xl bg-[#F5EFEB]/50">
                      <span className="text-[10px] font-extrabold uppercase text-[#567C8D] block">
                        Total Cap
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-[#2F4156]">
                        {shelter.capacity}
                      </span>
                    </div>

                    <div className="p-2 sm:p-2.5 rounded-xl bg-[#F5EFEB]/50">
                      <span className="text-[10px] font-extrabold uppercase text-[#567C8D] block">
                        Expected
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-[#2F4156]">
                        {shelter.hasOccupancyData === false || shelter.occupancyUnavailable
                          ? '—'
                          : (shelter.expectedArrivals ?? 0)}
                      </span>
                    </div>

                    <div
                      className={`p-2 sm:p-2.5 rounded-xl ${
                        isOverCapacity
                          ? 'bg-red-50 text-red-700'
                          : isNearCapacity
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      <span className="text-[10px] font-extrabold uppercase block opacity-80">
                        Remaining
                      </span>
                      <span className="text-xs sm:text-sm font-bold">
                        {shelter.hasOccupancyData === false || shelter.occupancyUnavailable
                          ? shelter.capacity
                          : (shelter.remainingCapacity < 0 ? 'NIL' : shelter.remainingCapacity)}
                      </span>
                    </div>
                  </div>

                  {/* Offline Shelter Capacity Warning */}
                  {isOffline && (
                    <div
                      data-testid="offline-shelter-capacity-warning"
                      className="mt-3 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-950 flex items-center justify-center gap-2 text-xs font-semibold shadow-sm text-center"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                      <span>Offline! Unable to update Shelter Capacity</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 sm:mt-5 pt-3 sm:pt-3.5 border-t border-[#F5EFEB]">
                  <div className="flex items-center justify-between text-xs text-[#567C8D]">
                    <a
                      href={`tel:${shelter.contactNumber}`}
                      className="inline-flex items-center gap-1.5 font-medium min-h-[44px] py-1 text-[#567C8D] hover:text-[#2F4156] transition"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#567C8D] flex-shrink-0" />
                      <span>{shelter.contactNumber}</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Shelter Modal (for Rescuer) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#C8D9E6] shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-[#F5EFEB]">
              <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                Add Designated Shelter
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-[#567C8D] hover:text-[#2F4156]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateShelter} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                  Shelter Center Name
                </label>
                <input
                  type="text"
                  required
                  value={newShelterName}
                  onChange={(e) => setNewShelterName(e.target.value)}
                  placeholder="e.g. South District Gymnasium"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2F4156] mb-1">Address</label>
                <input
                  type="text"
                  required
                  value={newShelterAddress}
                  onChange={(e) => setNewShelterAddress(e.target.value)}
                  placeholder="e.g. 55 Stadium Road"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                    Capacity (People)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newShelterCapacity}
                    onChange={(e) =>
                      setNewShelterCapacity(e.target.value ? parseInt(e.target.value, 10) : '')
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={newShelterContact}
                    onChange={(e) => setNewShelterContact(e.target.value)}
                    placeholder="+91 44 2498 1000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#567C8D] hover:text-[#2F4156]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  {createLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Shelter</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
