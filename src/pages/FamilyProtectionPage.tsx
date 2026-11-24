import React, { useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Shield, Trash2, UserCheck } from 'lucide-react';
import { runFamilyProtectionAgent } from '../agents/familyProtectionAgent.ts';
import { runVerificationAgent } from '../agents/verificationAgent.ts';
import { useVayu } from '../context/VayuContext.tsx';
import type { HouseholdMemberGroup, HouseholdProfile } from '../types/airQuality.ts';

export const FamilyProtectionPage: React.FC = () => {
  const { dataset, preferences, profiles, addProfile, updateProfile, deleteProfile, location } = useVayu();

  const [label, setLabel] = useState('');
  const [group, setGroup] = useState<HouseholdMemberGroup>('adult');
  const [hasSensitivity, setHasSensitivity] = useState(false);
  const [sensitivityNote, setSensitivityNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const familyResult = useMemo(
    () => runFamilyProtectionAgent(dataset, profiles, preferences.preferredScale),
    [dataset, profiles, preferences.preferredScale],
  );

  const verification = useMemo(
    () =>
      runVerificationAgent({
        dataset,
        agentResults: [familyResult],
        preferredScale: preferences.preferredScale,
      }),
    [dataset, familyResult, preferences.preferredScale],
  );

  const resetForm = () => {
    setLabel('');
    setGroup('adult');
    setHasSensitivity(false);
    setSensitivityNote('');
    setEditingId(null);
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setFormError('Please enter a name or household label (at least 2 characters).');
      return;
    }

    if (editingId) {
      updateProfile(editingId, {
        label: trimmed,
        group,
        hasRespiratorySensitivity: hasSensitivity,
        sensitivityNote: hasSensitivity ? sensitivityNote.trim().slice(0, 120) : '',
      });
    } else {
      addProfile({
        label: trimmed,
        group,
        hasRespiratorySensitivity: hasSensitivity,
        sensitivityNote: hasSensitivity ? sensitivityNote.trim().slice(0, 120) : '',
      });
    }
    resetForm();
  };

  const startEdit = (p: HouseholdProfile) => {
    setEditingId(p.id);
    setLabel(p.label);
    setGroup(p.group);
    setHasSensitivity(p.hasRespiratorySensitivity);
    setSensitivityNote(p.sensitivityNote);
    setFormError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
          Family Protection Planner
        </h1>
        <p className="mt-1 text-sm text-[#9BB0C0]">
          Tailor environmental precautions for adults, children, older adults, and respiratory sensitivities in {location.name}.
        </p>
      </div>

      {/* Privacy & Medical Boundary Notice */}
      <div className="rounded-xl border border-[#49E3D0]/25 bg-[#0B1928]/95 px-4 py-3 flex items-start gap-3">
        <Lock className="w-4 h-4 text-[#49E3D0] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-[#9BB0C0] leading-relaxed">
          <strong className="text-[#F2F7FA]">Privacy & Gemini Data Disclosure:</strong> Full household profiles (names/labels and optional sensitivity notes) are stored strictly in your browser’s local storage and are never persisted in any remote database. When you submit a question on <em>Ask VAYU AI</em>, <strong className="text-[#F2F7FA]">only anonymized exposure categories</strong> (each member’s age group: adult/child/older adult and respiratory sensitivity boolean) are sent to the server and Gemini API—personal names and notes stay in your browser. VAYU AI provides environmental precautions only, never medical diagnosis or treatment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile Manager Form */}
        <section className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#102334]/95 p-6">
          <h2 className="text-base font-semibold text-[#F2F7FA]">
            {editingId ? 'Edit Household Profile' : 'Add Household Member'}
          </h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="hh-label-input" className="block text-xs font-medium text-[#B5C7D4] mb-1.5">
                First Name or Label
              </label>
              <input
                id="hh-label-input"
                type="text"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (formError && e.target.value.trim().length >= 2) {
                    setFormError(null);
                  }
                }}
                placeholder="e.g., Maya, Grandfather, Toddler"
                maxLength={40}
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? 'hh-form-error' : undefined}
                className="w-full rounded-xl border border-white/10 bg-[#0B1928] px-3.5 py-2.5 text-sm text-[#F2F7FA] placeholder-[#9BB0C0]"
              />
            </div>

            <div>
              <label htmlFor="hh-group-select" className="block text-xs font-medium text-[#B5C7D4] mb-1.5">
                Age / Exposure Group
              </label>
              <select
                id="hh-group-select"
                value={group}
                onChange={(e) => setGroup(e.target.value as HouseholdMemberGroup)}
                className="w-full rounded-xl border border-white/10 bg-[#0B1928] px-3.5 py-2.5 text-sm text-[#F2F7FA]"
              >
                <option value="adult">Adult</option>
                <option value="child">Child</option>
                <option value="older_adult">Older Adult (65+)</option>
              </select>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0B1928] p-3.5">
              <label className="flex items-center gap-3 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={hasSensitivity}
                  onChange={(e) => setHasSensitivity(e.target.checked)}
                  className="h-5 w-5 accent-[#16C7B0] rounded cursor-pointer shrink-0"
                />
                <span className="text-xs font-medium text-[#F2F7FA]">
                  Report general respiratory or dust sensitivity (optional)
                </span>
              </label>

              {hasSensitivity && (
                <div className="mt-3">
                  <label htmlFor="hh-note-input" className="block text-xs text-[#B5C7D4] mb-1">
                    Brief context (no medical records needed)
                  </label>
                  <input
                    id="hh-note-input"
                    type="text"
                    value={sensitivityNote}
                    onChange={(e) => setSensitivityNote(e.target.value)}
                    placeholder="e.g., sensitive to smoke or road dust"
                    maxLength={120}
                    className="w-full rounded-lg border border-white/10 bg-[#102334] px-3 py-2 text-xs text-[#F2F7FA] placeholder-[#9BB0C0]"
                  />
                </div>
              )}
            </div>

            {formError && (
              <p id="hh-form-error" role="alert" className="text-xs text-amber-300">
                {formError}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-[#16C7B0] px-4 min-h-[42px] text-xs font-semibold text-[#07111F] hover:bg-[#49E3D0]"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{editingId ? 'Save Changes' : 'Add Profile'}</span>
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-white/10 px-4 min-h-[42px] text-xs font-medium text-[#B5C7D4] hover:text-[#F2F7FA]"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Registered Profiles + Protection Plan */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#F2F7FA]">
                Household Profiles ({profiles.length})
              </h2>
              <UserCheck className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
            </div>

            {profiles.length === 0 ? (
              <p className="mt-3 text-sm text-[#9BB0C0]">
                No household profiles added yet. Add an optional profile to personalize exposure precautions for children, older adults, or sensitive airways.
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {profiles.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-white/10 bg-[#0B1928] px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#F2F7FA]">{p.label}</span>
                        <span className="text-xs text-[#49E3D0]">
                          · {p.group === 'older_adult' ? 'Older Adult' : p.group === 'child' ? 'Child' : 'Adult'}
                        </span>
                        {p.hasRespiratorySensitivity && (
                          <span className="text-xs text-amber-300">· Respiratory Sensitivity</span>
                        )}
                      </div>
                      {p.sensitivityNote && (
                        <p className="mt-1 text-xs text-[#B5C7D4] truncate">{p.sensitivityNote}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        aria-label={`Edit ${p.label}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingId === p.id) resetForm();
                          deleteProfile(p.id);
                        }}
                        aria-label={`Delete ${p.label}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#16C7B0]" aria-hidden="true" />
                <h2 className="text-base font-semibold text-[#F2F7FA]">
                  Active Household Protection Plan
                </h2>
              </div>
              <span className="font-mono text-xs text-[#49E3D0]">
                {verification.report.passed ? 'Verified' : 'Partial'}
              </span>
            </div>

            <p className="mt-4 text-sm text-[#F2F7FA] leading-relaxed">
              {familyResult.recommendation}
            </p>

            <ul className="mt-4 space-y-1.5 text-xs text-[#B5C7D4]">
              {familyResult.observations.map((obs, idx) => (
                <li key={idx}>• {obs}</li>
              ))}
            </ul>

            <div className="mt-4 pt-3 border-t border-white/10 text-xs text-[#9BB0C0]">
              {familyResult.limitations[0]}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
