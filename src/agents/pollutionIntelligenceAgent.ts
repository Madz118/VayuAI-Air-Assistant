import {
  buildPollutantBreakdown,
  identifyDominantPollutant,
  interpretAqiCategory,
} from '../utils/aqi.ts';
import type { HypotheticalScenario } from '../utils/hypotheticalScenario.ts';
import type { AgentResult, AqiScale, EnvironmentalDataset } from '../types/airQuality.ts';

export function runPollutionIntelligenceAgent(
  dataset: EnvironmentalDataset | null,
  preferredScale: AqiScale = 'us_aqi',
  hypotheticalScenario: HypotheticalScenario | null = null,
): AgentResult {
  if (hypotheticalScenario) {
    const cat = hypotheticalScenario.category;
    const liveScale = hypotheticalScenario.scale;
    const liveAqi = dataset
      ? liveScale === 'european_aqi'
        ? dataset.current.european_aqi
        : dataset.current.us_aqi
      : null;
    const liveCat = interpretAqiCategory(liveAqi, liveScale);

    const observations: string[] = [
      `HYPOTHETICAL SCENARIO: Evaluating assumed ${cat.label} of ${hypotheticalScenario.assumedAqi} (${cat.shortLabel}).`,
    ];

    if (dataset) {
      observations.push(
        `ACTUAL LIVE CONDITIONS (for reference only — not used as the scenario AQI): ${dataset.location.name}${dataset.location.country ? `, ${dataset.location.country}` : ''} currently models ${liveCat.label} of ${liveCat.value ?? 'unavailable'} (${liveCat.shortLabel}) at ${dataset.currentTimestamp}.`,
      );
    }

    let recommendation = '';
    if (cat.level === 'good') {
      recommendation = `HYPOTHETICAL SCENARIO (${cat.label} ${hypotheticalScenario.assumedAqi} — Good): At this assumed level, ambient air quality is satisfactory for normal outdoor activity across the general public.`;
    } else if (cat.level === 'moderate') {
      recommendation = `HYPOTHETICAL SCENARIO (${cat.label} ${hypotheticalScenario.assumedAqi} — Moderate): Acceptable for most people, though unusually sensitive individuals should pace prolonged vigorous outdoor exertion.`;
    } else if (cat.level === 'sensitive') {
      recommendation = `HYPOTHETICAL SCENARIO (${cat.label} ${hypotheticalScenario.assumedAqi} — ${cat.shortLabel}): Sensitive groups (children, older adults, and people with respiratory sensitivities) should reduce prolonged or vigorous outdoor exertion.`;
    } else if (cat.level === 'unhealthy') {
      recommendation = `HYPOTHETICAL SCENARIO (${cat.label} ${hypotheticalScenario.assumedAqi} — Unhealthy): Everyone may experience respiratory irritation; shift strenuous outdoor activity indoors and limit prolonged outdoor exposure.`;
    } else if (cat.level === 'very_unhealthy') {
      recommendation = `HYPOTHETICAL SCENARIO (${cat.label} ${hypotheticalScenario.assumedAqi} — Very Unhealthy): Health alert conditions. Everyone should avoid prolonged or heavy outdoor exertion and remain indoors with filtered air where possible.`;
    } else {
      recommendation = `HYPOTHETICAL SCENARIO (${cat.label} ${hypotheticalScenario.assumedAqi} — Hazardous): Emergency exposure conditions. Avoid all outdoor physical exertion, keep windows sealed, and run indoor HEPA filtration.`;
    }

    const evidence = [
      `Hypothetical AQI Input: ${hypotheticalScenario.scaleLabel} = ${hypotheticalScenario.assumedAqi} (${cat.shortLabel})`,
      ...(dataset
        ? [
            `Actual Live Reference (${dataset.location.name}): ${liveCat.label} = ${liveCat.value ?? 'N/A'} at ${dataset.currentTimestamp}`,
          ]
        : ['Actual Live Reference: Unavailable']),
    ];

    return {
      agent_name: 'Pollution Intelligence Agent',
      status: 'completed',
      observations,
      recommendation,
      evidence,
      data_timestamp: dataset?.currentTimestamp ?? 'Hypothetical Scenario',
      confidence: 'high',
      limitations: [
        `Evaluation is driven by your hypothetical assumed value (${hypotheticalScenario.scaleLabel} ${hypotheticalScenario.assumedAqi}), not live ambient sensor or CAMS grid readings.`,
        'Single-hour or assumed AQI bands summarize general risk tiers and do not reflect pollutant-specific chemical composition unless measured.',
      ],
    };
  }

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
  const scaleName = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';

  const observations: string[] = [
    `Current modelled ${cat.label} is ${cat.value ?? 'unavailable'} (${cat.shortLabel}) at ${dataset.location.name}${dataset.location.country ? `, ${dataset.location.country}` : ''}.`,
    `Dominant pollutant (1h screening ratio vs WHO reference): ${dominant.symbol} (${dominant.rationale})`,
  ];

  // Analyze 12h forecast trend vs current
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
    const threshold = preferredScale === 'european_aqi' ? 4 : 8;
    const trendLabel = delta > threshold ? 'worsening' : delta < -threshold ? 'improving' : 'relatively steady';
    observations.push(
      `Next 12-hour forecast appears ${trendLabel} (average ${avgNext}, range ${minNext}–${maxNext} on ${scaleName}).`,
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
    `Location: ${dataset.location.name} (${dataset.location.latitude.toFixed(4)}, ${dataset.location.longitude.toFixed(4)})`,
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
    'Single-hour pollutant ratios against WHO 24-hour or 8-hour guideline values are screening comparisons only, not formal multi-hour guideline exceedances.',
  ];
  if (dataset.isStale) {
    limitations.push(`Data timestamp is ${dataset.dataAgeMinutes} minutes old and flagged as stale.`);
  }
  if (dataset.missingFields.length > 0) {
    limitations.push(`Missing fields for current timestamp: ${dataset.missingFields.join(', ')}.`);
  }
  if (dataset.weatherAvailable === false) {
    limitations.push('Upstream meteorology fields could not be retrieved; weather dispersion context is unavailable.');
  }

  const degradedConfidence =
    cat.level === 'unknown' || dataset.isStale || dataset.completenessRatio < 0.6;

  const confidence = degradedConfidence
    ? 'low'
    : dataset.completenessRatio < 0.9
      ? 'moderate'
      : 'high';

  let recommendation = '';
  if (cat.level === 'unknown') {
    recommendation = `Current ${scaleName} reading is unavailable; avoid assuming conditions are clean and refresh data before prolonged outdoor exertion.`;
  } else if (dataset.isStale || dataset.completenessRatio < 0.6) {
    recommendation = `Available modelled ${cat.label} reads ${cat.value} (${cat.shortLabel}), but data is ${dataset.isStale ? 'stale' : 'incomplete'} (${Math.round(dataset.completenessRatio * 100)}% complete). Do not rely on this reading for confident outdoor planning until refreshed.`;
  } else if (cat.level === 'good') {
    recommendation = `Current modelled air quality is ${cat.shortLabel}. Conditions are broadly favorable for normal outdoor activities while monitoring local traffic corridors.`;
  } else if (cat.level === 'moderate') {
    recommendation = `Current modelled air quality is ${cat.shortLabel}. Monitor ${dominant.symbol} levels; unusually sensitive individuals should pace prolonged vigorous exertion.`;
  } else {
    recommendation = `Current modelled air quality is ${cat.shortLabel}. Elevated ${dominant.symbol} suggests shortening intense outdoor exertion and favoring filtered indoor spaces.`;
  }

  return {
    agent_name: 'Pollution Intelligence Agent',
    status: degradedConfidence || dataset.missingFields.length > 0 ? 'partial' : 'completed',
    observations,
    recommendation,
    evidence,
    data_timestamp: dataset.currentTimestamp,
    confidence,
    limitations,
  };
}
