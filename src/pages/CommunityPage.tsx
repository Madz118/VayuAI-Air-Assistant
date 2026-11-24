import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckSquare,
  Flag,
  Info,
  Leaf,
  MessageSquarePlus,
  Square,
  Trash2,
} from 'lucide-react';
import { runSustainabilityAgent } from '../agents/sustainabilityAgent.ts';
import {
  OBSERVATION_CATEGORIES,
  SUSTAINABILITY_CHECKLIST_ITEMS,
} from '../config/constants.ts';
import { useVayu } from '../context/VayuContext.tsx';
import type { CommunityReport, ObservationCategory } from '../types/airQuality.ts';
import {
  calculateTransparentCommuteComparison,
  EMISSION_FACTORS_KG_PER_KM,
  type TransportMode,
} from '../utils/sustainabilityCalc.ts';

export const CommunityPage: React.FC = () => {
  const { dataset, location, preferences, completedChecklistIds, toggleChecklistItem } = useVayu();
  const [activeTab, setActiveTab] = useState<'sustainability' | 'community'>('sustainability');

  // Transparent commute calculator state
  const [distanceKm, setDistanceKm] = useState(8);
  const [tripsPerWeek, setTripsPerWeek] = useState(4);
  const [currentMode, setCurrentMode] = useState<TransportMode>('solo_car');
  const [altMode, setAltMode] = useState<TransportMode>('metro_rail');

  const calc = useMemo(
    () =>
      calculateTransparentCommuteComparison({
        distanceKm,
        currentMode,
        alternativeMode: altMode,
        tripsPerWeek,
      }),
    [distanceKm, currentMode, altMode, tripsPerWeek],
  );

  const sustainAgent = useMemo(
    () => runSustainabilityAgent(dataset, preferences.preferredScale),
    [dataset, preferences.preferredScale],
  );

  // Community observations state
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [category, setCategory] = useState<ObservationCategory>('traffic_exhaust');
  const [description, setDescription] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const res = await fetch('/api/community');
      const json = await res.json();
      if (res.ok) setReports(json.reports ?? []);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleSubmitObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!consentGiven) {
      setSubmitError('Please confirm consent to record your selected city coordinates and observation.');
      return;
    }
    if (description.trim().length < 8) {
      setSubmitError('Please provide an observation description of at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityName: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          category,
          description: description.trim(),
          consentGiven,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Submission failed.');
      }
      setDescription('');
      setConsentGiven(false);
      await fetchReports();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit observation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFlag = async (id: string) => {
    await fetch(`/api/community/${encodeURIComponent(id)}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Flagged for moderation review' }),
    });
    await fetchReports();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/community/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await fetchReports();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
            Sustainability & Community
          </h1>
          <p className="mt-1 text-sm text-[#9BB0C0]">
            Low-emission everyday habits paired with community-reported local observations.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sustainability and community views"
          className="inline-flex rounded-xl border border-white/10 bg-[#0B1928] p-1 self-start"
        >
          <button
            id="tab-sustainability"
            role="tab"
            type="button"
            aria-selected={activeTab === 'sustainability'}
            aria-controls="panel-sustainability"
            onClick={() => setActiveTab('sustainability')}
            className={`rounded-lg px-4 py-2 min-h-[40px] text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'sustainability'
                ? 'bg-[#16C7B0] text-[#07111F]'
                : 'text-[#B5C7D4] hover:text-[#F2F7FA]'
            }`}
          >
            Sustainability Actions
          </button>
          <button
            id="tab-community"
            role="tab"
            type="button"
            aria-selected={activeTab === 'community'}
            aria-controls="panel-community"
            onClick={() => setActiveTab('community')}
            className={`rounded-lg px-4 py-2 min-h-[40px] text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'community'
                ? 'bg-[#16C7B0] text-[#07111F]'
                : 'text-[#B5C7D4] hover:text-[#F2F7FA]'
            }`}
          >
            Community Observations ({reports.length})
          </button>
        </div>
      </div>

      {activeTab === 'sustainability' ? (
        <div id="panel-sustainability" role="tabpanel" aria-labelledby="tab-sustainability" className="space-y-6">
          {/* Sustainability Agent Ambient Guidance */}
          <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6">
            <div className="flex items-center gap-2 text-[#49E3D0]">
              <Leaf className="w-4 h-4" aria-hidden="true" />
              <h2 className="text-base font-semibold text-[#F2F7FA]">
                Air-Quality-Gated Sustainability Guidance ({location.name})
              </h2>
            </div>
            <p className="mt-2.5 text-sm text-[#F2F7FA]/90 leading-relaxed">{sustainAgent.recommendation}</p>
            <ul className="mt-3 space-y-1 text-xs text-[#9BB0C0]">
              {sustainAgent.observations.map((o, idx) => (
                <li key={idx}>• {o}</li>
              ))}
            </ul>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Transparent Commute Calculator */}
            <section className="lg:col-span-6 rounded-2xl border border-white/10 bg-[#102334]/95 p-6 space-y-4">
              <h2 className="text-base font-semibold text-[#F2F7FA]">
                Transparent Commute Trade-Off Estimator
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="calc-dist" className="block text-xs text-[#B5C7D4] mb-1">
                    One-Way Distance (km)
                  </label>
                  <input
                    id="calc-dist"
                    type="number"
                    min={1}
                    max={200}
                    value={distanceKm}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDistanceKm(Number.isFinite(val) ? Math.max(1, Math.min(200, val)) : 1);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#0B1928] px-3 py-2.5 text-sm font-mono text-[#F2F7FA]"
                  />
                </div>
                <div>
                  <label htmlFor="calc-trips" className="block text-xs text-[#B5C7D4] mb-1">
                    Trips / Week
                  </label>
                  <input
                    id="calc-trips"
                    type="number"
                    min={1}
                    max={28}
                    value={tripsPerWeek}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTripsPerWeek(Number.isFinite(val) ? Math.max(1, Math.min(28, val)) : 1);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#0B1928] px-3 py-2.5 text-sm font-mono text-[#F2F7FA]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="calc-current" className="block text-xs text-[#9BB0C0] mb-1">
                    Current Mode
                  </label>
                  <select
                    id="calc-current"
                    value={currentMode}
                    onChange={(e) => setCurrentMode(e.target.value as TransportMode)}
                    className="w-full rounded-lg border border-white/10 bg-[#0B1928] px-3 py-2 text-xs text-[#F2F7FA]"
                  >
                    {Object.entries(EMISSION_FACTORS_KG_PER_KM).map(([k, m]) => (
                      <option key={k} value={k}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="calc-alt" className="block text-xs text-[#9BB0C0] mb-1">
                    Lower-Emission Alternative
                  </label>
                  <select
                    id="calc-alt"
                    value={altMode}
                    onChange={(e) => setAltMode(e.target.value as TransportMode)}
                    className="w-full rounded-lg border border-white/10 bg-[#0B1928] px-3 py-2 text-xs text-[#F2F7FA]"
                  >
                    {Object.entries(EMISSION_FACTORS_KG_PER_KM).map(([k, m]) => (
                      <option key={k} value={k}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-[#49E3D0]/30 bg-[#0B1928] p-4 flex items-center justify-between gap-4">
                <div>
                  <span className="block text-xs text-[#9BB0C0]">Estimated Weekly Difference</span>
                  <span className="font-mono text-2xl font-bold text-[#49E3D0] tabular-nums">
                    {calc.weeklyDeltaKgCo2e > 0 ? `-${calc.weeklyDeltaKgCo2e}` : `+${Math.abs(calc.weeklyDeltaKgCo2e)}`} kg CO₂e
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-xs text-[#9BB0C0]">Annualized (52 wks)</span>
                  <span className="font-mono text-lg font-semibold text-[#F2F7FA] tabular-nums">
                    {calc.annualDeltaKgCo2e > 0 ? `-${calc.annualDeltaKgCo2e}` : `+${Math.abs(calc.annualDeltaKgCo2e)}`} kg
                  </span>
                </div>
              </div>

              <div className="text-xs text-[#9BB0C0] space-y-1 leading-relaxed">
                <p className="font-semibold text-[#F2F7FA]">Transparent Calculation Assumptions:</p>
                {calc.assumptions.map((a, idx) => (
                  <p key={idx}>• {a}</p>
                ))}
              </div>
            </section>

            {/* Environmental Action Checklist */}
            <section className="lg:col-span-6 rounded-2xl border border-white/10 bg-[#102334]/95 p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-base font-semibold text-[#F2F7FA]">
                  Environmental Action Checklist
                </h2>
                <span className="font-mono text-xs text-[#49E3D0]">
                  {completedChecklistIds.length}/{SUSTAINABILITY_CHECKLIST_ITEMS.length} adopted
                </span>
              </div>

              <ul className="space-y-2.5">
                {SUSTAINABILITY_CHECKLIST_ITEMS.map((item) => {
                  const checked = completedChecklistIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggleChecklistItem(item.id)}
                        className={`w-full rounded-xl border p-3.5 text-left transition-colors flex items-start gap-3 ${
                          checked
                            ? 'border-[#49E3D0]/40 bg-[#16C7B0]/10'
                            : 'border-white/10 bg-[#0B1928] hover:border-white/20'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-[#49E3D0] shrink-0 mt-0.5" aria-hidden="true" />
                        ) : (
                          <Square className="w-4 h-4 text-[#B5C7D4] shrink-0 mt-0.5" aria-hidden="true" />
                        )}
                        <div>
                          <div className="text-xs font-semibold text-[#F2F7FA]">
                            {item.title}{' '}
                            <span className="font-normal text-[#49E3D0]">· {item.category}</span>
                          </div>
                          <p className="mt-1 text-xs text-[#9BB0C0] leading-relaxed">{item.rationale}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      ) : (
        <div id="panel-community" role="tabpanel" aria-labelledby="tab-community" className="space-y-6">
          <div className="rounded-xl border border-amber-400/25 bg-[#0B1928]/95 px-4 py-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-[#9BB0C0] leading-relaxed">
              <strong className="text-[#F2F7FA]">Unverified Community Reports:</strong> Submissions below reflect local visual/sensory observations shared by users and are <strong className="text-[#F2F7FA]">never</strong> presented as calibrated scientific sensor readings.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Submission Form */}
            <section className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#102334]/95 p-6">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
                <h2 className="text-base font-semibold text-[#F2F7FA]">
                  Submit Local Observation
                </h2>
              </div>

              <form onSubmit={handleSubmitObservation} className="mt-4 space-y-4">
                <div>
                  <span className="block text-xs text-[#9BB0C0]">Location Attached</span>
                  <div className="mt-1 font-mono text-xs text-[#F2F7FA]">
                    {location.name} ({location.latitude.toFixed(3)}, {location.longitude.toFixed(3)})
                  </div>
                </div>

                <div>
                  <label htmlFor="obs-category" className="block text-xs font-medium text-[#9BB0C0] mb-1.5">
                    Observation Category
                  </label>
                  <select
                    id="obs-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ObservationCategory)}
                    className="w-full rounded-xl border border-white/10 bg-[#0B1928] px-3 py-2.5 text-xs text-[#F2F7FA]"
                  >
                    {OBSERVATION_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="obs-desc" className="block text-xs font-medium text-[#B5C7D4]">
                      Short Description
                    </label>
                    <span className="text-xs font-mono text-[#9BB0C0]">{description.length}/280</span>
                  </div>
                  <textarea
                    id="obs-desc"
                    rows={3}
                    maxLength={280}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (submitError) setSubmitError(null);
                    }}
                    aria-invalid={Boolean(submitError)}
                    aria-describedby={submitError ? 'community-submit-error' : undefined}
                    placeholder="Describe local smoke, road dust, traffic haze, or visibility..."
                    className="w-full rounded-xl border border-white/10 bg-[#0B1928] px-3 py-2 text-xs text-[#F2F7FA] placeholder-[#9BB0C0]"
                  />
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#B5C7D4]">
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={(e) => {
                      setConsentGiven(e.target.checked);
                      if (submitError) setSubmitError(null);
                    }}
                    className="h-5 w-5 accent-[#16C7B0] mt-0.5 rounded cursor-pointer shrink-0"
                  />
                  <span>
                    I consent to publish this unverified observation with the selected city coordinates and current timestamp.
                  </span>
                </label>

                {submitError && (
                  <p id="community-submit-error" role="alert" className="text-xs text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{submitError}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-[#16C7B0] px-4 min-h-[42px] text-xs font-semibold text-[#07111F] hover:bg-[#49E3D0] disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Publish Community Observation'}
                </button>
              </form>
            </section>

            {/* Reports Feed */}
            <section className="lg:col-span-7 space-y-3">
              <h2 className="text-base font-semibold text-[#F2F7FA]">
                Recent Community Observations
              </h2>
              {loadingReports && reports.length === 0 && (
                <p className="text-xs text-[#B5C7D4]">Loading community reports...</p>
              )}
              {reports.length === 0 && !loadingReports ? (
                <div className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6 text-sm text-[#9BB0C0]">
                  No community observations submitted yet.
                </div>
              ) : (
                reports.map((rep) => {
                  const catLabel =
                    OBSERVATION_CATEGORIES.find((c) => c.id === rep.category)?.label ?? rep.category;
                  return (
                    <article
                      key={rep.id}
                      className="rounded-2xl border border-white/10 bg-[#102334]/95 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 font-medium text-[#F2F7FA]">
                          <span>{rep.cityName}</span>
                          <span className="text-[#9BB0C0]">·</span>
                          <span className="text-[#49E3D0]">{catLabel}</span>
                          <span className="text-[#9BB0C0]">·</span>
                          <span className="text-amber-300">
                            {rep.isDemonstration ? 'Demonstration (Unverified)' : 'Community Report (Unverified)'}
                          </span>
                          {rep.status === 'under_review' && (
                            <span className="text-red-300">· Flagged for Review</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleFlag(rep.id)}
                            aria-label={`Flag observation in ${rep.cityName}`}
                            title="Flag for moderation"
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-white/5 hover:text-amber-300"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                          {!rep.isDemonstration && (
                            <button
                              type="button"
                              onClick={() => handleDelete(rep.id)}
                              aria-label={`Remove observation in ${rep.cityName}`}
                              title="Remove observation"
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-red-500/10 hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-[#F2F7FA] leading-relaxed">{rep.description}</p>
                      <div className="font-mono text-xs text-[#9BB0C0]">
                        {new Date(rep.submittedAt).toLocaleString()} · ({rep.latitude.toFixed(3)}, {rep.longitude.toFixed(3)})
                        {rep.flagCount > 0 ? ` · Flags: ${rep.flagCount}` : ''}
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
