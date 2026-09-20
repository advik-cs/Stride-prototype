import React, { useState, useEffect } from 'react';
import { householdService, Household, HouseholdMember } from '../../services/householdService.ts';
import { disasterService, DisasterEvent } from '../../services/disasterService.ts';
import { shelterService, Shelter } from '../../services/shelterService.ts';
import { User } from '../../services/authService.ts';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  Users,
  UserPlus,
  Home,
  Tent,
  MapPin,
  HelpCircle,
  Check,
  Trash2,
  Edit2,
  Save,
  X,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

interface HouseholdMembersViewProps {
  user: User;
  activeDisaster: DisasterEvent | null;
  isOnboarding?: boolean;
  onOnboardingComplete?: () => void;
}

export const HouseholdMembersView: React.FC<HouseholdMembersViewProps> = ({
  user,
  activeDisaster,
  isOnboarding = false,
  onOnboardingComplete,
}) => {
  const { t } = useLanguage();
  const [household, setHousehold] = useState<Household | null>(null);
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [expectedLocationsMap, setExpectedLocationsMap] = useState<
    Record<string, { type: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN'; shelterId?: string; otherCity?: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Address Editing State
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editAddressValue, setEditAddressValue] = useState('');
  const [editNameValue, setEditNameValue] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);

  // Add Member Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberAge, setNewMemberAge] = useState<number | ''>('');
  const [newMemberRel, setNewMemberRel] = useState('Spouse');
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    loadHouseholdAndPlans();
  }, [activeDisaster?.id]);

  const loadHouseholdAndPlans = async () => {
    setLoading(true);
    try {
      const [hh, sList, dList] = await Promise.all([
        householdService.getMyHousehold().catch(() => null),
        shelterService.getShelters().catch(() => []),
        disasterService.getDisasters().catch(() => []),
      ]);

      const effectiveDisaster = activeDisaster || (dList.length > 0 ? dList[0] : null);

      if (hh) {
        // Authoritatively bind the Self household member to the authenticated citizen's name
        const authName = user?.name?.trim();
        if (authName && Array.isArray(hh.members)) {
          let selfFound = false;
          hh.members = hh.members.map((m) => {
            if (m.relationship?.toLowerCase().includes('self')) {
              selfFound = true;
              return { ...m, name: authName };
            }
            return m;
          });
          if (!selfFound && hh.members.length === 0) {
            hh.members = [
              {
                id: `self-${Date.now()}`,
                householdId: hh.id,
                name: authName,
                age: 34,
                relationship: 'Self',
                category: 'ADULT',
              },
            ];
          }
        }

        setHousehold(hh);
        setEditAddressValue(hh.address || '');
        setEditNameValue(hh.name || '');

        // Pre-populate expected locations if disaster active
        if (effectiveDisaster) {
          const locs = await disasterService.getExpectedLocations(effectiveDisaster.id).catch(() => []);
          const map: Record<string, any> = {};
          locs.forEach((l: any) => {
            const memberId = l.householdMemberId || l.memberId;
            if (memberId) {
              map[memberId] = {
                type: l.expectedLocationType || l.expectedType || 'HOME',
                shelterId: l.shelterId,
                otherCity: l.otherCity,
              };
            }
          });

          // Fill defaults for members without record
          hh.members.forEach((m) => {
            if (!map[m.id]) {
              map[m.id] = { type: 'HOME' };
            }
          });
          setExpectedLocationsMap(map);
        }
      }
      setShelters(sList);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationTypeChange = (
    memberId: string,
    type: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN'
  ) => {
    setExpectedLocationsMap((prev) => {
      const current = prev[memberId] || {};
      const fallbackShelterId = current.shelterId || shelters[0]?.id;
      const fallbackOtherCity = current.otherCity || 'Outside Affected Area';

      return {
        ...prev,
        [memberId]: {
          ...current,
          type,
          shelterId: type === 'SHELTER' ? fallbackShelterId : undefined,
          otherCity: type === 'OTHER_CITY' ? fallbackOtherCity : undefined,
        },
      };
    });
  };

  const handleShelterSelect = (memberId: string, shelterId: string) => {
    setExpectedLocationsMap((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        type: 'SHELTER',
        shelterId,
      },
    }));
  };

  const handleOtherCityChange = (memberId: string, otherCity: string) => {
    setExpectedLocationsMap((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        type: 'OTHER_CITY',
        otherCity,
      },
    }));
  };

  const handleSaveDisasterPlan = async () => {
    let targetDisaster = activeDisaster;
    if (!targetDisaster) {
      const dList = await disasterService.getDisasters().catch(() => []);
      if (dList.length > 0) targetDisaster = dList[0];
    }

    if (!targetDisaster || !household) {
      alert('Disaster coordination scenario is loading. Please try again in a moment.');
      return;
    }

    setSavingPlan(true);
    setSaveSuccess(false);
    try {
      const plans = household.members.map((member) => {
        const data = expectedLocationsMap[member.id] || { type: 'HOME' };
        const rawType = data.type || 'HOME';
        const expectedLocationType: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN' =
          rawType === 'NOT_SURE' ? 'UNKNOWN' : rawType;

        const item: {
          memberId: string;
          householdMemberId: string;
          expectedType: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN';
          expectedLocationType: 'HOME' | 'SHELTER' | 'OTHER_CITY' | 'UNKNOWN';
          shelterId?: string;
          otherCity?: string;
        } = {
          memberId: member.id,
          householdMemberId: member.id,
          expectedType: expectedLocationType,
          expectedLocationType,
        };

        if (expectedLocationType === 'SHELTER') {
          const chosenShelterId = data.shelterId || shelters[0]?.id;
          if (!chosenShelterId) {
            throw new Error(`Please select a designated shelter for ${member.name}.`);
          }
          item.shelterId = chosenShelterId;
        } else if (expectedLocationType === 'OTHER_CITY') {
          const city = (data.otherCity || '').trim() || 'Outside Affected Area';
          item.otherCity = city;
        }

        return item;
      });

      console.log('[HouseholdMembersView] Saving disaster plans payload:', { locations: plans });
      await disasterService.setExpectedLocations(targetDisaster.id, plans);
      await householdService.completeOnboarding().catch(() => {});
      await loadHouseholdAndPlans();
      setSaveSuccess(true);

      if (onOnboardingComplete) {
        setTimeout(() => {
          onOnboardingComplete();
        }, 700);
      } else {
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      console.error('[HouseholdMembersView] Save disaster plans error:', err);
      alert('Failed to save disaster plans: ' + (err.message || err));
    } finally {
      setSavingPlan(false);
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!household || !editAddressValue.trim()) return;
    setSavingAddress(true);
    try {
      const updated = await householdService.updateHousehold(household.id, {
        address: editAddressValue.trim(),
        name: editNameValue.trim() || household.name,
      });
      setHousehold(updated);
      setIsEditingAddress(false);
    } catch (err: any) {
      alert(err.message || 'Failed to update household address.');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!household || !newMemberName.trim() || newMemberAge === '') return;
    setAddLoading(true);
    try {
      const ageNum = Number(newMemberAge);
      const newMember = await householdService.addMember(household.id, {
        name: newMemberName.trim(),
        age: ageNum,
        relationship: newMemberRel,
      });

      setHousehold((prev) =>
        prev
          ? {
              ...prev,
              members: [...prev.members, newMember],
            }
          : prev
      );

      setExpectedLocationsMap((prev) => ({
        ...prev,
        [newMember.id]: { type: 'HOME' },
      }));

      setShowAddModal(false);
      setNewMemberName('');
      setNewMemberAge('');
      setNewMemberRel('Spouse');
    } catch (err: any) {
      alert(err.message || 'Failed to add member.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!household) return;
    if (!confirm('Are you sure you want to remove this household member?')) return;

    try {
      await householdService.deleteMember(household.id, memberId);
      setHousehold((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.filter((m) => m.id !== memberId),
            }
          : prev
      );

      setExpectedLocationsMap((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    } catch (err: any) {
      alert('Failed to delete member: ' + err.message);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
            {t('household.title')}
          </h1>
          {isEditingAddress ? (
            <form onSubmit={handleSaveAddress} className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={editAddressValue}
                onChange={(e) => setEditAddressValue(e.target.value)}
                placeholder="Enter street address & ward"
                className="px-3 py-1.5 rounded-xl border border-[#C8D9E6] text-xs font-semibold text-[#2F4156] bg-white outline-none"
                required
              />
              <button
                type="submit"
                disabled={savingAddress}
                className="px-3 py-1.5 rounded-xl bg-[#2F4156] text-white text-xs font-bold hover:bg-[#1F2D3D]"
              >
                {savingAddress ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingAddress(false)}
                className="px-3 py-1.5 rounded-xl bg-white border border-[#C8D9E6] text-xs font-semibold text-[#567C8D]"
              >
                Cancel
              </button>
            </form>
          ) : (
            <p className="text-sm font-medium text-[#567C8D] mt-1 flex items-center gap-2">
              <span>Registered address: {household?.address || 'Your Registered Home'}</span>
              <button
                type="button"
                onClick={() => setIsEditingAddress(true)}
                className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                title="Edit address"
              >
                (Edit)
              </button>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-white border border-[#C8D9E6] hover:bg-[#F5EFEB] text-xs font-bold text-[#2F4156] transition flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-[#567C8D]" />
            <span>Add Member</span>
          </button>

          <button
            type="button"
            onClick={handleSaveDisasterPlan}
            disabled={savingPlan}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold transition flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50 ${
              isOnboarding ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#2F4156] hover:bg-[#1F2D3D]'
            }`}
          >
            {savingPlan ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#C8D9E6]" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4 text-emerald-300" />
            ) : (
              <Save className="w-4 h-4 text-[#C8D9E6]" />
            )}
            <span>
              {saveSuccess
                ? t('household.savedSuccess')
                : isOnboarding
                ? 'Save Plan to STRIDE & Continue'
                : t('household.savePlans')}
            </span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>
            Expected location plans synchronized successfully with municipal disaster coordination system.
          </span>
        </div>
      )}

      {/* Household Members Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {household?.members?.map((member) => {
          const plan = expectedLocationsMap[member.id] || { type: 'HOME' };

          return (
            <div
              key={member.id}
              className="bg-white rounded-3xl p-6 border border-[#C8D9E6]/70 shadow-sm hover:shadow-md transition flex flex-col justify-between"
            >
              {/* Member Profile Header */}
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#C8D9E6]/30 flex items-center justify-center font-bold text-[#2F4156] text-base">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#2F4156]">{member.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#567C8D]">{member.relationship}</span>
                        <span className="text-[10px] text-[#567C8D]">•</span>
                        <span className="text-xs text-[#567C8D]">{member.age} yrs</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        member.category === 'CHILD'
                          ? 'bg-amber-100 text-amber-800'
                          : member.category === 'ELDERLY'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-[#567C8D]/15 text-[#2F4156]'
                      }`}
                    >
                      {member.category}
                    </span>
                    {member.relationship !== 'Self' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMember(member.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 4 Disaster Location Choices */}
                <div className="mt-6">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#567C8D] mb-2.5">
                    Expected Disaster Location Plan
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Option 1: Registered Home */}
                    <button
                      type="button"
                      onClick={() => handleLocationTypeChange(member.id, 'HOME')}
                      className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                        plan.type === 'HOME'
                          ? 'bg-[#2F4156] text-white border-[#2F4156] shadow-sm'
                          : 'bg-[#F5EFEB]/70 text-[#2F4156] border-[#C8D9E6]/70 hover:bg-[#F5EFEB]'
                      }`}
                    >
                      <Home
                        className={`w-4 h-4 ${plan.type === 'HOME' ? 'text-[#C8D9E6]' : 'text-[#567C8D]'}`}
                      />
                      <span className="text-xs font-bold">{t('household.planHome')}</span>
                    </button>

                    {/* Option 2: Designated Shelter */}
                    <button
                      type="button"
                      onClick={() => handleLocationTypeChange(member.id, 'SHELTER')}
                      className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                        plan.type === 'SHELTER'
                          ? 'bg-[#059669] text-white border-[#059669] shadow-sm'
                          : 'bg-[#F5EFEB]/70 text-[#2F4156] border-[#C8D9E6]/70 hover:bg-[#F5EFEB]'
                      }`}
                    >
                      <Tent
                        className={`w-4 h-4 ${plan.type === 'SHELTER' ? 'text-white' : 'text-[#059669]'}`}
                      />
                      <span className="text-xs font-bold">{t('household.planShelter')}</span>
                    </button>

                    {/* Option 3: Another Location */}
                    <button
                      type="button"
                      onClick={() => handleLocationTypeChange(member.id, 'OTHER_CITY')}
                      className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                        plan.type === 'OTHER_CITY'
                          ? 'bg-[#567C8D] text-white border-[#567C8D] shadow-sm'
                          : 'bg-[#F5EFEB]/70 text-[#2F4156] border-[#C8D9E6]/70 hover:bg-[#F5EFEB]'
                      }`}
                    >
                      <MapPin
                        className={`w-4 h-4 ${plan.type === 'OTHER_CITY' ? 'text-white' : 'text-[#567C8D]'}`}
                      />
                      <span className="text-xs font-bold">{t('household.planOtherCity')}</span>
                    </button>

                    {/* Option 4: I Don't Know Yet */}
                    <button
                      type="button"
                      onClick={() => handleLocationTypeChange(member.id, 'UNKNOWN')}
                      className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                        plan.type === 'UNKNOWN'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-[#F5EFEB]/70 text-[#2F4156] border-[#C8D9E6]/70 hover:bg-[#F5EFEB]'
                      }`}
                    >
                      <HelpCircle
                        className={`w-4 h-4 ${plan.type === 'UNKNOWN' ? 'text-white' : 'text-amber-600'}`}
                      />
                      <span className="text-xs font-bold">{t('household.planUnknown')}</span>
                    </button>
                  </div>

                  {/* Sub-inputs when Shelter or Other City is chosen */}
                  {plan.type === 'SHELTER' && (
                    <div className="mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                      <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                        Select Designated Shelter:
                      </label>
                      <select
                        value={plan.shelterId || ''}
                        onChange={(e) => handleShelterSelect(member.id, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 text-xs font-semibold text-[#2F4156] outline-none"
                      >
                        {shelters.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} (Cap: {s.capacity})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {plan.type === 'OTHER_CITY' && (
                    <div className="mt-3 p-3 rounded-2xl bg-blue-50 border border-blue-200">
                      <label className="block text-[11px] font-bold text-[#2F4156] mb-1">
                        Destination City / Relative Address:
                      </label>
                      <input
                        type="text"
                        value={plan.otherCity || ''}
                        onChange={(e) => handleOtherCityChange(member.id, e.target.value)}
                        placeholder="e.g. Bangalore, Relative's Residence"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-blue-300 text-xs font-medium text-[#2F4156] outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Status footnote */}
              <div className="mt-6 pt-3 border-t border-[#F5EFEB] flex items-center justify-between text-[11px] text-[#567C8D]">
                <span>Status: Configured for {activeDisaster?.title || 'Active Scenario'}</span>
                <span className="font-bold text-[#2F4156]">
                  {plan.type.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#C8D9E6] shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-[#F5EFEB]">
              <h3 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                Add Household Member
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-[#567C8D] hover:text-[#2F4156]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="e.g. Priya Kumar"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none focus:border-[#567C8D]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2F4156] mb-1">Age</label>
                  <input
                    type="number"
                    required
                    min="0"
                    max="120"
                    value={newMemberAge}
                    onChange={(e) => setNewMemberAge(e.target.value ? parseInt(e.target.value, 10) : '')}
                    placeholder="e.g. 34"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none focus:border-[#567C8D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2F4156] mb-1">
                    Relationship
                  </label>
                  <select
                    value={newMemberRel}
                    onChange={(e) => setNewMemberRel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8D9E6] text-xs font-medium text-[#2F4156] outline-none focus:border-[#567C8D]"
                  >
                    <option value="Spouse">Spouse</option>
                    <option value="Child">Child</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Relative">Relative</option>
                    <option value="Roommate">Roommate</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F5EFEB] text-[11px] text-[#567C8D]">
                Category will be calculated automatically: Age &lt;18 (Child), 18-64 (Adult), 65+ (Elderly).
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
                  disabled={addLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#2F4156] hover:bg-[#1F2D3D] text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  {addLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Member</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
