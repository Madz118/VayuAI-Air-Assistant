import { ACTIVITIES_META } from '../config/constants.ts';
import { getWeatherLabel, interpretAqiCategory } from '../utils/aqi.ts';
import type {
  ActivityType,
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  RoutineWindow,
} from '../types/airQuality.ts';

function evaluateWindowSuitability(
  avgAqi: number | null,
  scale: AqiScale,
  exertion: 'high' | 'moderate' | 'low',
  activity: ActivityType,
  degradedConfidence: boolean,
): { suitability: RoutineWindow['suitability']; label: string } {
  if (avgAqi === null || !Number.isFinite(avgAqi)) {
    return { suitability: 'insufficient_data', label: 'Insufficient Forecast Data' };
  }

  let rawSuitability: RoutineWindow['suitability'];
  let rawLabel: string;

  if (scale === 'european_aqi') {
    // European Air Quality Index (EU EAQI): 0-20 Good, 21-40 Fair, 41-60 Moderate, 61-80 Poor, 81-100 Very Poor, >100 Extremely Poor
    if (activity === 'indoor_ventilation') {
      if (avgAqi <= 25) {
        rawSuitability = 'favorable';
        rawLabel = 'Favorable Window';
      } else if (avgAqi <= 45) {
        rawSuitability = 'moderate_caution';
        rawLabel = 'Brief Ventilation Only';
      } else {
        rawSuitability = 'limit_exposure';
        rawLabel = 'Keep Windows Closed';
      }
    } else if (exertion === 'high') {
      if (avgAqi <= 20) {
        rawSuitability = 'favorable';
        rawLabel = 'Favorable Window';
      } else if (avgAqi <= 40) {
        rawSuitability = 'moderate_caution';
        rawLabel = 'Fair — Pace Intensity';
      } else {
        rawSuitability = 'limit_exposure';
        rawLabel = 'Prefer Indoor Alternative';
      }
    } else if (exertion === 'moderate') {
      if (avgAqi <= 35) {
        rawSuitability = 'favorable';
        rawLabel = 'Favorable Window';
      } else if (avgAqi <= 55) {
        rawSuitability = 'moderate_caution';
        rawLabel = 'Moderate Caution';
      } else {
        rawSuitability = 'limit_exposure';
        rawLabel = 'Limit Duration';
      }
    } else {
      if (avgAqi <= 40) {
        rawSuitability = 'favorable';
        rawLabel = 'Favorable Window';
      } else if (avgAqi <= 60) {
        rawSuitability = 'moderate_caution';
        rawLabel = 'Moderate Caution';
      } else {
        rawSuitability = 'limit_exposure';
        rawLabel = 'Limit Outdoor Time';
      }
    }
  } else {
    // US EPA AQI thresholds
    if (activity === 'indoor_ventilation') {
      if (avgAqi <= 55) {
        rawSuitability = 'favorable';
        rawLabel = 'Favorable Window';
      } else if (avgAqi <= 95) {
        rawSuitability = 'moderate_caution';
        rawLabel = 'Brief Ventilation Only';
      } else {
        rawSuitability = 'limit_exposure';
        rawLabel = 'Keep Windows Closed';
      }
    } else if (exertion === 'high') {
      if (avgAqi <= 50) {
        rawSuitability = 'favorable';
        rawLabel = 'Favorable Window';
      } else if (avgAqi <= 100) {
        rawSuitability = 'moderate_caution';
        rawLabel = 'Moderate — Pace Intensity';
      } else {
        rawSuitability = 'limit_exposure';
        rawLabel = 'Prefer Indoor Alternative';
      }
    } else if (exertion === 'moderate') {
      if (avgAqi <= 75) {
        rawSuitability = 'favorable';
        rawLabel = 'Favorable Window';
      } else if (avgAqi <= 125) {
        rawSuitability = 'moderate_caution';
        rawLabel = 'Moderate Caution';
      } else {
        rawSuitability = 'limit_exposure';
        rawLabel = 'Limit Duration';
      }
    } else {
      if (avgAqi <= 100) {
        rawSuitability = 'favorable';
        rawLabel = 'Favorable Window';
      } else if (avgAqi <= 150) {
        rawSuitability = 'moderate_caution';
        rawLabel = 'Moderate Caution';
      } else {
        rawSuitability = 'limit_exposure';
        rawLabel = 'Limit Outdoor Time';
      }
    }
  }

  // Never emit unqualified 'Favorable Window' when underlying dataset is stale or incomplete.
  if (degradedConfidence && rawSuitability === 'favorable') {
    return {
      suitability: 'moderate_caution',
      label: 'Tentative — Unverified Forecast Data',
    };
  }

  return { suitability: rawSuitability, label: rawLabel };
}

export function computeRoutineWindows(
  dataset: EnvironmentalDataset | null,
  activity: ActivityType,
  targetDate: string,
  preferredScale: AqiScale = 'us_aqi',
): {
  windows: RoutineWindow[];
  bestWindow: RoutineWindow | null;
  activityLabel: string;
} {
  const actMeta = ACTIVITIES_META.find((a) => a.id === activity) ?? ACTIVITIES_META[0];
  if (!dataset || dataset.hourly.length === 0) {
    return { windows: [], bestWindow: null, activityLabel: actMeta.label };
  }

  const dayPoints = dataset.hourly.filter((h) => h.time.startsWith(targetDate));
  if (dayPoints.length === 0) {
    return { windows: [], bestWindow: null, activityLabel: actMeta.label };
  }

  const slots = [
    { startHour: 6, endHour: 9, label: 'Early Morning' },
    { startHour: 9, endHour: 12, label: 'Late Morning' },
    { startHour: 12, endHour: 15, label: 'Afternoon' },
    { startHour: 15, endHour: 18, label: 'Late Afternoon' },
    { startHour: 18, endHour: 21, label: 'Evening' },
  ];

  const degradedConfidence = dataset.isStale || dataset.completenessRatio < 0.6;
  const scaleName = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
  const windows: RoutineWindow[] = [];

  for (const slot of slots) {
    const block = dayPoints.filter((p) => {
      const hr = Number(p.time.slice(11, 13));
      return Number.isFinite(hr) && hr >= slot.startHour && hr < slot.endHour;
    });

    if (block.length === 0) continue;

    const usAqis = block.map((b) => b.us_aqi).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const euAqis = block.map((b) => b.european_aqi).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const pm25s = block.map((b) => b.pm2_5).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const temps = block.map((b) => b.temperature_2m).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const winds = block.map((b) => b.wind_speed_10m).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const weatherCodes = block.map((b) => b.weather_code).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

    const avgUsAqi = usAqis.length > 0 ? Math.round(usAqis.reduce((a, b) => a + b, 0) / usAqis.length) : null;
    const avgEuAqi = euAqis.length > 0 ? Math.round(euAqis.reduce((a, b) => a + b, 0) / euAqis.length) : null;
    const avgPm25 = avg(pm25s);
    const avgTempC = avg(temps);
    const avgWindKmh = avg(winds);
    const weatherLabel = weatherCodes.length > 0 ? getWeatherLabel(weatherCodes[0]) : 'Conditions unavailable';

    const activeAqi = preferredScale === 'european_aqi' ? avgEuAqi : avgUsAqi;
    const { suitability, label } = evaluateWindowSuitability(
      activeAqi,
      preferredScale,
      actMeta.exertion,
      activity,
      degradedConfidence,
    );
    const cat = interpretAqiCategory(activeAqi, preferredScale);

    let rationale =
      activeAqi !== null
        ? `Modelled ${scaleName} averages ${activeAqi} (${cat.shortLabel}) with PM2.5 around ${avgPm25 ?? '—'} µg/m³`
        : `Forecast ${scaleName} data is missing for this time block.`;
    if (avgTempC !== null && avgWindKmh !== null) {
      rationale += `; ${weatherLabel.toLowerCase()}, ${avgTempC}°C, wind ${avgWindKmh} km/h.`;
    }
    const elevatedDispersionWarning =
      preferredScale === 'european_aqi'
        ? activeAqi !== null && activeAqi > 30
        : activeAqi !== null && activeAqi > 70;
    if (avgWindKmh !== null && avgWindKmh < 6 && elevatedDispersionWarning) {
      rationale += ' Light winds may slow local pollutant dispersion.';
    }
    if (degradedConfidence) {
      rationale += ' Confidence is reduced because the dataset is stale or incomplete.';
    }

    const alternativeAction =
      suitability === 'insufficient_data'
        ? 'Forecast index values are missing for this window; verify fresh readings before planning outdoor exertion.'
        : suitability === 'limit_exposure'
          ? activity === 'indoor_ventilation'
            ? 'Use recirculating HEPA filtration and kitchen exhaust fans rather than opening exterior windows.'
            : 'Move workout indoors (treadmill, bodyweight mobility, or indoor cycling) or defer to a lower-AQI window.'
          : suitability === 'moderate_caution'
            ? degradedConfidence
              ? 'Treat this slot cautiously and refresh environmental data before intense exertion.'
              : 'Reduce peak intensity, avoid arterial roadside routes, and keep duration moderate.'
            : 'Prefer tree-lined or low-traffic routes; remain attentive to local smoke or traffic spikes.';

    windows.push({
      startTime: `${targetDate}T${String(slot.startHour).padStart(2, '0')}:00`,
      endTime: `${targetDate}T${String(slot.endHour).padStart(2, '0')}:00`,
      avgUsAqi,
      avgEuAqi,
      avgPm25,
      avgTempC,
      avgWindKmh,
      weatherLabel,
      suitability,
      suitabilityLabel: label,
      rationale,
      alternativeAction,
    });
  }

  const getScore = (w: RoutineWindow): number | null =>
    preferredScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi;

  const scored = windows
    .filter((w) => getScore(w) !== null)
    .sort((a, b) => (getScore(a) ?? 999) - (getScore(b) ?? 999));

  const bestWindow = scored.length > 0 ? scored[0] : null;
  return { windows, bestWindow, activityLabel: actMeta.label };
}

export function runSmartRoutineAgent(
  dataset: EnvironmentalDataset | null,
  activity: ActivityType = 'outdoor_exercise',
  targetDate?: string,
  preferredScale: AqiScale = 'us_aqi',
): { agentResult: AgentResult; windows: RoutineWindow[]; bestWindow: RoutineWindow | null; resolvedDate: string } {
  const defaultDate = dataset?.currentTimestamp.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const resolvedDate = targetDate || defaultDate;

  if (!dataset) {
    return {
      agentResult: {
        agent_name: 'Smart Routine Agent',
        status: 'failed',
        observations: ['Forecast hourly data is unavailable; cannot compute reliable activity time windows.'],
        recommendation: 'Retry fetching forecast data before scheduling outdoor routines.',
        evidence: [],
        data_timestamp: 'Unavailable',
        confidence: 'low',
        limitations: ['Missing forecast dataset; no invented time windows will be returned.'],
      },
      windows: [],
      bestWindow: null,
      resolvedDate,
    };
  }

  const { windows, bestWindow, activityLabel } = computeRoutineWindows(
    dataset,
    activity,
    resolvedDate,
    preferredScale,
  );

  if (windows.length === 0) {
    return {
      agentResult: {
        agent_name: 'Smart Routine Agent',
        status: 'partial',
        observations: [`No hourly forecast blocks found for ${resolvedDate} in the current Open-Meteo horizon.`],
        recommendation: `Select a date within the available forecast window (starting ${dataset.currentTimestamp.slice(0, 10)}) to compare time slots.`,
        evidence: [`Available hourly points: ${dataset.hourly.length}`],
        data_timestamp: dataset.currentTimestamp,
        confidence: 'low',
        limitations: ['Requested date falls outside the retrieved forecast horizon.'],
      },
      windows: [],
      bestWindow: null,
      resolvedDate,
    };
  }

  const scaleName = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
  const degradedConfidence = dataset.isStale || dataset.completenessRatio < 0.6;
  const bestVal = bestWindow
    ? preferredScale === 'european_aqi'
      ? bestWindow.avgEuAqi
      : bestWindow.avgUsAqi
    : null;

  const observations = windows.map((w) => {
    const startHr = w.startTime.slice(11, 16);
    const endHr = w.endTime.slice(11, 16);
    const val = preferredScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi;
    return `${startHr}–${endHr}: ${w.suitabilityLabel} (${scaleName} ~${val ?? 'N/A'}, ${w.weatherLabel}, ${w.avgTempC ?? '—'}°C).`;
  });

  let recommendation = '';
  if (degradedConfidence) {
    recommendation = bestWindow
      ? `Data is ${dataset.isStale ? 'stale' : 'incomplete'} (${Math.round(dataset.completenessRatio * 100)}% complete), so routine windows on ${resolvedDate} cannot be recommended with high confidence. Tentatively, ${bestWindow.startTime.slice(11, 16)}–${bestWindow.endTime.slice(11, 16)} shows the lowest ${scaleName} (~${bestVal ?? 'N/A'}); refresh data before strenuous outdoor ${activityLabel.toLowerCase()}.`
      : `Data is ${dataset.isStale ? 'stale' : 'incomplete'} and forecast ${scaleName} values are missing for ${resolvedDate}; postpone confident outdoor scheduling until fresh data loads.`;
  } else if (bestWindow && bestWindow.suitability !== 'limit_exposure' && bestWindow.suitability !== 'insufficient_data') {
    recommendation = `Relative lowest-exposure window for ${activityLabel} on ${resolvedDate} is ${bestWindow.startTime.slice(11, 16)}–${bestWindow.endTime.slice(11, 16)} (${bestWindow.suitabilityLabel}, ${scaleName} ~${bestVal ?? 'N/A'}). ${bestWindow.alternativeAction}`;
  } else if (bestWindow && bestWindow.suitability === 'limit_exposure') {
    recommendation = `All forecast windows on ${resolvedDate} show elevated modelled pollution (lowest ${scaleName} ~${bestVal ?? 'N/A'}). Postponing intense outdoor ${activityLabel.toLowerCase()} or switching to an indoor alternative is advisable.`;
  } else {
    recommendation = `Forecast ${scaleName} values are incomplete for ${resolvedDate}; avoid assuming any time slot is low-risk.`;
  }

  const limitations = [
    'No time window can be guaranteed completely safe; modelled forecasts do not capture sudden local street-level emissions or burning events.',
  ];
  if (dataset.isStale) {
    limitations.push(`Underlying dataset is stale (${dataset.dataAgeMinutes}m old); window rankings require refresh.`);
  }
  if (dataset.completenessRatio < 0.6) {
    limitations.push(`Underlying dataset is incomplete (${Math.round(dataset.completenessRatio * 100)}% fields available).`);
  }

  const hasMissingWindowMetrics = windows.some((w) => w.suitability === 'insufficient_data');

  return {
    agentResult: {
      agent_name: 'Smart Routine Agent',
      status: degradedConfidence || hasMissingWindowMetrics ? 'partial' : 'completed',
      observations,
      recommendation,
      evidence: [
        `Evaluated ${windows.length} 3-hour forecast windows on ${resolvedDate} using ${scaleName}`,
        ...(bestWindow
          ? [`Lowest modelled window: ${bestWindow.startTime.slice(11, 16)}–${bestWindow.endTime.slice(11, 16)} (${scaleName} ~${bestVal ?? 'N/A'})`]
          : []),
      ],
      data_timestamp: dataset.currentTimestamp,
      confidence: degradedConfidence || !bestWindow ? 'low' : 'moderate',
      limitations,
    },
    windows,
    bestWindow,
    resolvedDate,
  };
}
