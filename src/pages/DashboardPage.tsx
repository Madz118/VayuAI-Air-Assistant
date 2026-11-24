import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CloudSun,
  Compass,
  Droplets,
  Info,
  MapPin,
  MessageSquareText,
  Thermometer,
  Wind,
} from 'lucide-react';
import { runFamilyProtectionAgent } from '../agents/familyProtectionAgent.ts';
import { runPollutionIntelligenceAgent } from '../agents/pollutionIntelligenceAgent.ts';
import { PollutantCharts } from '../components/charts/PollutantCharts.tsx';
import { AqiScaleBadge } from '../components/common/AqiScaleBadge.tsx';
import { CitySearchModal } from '../components/common/CitySearchModal.tsx';
import { ErrorStateCard } from '../components/common/ErrorStateCard.tsx';
import { PRESET_CITIES } from '../config/constants.ts';
import { useVayu } from '../context/VayuContext.tsx';
import {
  buildPollutantBreakdown,
  formatTemperature,
  formatWindDirection,
  interpretAqiCategory,
} from '../utils/aqi.ts';

export const DashboardPage: React.FC = () => {
  const { location, setLocation, dataset, loading, error, refreshData, preferences, profiles } = useVayu();
  const [cityModalOpen, setCityModalOpen] = useState(false);

  const primaryAqiValue = dataset
    ? preferences.preferredScale === 'european_aqi'
      ? dataset.current.european_aqi
      : dataset.current.us_aqi
    : null;

  const category = useMemo(
    () => interpretAqiCategory(primaryAqiValue, preferences.preferredScale),
    [primaryAqiValue, preferences.preferredScale],
  );

  const pollutants = useMemo(
    () => (dataset ? buildPollutantBreakdown(dataset.current) : []),
    [dataset],
  );

  const pollutionAgent = useMemo(
    () => runPollutionIntelligenceAgent(dataset, preferences.preferredScale),
    [dataset, preferences.preferredScale],
  );

  const familyAgent = useMemo(
    () => runFamilyProtectionAgent(dataset, profiles, preferences.preferredScale),
    [dataset, profiles, preferences.preferredScale],
  );

  const scaleMax = preferences.preferredScale === 'european_aqi' ? 100 : 300;
  const markerPercent =
    category.value !== null
      ? Math.min(98, Math.max(2, (category.value / scaleMax) * 100))
      : null;

  return (
    <div className="space-y-6">
      {/* Top Page Header & Quick City Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
            Air Intelligence Dashboard
          </h1>
          <p className="mt-1 text-sm text-[#9BB0C0]">
            Modelled atmospheric conditions and 36-hour outlook for{' '}
            <span className="text-[#F2F7FA] font-medium">
              {location.name}
              {location.country ? `, ${location.country}` : ''}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick city selector">
          {PRESET_CITIES.slice(0, 4).map((c) => {
            const active =
              Math.abs(c.latitude - location.latitude) < 0.05 &&
              Math.abs(c.longitude - location.longitude) < 0.05;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => setLocation(c)}
                className={`rounded-xl px-3.5 py-2 text-xs font-medium border transition-colors whitespace-nowrap min-h-[40px] ${
                  active
                    ? 'border-[#49E3D0]/60 bg-[#16C7B0]/15 text-[#49E3D0]'
                    : 'border-white/10 bg-[#102334] text-[#B5C7D4] hover:text-[#F2F7FA]'
                }`}
              >
                {c.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCityModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#16C7B0] px-3.5 py-2 text-xs font-semibold text-[#07111F] hover:bg-[#49E3D0] transition-colors whitespace-nowrap min-h-[40px]"
          >
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Search City</span>
          </button>
        </div>
      </div>

      {error && <ErrorStateCard message={error} onRetry={refreshData} retrying={loading} />}

      {loading && !dataset && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
          <div className="lg:col-span-7 h-64 rounded-2xl border border-white/10 bg-[#102334]/70" />
          <div className="lg:col-span-5 h-64 rounded-2xl border border-white/10 bg-[#102334]/70" />
        </div>
      )}

      {dataset && (
        <>
          {/* Hero Row: Main AQI Card + Weather Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <section
              aria-labelledby="main-aqi-heading"
              className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#102334]/95 p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-medium text-[#B5C7D4]">
                      {preferences.preferredScale === 'european_aqi'
                        ? 'European Air Quality Index (EU EAQI)'
                        : 'US EPA Air Quality Index (US AQI)'}
                    </span>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <h2
                        id="main-aqi-heading"
                        data-testid="dashboard-aqi-value"
                        className="font-mono text-5xl sm:text-6xl font-bold text-[#F2F7FA] tabular-nums leading-none"
                      >
                        {category.value ?? '—'}
                      </h2>
                      <AqiScaleBadge category={category} size="lg" />
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#0B1928] px-3.5 py-2.5 text-xs text-[#9BB0C0] space-y-1">
                    <div>
                      Alternate:{' '}
                      <span className="font-mono text-[#F2F7FA]">
                        {preferences.preferredScale === 'european_aqi'
                          ? `US AQI ${dataset.current.us_aqi ?? '—'}`
                          : `EU EAQI ${dataset.current.european_aqi ?? '—'}`}
                      </span>
                    </div>
                    <div>
                      Dominant:{' '}
                      <span className="font-mono font-semibold text-[#49E3D0]">
                        {dataset.dominantPollutant.symbol}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Accessible AQI Scale Spectrum Bar */}
                <div className="mt-5" aria-label={`Index position along ${preferences.preferredScale === 'european_aqi' ? 'EU EAQI 0 to 100 plus' : 'US AQI 0 to 300 plus'} scale`}>
                  <div className="relative h-2.5 w-full rounded-full overflow-hidden flex bg-[#0B1928] border border-white/10">
                    <div className="h-full bg-emerald-400/80" style={{ width: '18%' }} />
                    <div className="h-full bg-amber-300/80" style={{ width: '18%' }} />
                    <div className="h-full bg-orange-400/80" style={{ width: '18%' }} />
                    <div className="h-full bg-red-400/80" style={{ width: '23%' }} />
                    <div className="h-full bg-purple-400/80" style={{ width: '23%' }} />
                    {markerPercent !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-[#F2F7FA] shadow-[0_0_6px_rgba(242,247,250,0.9)]"
                        style={{ left: `calc(${markerPercent}% - 2px)` }}
                      />
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs font-mono text-[#9BB0C0]">
                    <span>{preferences.preferredScale === 'european_aqi' ? '0 Good' : '0 Good'}</span>
                    <span>{preferences.preferredScale === 'european_aqi' ? '40 Moderate' : '100 Sensitive'}</span>
                    <span>{preferences.preferredScale === 'european_aqi' ? '100+ Poor' : '300+ Hazardous'}</span>
                  </div>
                </div>

                <p className="mt-4 text-sm text-[#B5C7D4] leading-relaxed">{category.description}</p>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-[#9BB0C0]">
                <span>
                  Source: <span className="text-[#F2F7FA]">{dataset.modelSource}</span>
                </span>
                <span className="font-mono">
                  {dataset.currentTimestamp} · Completeness {Math.round(dataset.completenessRatio * 100)}%
                </span>
              </div>
            </section>

            {/* Weather Overview Card */}
            <section
              aria-labelledby="weather-heading"
              className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#102334]/95 p-6 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <h2 id="weather-heading" className="text-base font-semibold text-[#F2F7FA]">
                  Meteorology & Dispersion
                </h2>
                <CloudSun className="w-5 h-5 text-[#55B8E8]" aria-hidden="true" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3.5">
                <div className="rounded-xl border border-white/10 bg-[#0B1928] p-4">
                  <div className="flex items-center gap-1.5 text-xs text-[#9BB0C0]">
                    <Thermometer className="w-3.5 h-3.5 text-[#49E3D0]" aria-hidden="true" />
                    <span>Temperature</span>
                  </div>
                  <div className="mt-1.5 font-mono text-xl font-semibold text-[#F2F7FA] tabular-nums">
                    {formatTemperature(dataset.current.temperature_2m, preferences.temperatureUnit)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0B1928] p-4">
                  <div className="flex items-center gap-1.5 text-xs text-[#9BB0C0]">
                    <Droplets className="w-3.5 h-3.5 text-[#55B8E8]" aria-hidden="true" />
                    <span>Humidity</span>
                  </div>
                  <div className="mt-1.5 font-mono text-xl font-semibold text-[#F2F7FA] tabular-nums">
                    {dataset.current.relative_humidity_2m !== null
                      ? `${Math.round(dataset.current.relative_humidity_2m)}%`
                      : '—'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0B1928] p-4">
                  <div className="flex items-center gap-1.5 text-xs text-[#9BB0C0]">
                    <Wind className="w-3.5 h-3.5 text-[#16C7B0]" aria-hidden="true" />
                    <span>Wind Speed</span>
                  </div>
                  <div className="mt-1.5 font-mono text-xl font-semibold text-[#F2F7FA] tabular-nums">
                    {dataset.current.wind_speed_10m !== null
                      ? `${dataset.current.wind_speed_10m.toFixed(1)} km/h`
                      : '—'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0B1928] p-4">
                  <div className="flex items-center gap-1.5 text-xs text-[#9BB0C0]">
                    <Compass className="w-3.5 h-3.5 text-[#B5C7D4]" aria-hidden="true" />
                    <span>Direction</span>
                  </div>
                  <div className="mt-1.5 font-mono text-base font-semibold text-[#F2F7FA] tabular-nums">
                    {formatWindDirection(dataset.current.wind_direction_10m)}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-[#9BB0C0]">
                <span>Conditions: <strong className="text-[#F2F7FA]">{dataset.current.weather_label}</strong></span>
                <span className="font-mono">{dataset.weatherSource.replace(' Forecast API', '')}</span>
              </div>
            </section>
          </div>

          {/* Explicit Modelled Data & Scale Disclosure */}
          <div className="rounded-xl border border-[#55B8E8]/25 bg-[#0B1928]/95 px-4 py-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-[#55B8E8] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-[#B5C7D4] leading-relaxed">
              <strong className="text-[#F2F7FA]">Modelled Forecast Disclosure:</strong> Air quality figures use Open-Meteo CAMS atmospheric model grids (not direct physical CPCB/EPA monitoring station sensors). Active scale:{' '}
              <strong className="text-[#F2F7FA]">
                {preferences.preferredScale === 'european_aqi' ? 'European EAQI' : 'US EPA AQI'}
              </strong>
              , which differs from India’s official CPCB AQI formula.
            </p>
          </div>

          {/* 6 Pollutant Breakdown Cards */}
          <section aria-labelledby="pollutants-heading">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
              <div>
                <h2 id="pollutants-heading" className="text-lg font-semibold text-[#F2F7FA]">
                  Hourly Pollutant Levels vs WHO 2021 Screening References
                </h2>
                <p className="text-xs text-[#9BB0C0] mt-0.5">
                  Single-hour modelled snapshots scaled against WHO 24-hour mean (8-hour max for O₃) references—screening ratios only, not formal multi-hour exceedances.
                </p>
              </div>
              <span className="text-xs text-[#B5C7D4] font-mono">
                Dominant: <strong className="text-[#49E3D0]">{dataset.dominantPollutant.symbol}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              {pollutants.map((p) => (
                <article
                  key={p.key}
                  className="h-full rounded-2xl border border-white/10 bg-[#102334]/95 p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-base font-bold text-[#F2F7FA]">{p.symbol}</span>
                      <span className="text-xs text-[#B5C7D4] truncate">{p.name}</span>
                    </div>

                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-bold text-[#F2F7FA] tabular-nums">
                        {p.value !== null ? p.value.toFixed(1) : '—'}
                      </span>
                      <span className="text-xs text-[#9BB0C0]">{p.unit} (1h)</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-medium ${
                          p.whoRatio === null
                            ? 'text-[#B5C7D4]'
                            : p.whoRatio <= 1
                              ? 'text-emerald-300'
                              : p.whoRatio <= 2
                                ? 'text-amber-300'
                                : 'text-orange-300'
                        }`}
                      >
                        {p.statusLabel}
                      </span>
                      <span className="font-mono text-[#B5C7D4]">
                        WHO {p.guidelinePeriodShort}: {p.whoGuideline} {p.unit}
                      </span>
                    </div>
                    <p className="text-xs text-[#9BB0C0] leading-relaxed">{p.healthNote}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Historical & Forecast Charts */}
          <PollutantCharts dataset={dataset} preferredScale={preferences.preferredScale} />

          {/* Health & Activity Advisory */}
          <section
            aria-labelledby="advisory-heading"
            className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <h2 id="advisory-heading" className="text-lg font-semibold text-[#F2F7FA]">
                  Agent-Synthesized Health & Activity Advisory
                </h2>
                <p className="text-xs text-[#9BB0C0] mt-1">
                  Prepared by {pollutionAgent.agent_name} & {familyAgent.agent_name}
                </p>
              </div>
              <Link
                to="/ask"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#16C7B0]/15 border border-[#49E3D0]/35 px-4 py-2.5 text-xs font-semibold text-[#49E3D0] hover:bg-[#16C7B0]/25 whitespace-nowrap min-h-[40px]"
              >
                <MessageSquareText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ask VAYU About Your Day</span>
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold text-[#49E3D0] uppercase tracking-wider">
                  Ambient Assessment
                </h3>
                <p className="mt-2 text-sm text-[#F2F7FA] leading-relaxed">
                  {pollutionAgent.recommendation}
                </p>
                <ul className="mt-3 space-y-1.5 text-xs text-[#B5C7D4]">
                  {pollutionAgent.observations.map((obs, idx) => (
                    <li key={idx}>• {obs}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-[#55B8E8] uppercase tracking-wider">
                  Household Exposure Guidance ({profiles.length} profile{profiles.length === 1 ? '' : 's'})
                </h3>
                <p className="mt-2 text-sm text-[#F2F7FA] leading-relaxed">
                  {familyAgent.recommendation}
                </p>
                <p className="mt-3 text-xs text-[#9BB0C0] leading-relaxed">
                  {familyAgent.limitations[0]}
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      <CitySearchModal
        open={cityModalOpen}
        onClose={() => setCityModalOpen(false)}
        currentLocation={location}
        onSelectLocation={setLocation}
      />
    </div>
  );
};
