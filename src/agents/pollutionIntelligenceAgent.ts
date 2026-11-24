import {
  buildPollutantBreakdown,
  identifyDominantPollutant,
  interpretAqiCategory,
} from '../utils/aqi.ts';
import type { AgentResult, AqiScale, EnvironmentalDataset } from '../types/airQuality.ts';

export function runPollutionIntelligenceAgent(
  dataset: EnvironmentalDataset | null,
  preferredScale: AqiScale = 'us_aqi',
): AgentResult {
  if (!dataset) {
    return {
      agent_name: 'Pollution Intelligence Agent',
      status: 'failed',
      observations: ['Environmental dataset is unavailable because the upstream provider did not return valid readings.'],
      recommendation: 'Retry fetching Open-Meteo data before making air-quality decisions.',
      evidence: [],
      data_timestamp: 'Unavailable',
      confidence: 'low',
      limitations: ['No real-time or forecast readings available; refusing to fabricate AQI values.'],
    };
  }

  const primaryAqi = preferredScale === 'european_aqi' ? dataset.current.european_aqi : dataset.current.us_aqi;
  const cat = interpretAqiCategory(primaryAqi, preferredScale);
  const dominant = identifyDominantPollutant(dataset.current);
  const pollutants = buildPollutantBreakdown(dataset.current);

  const observations: string[] = [
    `Current modelled ${cat.label} is ${cat.value ?? 'unavailable'} (${cat.shortLabel}) at ${dataset.location.name}, ${dataset.location.country}.`,
    `Dominant pollutant relative to WHO guidelines: ${dominant.symbol} (${dominant.rationale})`,
  ];

  // Analyze 24h forecast trend vs current
  const nowIdx = dataset.hourly.findIndex((h) => h.time === dataset.currentTimestamp);
  const startIdx = nowIdx >= 0 ? nowIdx : 0;
  const next12h = dataset.hourly.slice(startIdx + 1, startIdx + 13);
  const validNextAqi = next12h
    .map((h) => (preferredScale === 'european_aqi' ? h.european_aqi : h.us_aqi))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (validNextAqi.length > 0 && primaryAqi !== null) {
    const avgNext = Math.round(validNextAqi.reduce((a, b) => a + b, 0) / validNextAqi.length);
    const maxNext = Math.max(...validNextAqi);
    const minNext = Math.min(...validNextAqi);
    const delta = avgNext - primaryAqi;
    const trendLabel = delta > 8 ? 'worsening' : delta < -8 ? 'improving' : 'relatively steady';
    observations.push(
      `Next 12-hour forecast appears ${trendLabel} (average ${avgNext}, range ${minNext}–${maxNext} on ${preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI'}).`,
    );
  }

  // Analyze past 12h if present
  const past12h = startIdx > 0 ? dataset.hourly.slice(Math.max(0, startIdx - 12), startIdx) : [];
  const validPastPm25 = past12h
    .map((h) => h.pm2_5)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (validPastPm25.length > 0 && dataset.current.pm2_5 !== null) {
    const avgPast = Math.round((validPastPm25.reduce((a, b) => a + b, 0) / validPastPm25.length) * 10) / 10;
    observations.push(
      `PM2.5 is currently ${dataset.current.pm2_5.toFixed(1)} µg/m³ compared with a ${avgPast.toFixed(1)} µg/m³ mean over the prior ${validPastPm25.length} hours.`,
    );
  }

  const evidence: string[] = [
    `Source: ${dataset.modelSource} (CAMS regional/global atmospheric model grid, not a physical ground station)`,
    `Timestamp: ${dataset.currentTimestamp} (data age: ${dataset.dataAgeMinutes}m)`,
    `Completeness: ${Math.round(dataset.completenessRatio * 100)}% of core pollutant metrics present`,
    ...pollutants
      .filter((p) => p.value !== null)
      .slice(0, 4)
      .map((p) => `${p.symbol}: ${p.value} ${p.unit} (${p.statusLabel})`),
  ];

  const limitations: string[] = [
    'Open-Meteo CAMS provides modelled grid forecasts (~10–40 km resolution) and does not reflect hyper-local roadside spikes or physical CPCB/EPA monitoring station measurements.',
  ];
  if (dataset.isStale) {
    limitations.push(`Data timestamp is ${dataset.dataAgeMinutes} minutes old and flagged as stale.`);
  }
  if (dataset.missingFields.length > 0) {
    limitations.push(`Missing fields for current timestamp: ${dataset.missingFields.join(', ')}.`);
  }

  const confidence =
    dataset.isStale || dataset.completenessRatio < 0.6
      ? 'low'
      : dataset.completenessRatio < 0.9
        ? 'moderate'
        : 'high';

  let recommendation = `Current modelled air quality is ${cat.shortLabel}. `;
  if (cat.level === 'good') {
    recommendation += 'Conditions are broadly favorable for normal outdoor activities while monitoring local traffic corridors.';
  } else if (cat.level === 'moderate') {
    recommendation += `Monitor ${dominant.symbol} levels; unusually sensitive individuals should pace prolonged vigorous exertion.`;
  } else {
    recommendation += `Elevated ${dominant.symbol} suggests shortening intense outdoor exertion and favoring filtered indoor spaces.`;
  }

  return {
    agent_name: 'Pollution Intelligence Agent',
    status: dataset.missingFields.length > 0 ? 'partial' : 'completed',
    observations,
    recommendation,
    evidence,
    data_timestamp: dataset.currentTimestamp,
    confidence,
    limitations,
  };
}
