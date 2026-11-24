import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { POLLUTANT_META as CONFIG_POLLUTANT_META } from '../../config/constants.ts';
import type { AqiScale, EnvironmentalDataset } from '../../types/airQuality.ts';

interface PollutantChartsProps {
  dataset: EnvironmentalDataset;
  preferredScale: AqiScale;
}

type FocusPollutant = 'pm2_5' | 'pm10' | 'ozone' | 'nitrogen_dioxide';

const POLLUTANT_META: Record<
  FocusPollutant,
  { short: string; label: string; unit: string; whoRef: number; periodShort: string }
> = {
  pm2_5: {
    short: 'PM2.5',
    label: 'PM2.5 (µg/m³)',
    unit: 'µg/m³',
    whoRef: CONFIG_POLLUTANT_META.pm2_5.whoGuideline,
    periodShort: CONFIG_POLLUTANT_META.pm2_5.guidelinePeriodShort,
  },
  pm10: {
    short: 'PM10',
    label: 'PM10 (µg/m³)',
    unit: 'µg/m³',
    whoRef: CONFIG_POLLUTANT_META.pm10.whoGuideline,
    periodShort: CONFIG_POLLUTANT_META.pm10.guidelinePeriodShort,
  },
  ozone: {
    short: 'O₃',
    label: 'Ozone O₃ (µg/m³)',
    unit: 'µg/m³',
    whoRef: CONFIG_POLLUTANT_META.ozone.whoGuideline,
    periodShort: CONFIG_POLLUTANT_META.ozone.guidelinePeriodShort,
  },
  nitrogen_dioxide: {
    short: 'NO₂',
    label: 'Nitrogen Dioxide NO₂ (µg/m³)',
    unit: 'µg/m³',
    whoRef: CONFIG_POLLUTANT_META.nitrogen_dioxide.whoGuideline,
    periodShort: CONFIG_POLLUTANT_META.nitrogen_dioxide.guidelinePeriodShort,
  },
};

function formatTickLabel(isoHour: string, index: number): string {
  const hourPart = isoHour.slice(11, 16);
  const dayPart = isoHour.slice(5, 10);
  if (index === 0 || hourPart === '00:00') {
    return `${dayPart} ${hourPart}`;
  }
  return hourPart;
}

function summarizeValues(values: Array<number | null | undefined>): {
  min: number | null;
  avg: number | null;
  peak: number | null;
} {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return { min: null, avg: null, peak: null };
  const sum = valid.reduce((a, b) => a + b, 0);
  return {
    min: Math.round(Math.min(...valid) * 10) / 10,
    avg: Math.round((sum / valid.length) * 10) / 10,
    peak: Math.round(Math.max(...valid) * 10) / 10,
  };
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number | string | null;
  color?: string;
  payload?: { fullTime?: string };
}

const ChartTooltipCard: React.FC<{
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
}> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const fullTime = payload[0]?.payload?.fullTime ?? '';
  return (
    <div className="rounded-xl border border-white/15 bg-[#07111F]/95 px-3.5 py-2.5 text-xs shadow-xl">
      <div className="font-mono font-semibold text-[#F2F7FA] pb-1.5 mb-1.5 border-b border-white/10">
        {fullTime.replace('T', ' · ')}
      </div>
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[#B5C7D4]">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color || '#49E3D0' }}
                aria-hidden="true"
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono font-semibold text-[#F2F7FA] tabular-nums">
              {entry.value !== null && entry.value !== undefined ? entry.value : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PollutantCharts: React.FC<PollutantChartsProps> = ({ dataset, preferredScale }) => {
  const [pollutantFocus, setPollutantFocus] = useState<FocusPollutant>('pm2_5');

  const { pastSeries, forecastSeries } = useMemo(() => {
    const idx = dataset.hourly.findIndex((h) => h.time === dataset.currentTimestamp);
    const pivot = idx >= 0 ? idx : Math.min(24, dataset.hourly.length - 1);

    const pastSlice = dataset.hourly.slice(Math.max(0, pivot - 23), pivot + 1);
    const futureSlice = dataset.hourly.slice(pivot, pivot + 36);

    const formatPt = (h: (typeof dataset.hourly)[number], i: number) => ({
      time: formatTickLabel(h.time, i),
      fullTime: h.time,
      aqi: preferredScale === 'european_aqi' ? h.european_aqi : h.us_aqi,
      pm2_5: h.pm2_5,
      pm10: h.pm10,
      ozone: h.ozone,
      nitrogen_dioxide: h.nitrogen_dioxide,
    });

    return {
      pastSeries: pastSlice.map(formatPt),
      forecastSeries: futureSlice.map(formatPt),
    };
  }, [dataset, preferredScale]);

  const scaleTitle = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
  const focusMeta = POLLUTANT_META[pollutantFocus];

  const pastStats = useMemo(() => summarizeValues(pastSeries.map((p) => p.aqi)), [pastSeries]);
  const forecastAqiStats = useMemo(
    () => summarizeValues(forecastSeries.map((p) => p.aqi)),
    [forecastSeries],
  );
  const forecastPollutantStats = useMemo(
    () => summarizeValues(forecastSeries.map((p) => p[pollutantFocus])),
    [forecastSeries, pollutantFocus],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Historical Trend */}
      <section
        aria-labelledby="past-trend-heading"
        className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6 flex flex-col justify-between"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 id="past-trend-heading" className="text-base font-semibold text-[#F2F7FA]">
              Past 24h Modelled Trend ({scaleTitle})
            </h3>
            <p className="text-xs text-[#9BB0C0] mt-1">
              Retrospective hourly Open-Meteo CAMS grid values leading up to {dataset.currentTimestamp.slice(11, 16)}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0B1928] px-3 py-1.5 text-xs font-mono">
            <span className="text-[#9BB0C0]">
              Min <strong className="text-[#F2F7FA]">{pastStats.min ?? '—'}</strong>
            </span>
            <span className="text-[#9BB0C0]">
              Avg <strong className="text-[#49E3D0]">{pastStats.avg ?? '—'}</strong>
            </span>
            <span className="text-[#9BB0C0]">
              Peak <strong className="text-[#F2F7FA]">{pastStats.peak ?? '—'}</strong>
            </span>
          </div>
        </div>

        {pastSeries.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-[#9BB0C0]">
            Historical hourly points are unavailable for this location.
          </div>
        ) : (
          <div className="h-64 w-full" data-testid="historical-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pastSeries} margin={{ top: 10, right: 12, left: -8, bottom: 4 }}>
                <defs>
                  <linearGradient id="vayuTealGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16C7B0" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="#16C7B0" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#B5C7D4"
                  tick={{ fill: '#B5C7D4', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                  minTickGap={34}
                />
                <YAxis
                  stroke="#B5C7D4"
                  tick={{ fill: '#B5C7D4', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip content={<ChartTooltipCard />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px', color: '#B5C7D4', paddingTop: '6px' }}
                />
                <Area
                  type="monotone"
                  dataKey="aqi"
                  name={`${scaleTitle} Index`}
                  stroke="#49E3D0"
                  strokeWidth={2.25}
                  fill="url(#vayuTealGrad)"
                  connectNulls
                  activeDot={{ r: 4, fill: '#49E3D0', stroke: '#07111F', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Forecast Chart with Dual Y-Axes */}
      <section
        aria-labelledby="forecast-chart-heading"
        className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6 flex flex-col justify-between"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 id="forecast-chart-heading" className="text-base font-semibold text-[#F2F7FA]">
              36h Forecast Breakdown
            </h3>
            <p className="text-xs text-[#9BB0C0] mt-1">
              Left axis: {scaleTitle} · Right axis: {focusMeta.label} (WHO {focusMeta.periodShort} ref: {focusMeta.whoRef})
            </p>
          </div>

          <div
            role="group"
            aria-label="Select forecast pollutant"
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#0B1928] p-1"
          >
            {(['pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide'] as const).map((key) => {
              const isSelected = pollutantFocus === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setPollutantFocus(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap min-h-[34px] ${
                    isSelected
                      ? 'bg-[#16C7B0] text-[#07111F] font-semibold'
                      : 'text-[#B5C7D4] hover:text-[#F2F7FA]'
                  }`}
                >
                  {POLLUTANT_META[key].short}
                </button>
              );
            })}
          </div>
        </div>

        {forecastSeries.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-[#9BB0C0]">
            Forecast series is unavailable for this location.
          </div>
        ) : (
          <>
            <div className="h-64 w-full" data-testid="forecast-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastSeries} margin={{ top: 10, right: 4, left: -8, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#B5C7D4"
                    tick={{ fill: '#B5C7D4', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                    minTickGap={34}
                  />
                  <YAxis
                    yAxisId="aqi"
                    stroke="#55B8E8"
                    tick={{ fill: '#55B8E8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <YAxis
                    yAxisId="conc"
                    orientation="right"
                    stroke="#49E3D0"
                    tick={{ fill: '#49E3D0', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<ChartTooltipCard />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', color: '#B5C7D4', paddingTop: '6px' }}
                  />
                  <ReferenceLine
                    yAxisId="conc"
                    y={focusMeta.whoRef}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    strokeOpacity={0.75}
                    label={{
                      value: `WHO ${focusMeta.periodShort} (${focusMeta.whoRef})`,
                      position: 'insideTopRight',
                      fill: '#FCD34D',
                      fontSize: 10,
                    }}
                  />
                  <Bar
                    yAxisId="aqi"
                    dataKey="aqi"
                    name={scaleTitle}
                    fill="#55B8E8"
                    fillOpacity={0.78}
                    radius={[4, 4, 0, 0]}
                    barSize={8}
                  />
                  <Line
                    yAxisId="conc"
                    type="monotone"
                    dataKey={pollutantFocus}
                    name={focusMeta.label}
                    stroke="#49E3D0"
                    strokeWidth={2.25}
                    dot={false}
                    activeDot={{ r: 4, fill: '#49E3D0', stroke: '#07111F', strokeWidth: 2 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#9BB0C0]">
              <span>
                {scaleTitle} peak: <strong className="text-[#55B8E8]">{forecastAqiStats.peak ?? '—'}</strong>
              </span>
              <span>
                {focusMeta.short} avg/peak:{' '}
                <strong className="text-[#49E3D0]">
                  {forecastPollutantStats.avg ?? '—'} / {forecastPollutantStats.peak ?? '—'} {focusMeta.unit}
                </strong>
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
