import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock, Info, ShieldAlert, Sun } from 'lucide-react';
import { ACTIVITIES_META } from '../config/constants.ts';
import { useVayu } from '../context/VayuContext.tsx';
import type { ActivityType, RoutinePlanResult } from '../types/airQuality.ts';
import { formatTemperature } from '../utils/aqi.ts';
import { ErrorStateCard } from '../components/common/ErrorStateCard.tsx';

export const RoutinePlannerPage: React.FC = () => {
  const { location, dataset, preferences } = useVayu();
  const [activity, setActivity] = useState<ActivityType>('outdoor_exercise');

  const availableDates = useMemo(() => {
    if (!dataset || dataset.hourly.length === 0) return [];
    const currentDay = dataset.currentTimestamp.slice(0, 10);
    const unique = Array.from(new Set(dataset.hourly.map((h) => h.time.slice(0, 10))));
    return unique.filter((d) => d >= currentDay).slice(0, 3);
  }, [dataset]);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [plan, setPlan] = useState<RoutinePlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  useEffect(() => {
    if (!selectedDate) {
      setPlan(null);
      return;
    }
    let active = true;
    const fetchPlan = async () => {
      setLoading(true);
      setError(null);
      setPlan(null);
      try {
        const res = await fetch('/api/routine-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location,
            activity,
            date: selectedDate,
            preferredScale: preferences.preferredScale,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to generate routine plan.');
        if (active) setPlan(json as RoutinePlanResult);
      } catch (err) {
        if (active) {
          setPlan(null);
          setError(err instanceof Error ? err.message : 'Unable to compute routine plan.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPlan();
    return () => {
      active = false;
    };
  }, [location, activity, selectedDate, preferences.preferredScale]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
          Smart Routine Planner
        </h1>
        <p className="mt-1 text-sm text-[#9BB0C0]">
          Compare 3-hour air-quality and weather windows for {location.name} before scheduling outdoor exertion or ventilation.
        </p>
      </div>

      {/* Controls */}
      <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor="routine-activity-select" className="block text-xs font-medium text-[#9BB0C0] mb-2">
            Select Intended Activity
          </label>
          <select
            id="routine-activity-select"
            value={activity}
            onChange={(e) => setActivity(e.target.value as ActivityType)}
            className="w-full rounded-xl border border-white/10 bg-[#0B1928] px-3.5 py-2.5 text-sm text-[#F2F7FA]"
          >
            {ACTIVITIES_META.map((act) => (
              <option key={act.id} value={act.id}>
                {act.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-[#9BB0C0]">
            {ACTIVITIES_META.find((a) => a.id === activity)?.description}
          </p>
        </div>

        <div>
          <span className="block text-xs font-medium text-[#B5C7D4] mb-2">
            Forecast Date
          </span>
          {availableDates.length === 0 ? (
            <p className="text-xs text-amber-300">
              No forecast dates available yet. Ensure environmental data is loaded.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Forecast date selection">
              {availableDates.map((d, idx) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={selectedDate === d}
                  onClick={() => setSelectedDate(d)}
                  className={`rounded-xl border px-3.5 py-2.5 min-h-[44px] text-xs font-medium transition-colors ${
                    selectedDate === d
                      ? 'border-[#49E3D0]/60 bg-[#16C7B0]/15 text-[#49E3D0]'
                      : 'border-white/10 bg-[#0B1928] text-[#B5C7D4] hover:text-[#F2F7FA]'
                  }`}
                >
                  <span className="font-mono">{d}</span>
                  <span className="ml-1.5">
                    ({idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : 'Day +2'})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {error && <ErrorStateCard message={error} />}

      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-24 rounded-2xl border border-white/10 bg-[#102334]/70" />
          <div className="h-64 rounded-2xl border border-white/10 bg-[#102334]/70" />
        </div>
      )}

      {!loading && plan && (
        <>
          {/* Summary Banner */}
          <section className="rounded-2xl border border-[#49E3D0]/25 bg-[#0B1928]/95 p-5">
            <div className="flex items-start gap-3">
              <CalendarClock className="w-5 h-5 text-[#49E3D0] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold text-[#F2F7FA]">
                  {plan.activityLabel} · {plan.date}
                </h2>
                <p className="mt-1.5 text-sm text-[#F2F7FA]/90 leading-relaxed">{plan.summary}</p>
                <p className="mt-2 text-xs text-[#9BB0C0] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
                  <span>{plan.disclaimer}</span>
                </p>
              </div>
            </div>
          </section>

          {/* Visual Daily Timeline */}
          <section aria-labelledby="timeline-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="timeline-heading" className="text-lg font-semibold text-[#F2F7FA]">
                Daily Forecast Windows
              </h2>
              <span className="text-xs font-mono text-[#9BB0C0]">
                {preferences.preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI'}
              </span>
            </div>

            {plan.windows.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6 text-sm text-[#9BB0C0]">
                Forecast windows are unavailable for {plan.date}. VAYU AI does not fabricate missing time slots.
              </div>
            ) : (
              <div className="space-y-3">
                {plan.windows.map((w) => {
                  const isBest =
                    plan.bestWindow &&
                    plan.bestWindow.startTime === w.startTime &&
                    w.suitability !== 'limit_exposure';

                  const badgeStyle =
                    w.suitability === 'favorable'
                      ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                      : w.suitability === 'moderate_caution'
                        ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                        : w.suitability === 'limit_exposure'
                          ? 'bg-orange-500/15 border-orange-400/30 text-orange-300'
                          : 'bg-slate-700/40 border-white/10 text-[#9BB0C0]';

                  const displayAqi =
                    preferences.preferredScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi;

                  const tempDisplay =
                    w.avgTempC !== null
                      ? formatTemperature(w.avgTempC, preferences.temperatureUnit)
                      : '—';

                  return (
                    <article
                      key={w.startTime}
                      className={`rounded-2xl border p-5 transition-colors ${
                        isBest
                          ? 'border-[#49E3D0]/50 bg-[#102334]'
                          : 'border-white/10 bg-[#102334]/90'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-[#F2F7FA]">
                            <Clock className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
                            <span>
                              {w.startTime.slice(11, 16)} – {w.endTime.slice(11, 16)}
                            </span>
                          </div>
                          <span className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${badgeStyle}`}>
                            {w.suitabilityLabel}
                          </span>
                          {isBest && (
                            <span className="text-xs font-semibold text-[#49E3D0]">
                              Lowest Modelled Exposure
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#9BB0C0]">
                          <span>
                            {preferences.preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI'}:{' '}
                            <strong className="text-[#F2F7FA]">{displayAqi ?? '—'}</strong>
                          </span>
                          <span>
                            PM2.5: <strong className="text-[#F2F7FA]">{w.avgPm25 ?? '—'} µg/m³</strong>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Sun className="w-3.5 h-3.5 text-[#55B8E8]" aria-hidden="true" />
                            <span>
                              {w.weatherLabel} · {tempDisplay}
                            </span>
                          </span>
                          <span>Wind: {w.avgWindKmh ?? '—'} km/h</span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/10 text-xs">
                        <div>
                          <span className="font-semibold text-[#F2F7FA]">Rationale: </span>
                          <span className="text-[#9BB0C0]">{w.rationale}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[#49E3D0]">Recommended Approach / Alternative: </span>
                          <span className="text-[#9BB0C0]">{w.alternativeAction}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="text-xs text-[#9BB0C0] flex items-center gap-2">
            <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="font-mono">
              Source: {plan.dataSource} · Reference timestamp: {plan.dataTimestamp}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
