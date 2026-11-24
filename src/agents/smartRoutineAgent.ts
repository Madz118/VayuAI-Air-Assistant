import { ACTIVITIES_META } from '../config/constants.ts';
import { getWeatherLabel, interpretAqiCategory } from '../utils/aqi.ts';
import type {
  ActivityType,
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  RoutinePlanResult,
  RoutineWindow,
} from '../types/airQuality.ts';

function evaluateWindowSuitability(
  avgUsAqi: number | null,
  exertion: 'high' | 'moderate' | 'low',
  activity: ActivityType,
): { suitability: RoutineWindow['suitability']; label: string } {
  if (avgUsAqi === null) {
    return { suitability: 'insufficient_data', label: 'Insufficient Forecast Data' };
  }
  if (activity === 'indoor_ventilation') {
    if (avgUsAqi <= 55) return { suitability: 'favorable', label: 'Favorable Window' };
    if (avgUsAqi <= 95) return { suitability: 'moderate_caution', label: 'Brief Ventilation Only' };
    return { suitability: 'limit_exposure', label: 'Keep Windows Closed' };
  }
  if (exertion === 'high') {
    if (avgUsAqi <= 50) return { suitability: 'favorable', label: 'Favorable Window' };
    if (avgUsAqi <= 100) return { suitability: 'moderate_caution', label: 'Moderate — Pace Intensity' };
    return { suitability: 'limit_exposure', label: 'Prefer Indoor Alternative' };
  }
  if (exertion === 'moderate') {
    if (avgUsAqi <= 75) return { suitability: 'favorable', label: 'Favorable Window' };
    if (avgUsAqi <= 125) return { suitability: 'moderate_caution', label: 'Moderate Caution' };
    return { suitability: 'limit_exposure', label: 'Limit Duration' };
  }
  if (avgUsAqi <= 100) return { suitability: 'favorable', label: 'Favorable Window' };
  if (avgUsAqi <= 150) return { suitability: 'moderate_caution', label: 'Moderate Caution' };
  return { suitability: 'limit_exposure', label: 'Limit Outdoor Time' };
}

export function computeRoutineWindows(
  dataset: EnvironmentalDataset | null,
  activity: ActivityType,
  targetDate: string,
): {
  windows: RoutineWindow[];
  bestWindow: RoutineWindow | null;
  activityLabel: string;
} {
  const actMeta = ACTIVITIES_META.find((a) => a.id === activity) ?? ACTIVITIES_META[0];
  if (!dataset || dataset.hourly.length === 0) {
    return { windows: [], bestWindow: null, activityLabel: actMeta.label };
  }

  // Filter hourly points matching targetDate (YYYY-MM-DD)
  const dayPoints = dataset.hourly.filter((h) => h.time.startsWith(targetDate));
  if (dayPoints.length === 0) {
    return { windows: [], bestWindow: null, activityLabel: actMeta.label };
  }

  // Group into 3-hour blocks across waking/active hours (06:00 - 21:00)
  const slots = [
    { startHour: 6, endHour: 9, label: 'Early Morning' },
    { startHour: 9, endHour: 12, label: 'Late Morning' },
    { startHour: 12, endHour: 15, label: 'Afternoon' },
    { startHour: 15, endHour: 18, label: 'Late Afternoon' },
    { startHour: 18, endHour: 21, label: 'Evening' },
  ];

  const windows: RoutineWindow[] = [];

  for (const slot of slots) {
    const block = dayPoints.filter((p) => {
      const hr = Number(p.time.slice(11, 13));
      return Number.isFinite(hr) && hr >= slot.startHour && hr < slot.endHour;
    });

    if (block.length === 0) continue;

    const usAqis = block.map((b) => b.us_aqi).filter((v): v is number => typeof v === 'number');
    const euAqis = block.map((b) => b.european_aqi).filter((v): v is number => typeof v === 'number');
    const pm25s = block.map((b) => b.pm2_5).filter((v): v is number => typeof v === 'number');
    const temps = block.map((b) => b.temperature_2m).filter((v): v is number => typeof v === 'number');
    const winds = block.map((b) => b.wind_speed_10m).filter((v): v is number => typeof v === 'number');
    const weatherCodes = block.map((b) => b.weather_code).filter((v): v is number => typeof v === 'number');

    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

    const avgUsAqi = usAqis.length > 0 ? Math.round(usAqis.reduce((a, b) => a + b, 0) / usAqis.length) : null;
    const avgEuAqi = euAqis.length > 0 ? Math.round(euAqis.reduce((a, b) => a + b, 0) / euAqis.length) : null;
    const avgPm25 = avg(pm25s);
    const avgTempC = avg(temps);
    const avgWindKmh = avg(winds);
    const weatherLabel = weatherCodes.length > 0 ? getWeatherLabel(weatherCodes[0]) : 'Conditions unavailable';

    const { suitability, label } = evaluateWindowSuitability(avgUsAqi, actMeta.exertion, activity);
    const cat = interpretAqiCategory(avgUsAqi, 'us_aqi');

    let rationale =
      avgUsAqi !== null
        ? `Modelled US AQI averages ${avgUsAqi} (${cat.shortLabel}) with PM2.5 around ${avgPm25 ?? '—'} µg/m³`
        : 'Forecast US AQI data is missing for this time block.';
    if (avgTempC !== null && avgWindKmh !== null) {
      rationale += `; ${weatherLabel.toLowerCase()}, ${avgTempC}°C, wind ${avgWindKmh} km/h.`;
    }
    if (avgWindKmh !== null && avgWindKmh < 6 && avgUsAqi !== null && avgUsAqi > 70) {
      rationale += ' Light winds may slow local pollutant dispersion.';
    }

    const alternativeAction =
      suitability === 'limit_exposure'
        ? activity === 'indoor_ventilation'
          ? 'Use recirculating HEPA filtration and kitchen exhaust fans rather than opening exterior windows.'
          : 'Move workout indoors (treadmill, bodyweight mobility, or indoor cycling) or defer to a lower-AQI window.'
        : suitability === 'moderate_caution'
          ? 'Reduce peak intensity, avoid arterial roadside routes, and keep duration moderate.'
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

  const scored = windows
    .filter((w) => w.avgUsAqi !== null)
    .sort((a, b) => (a.avgUsAqi ?? 999) - (b.avgUsAqi ?? 999));

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

  const { windows, bestWindow, activityLabel } = computeRoutineWindows(dataset, activity, resolvedDate);

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

  const observations = windows.map((w) => {
    const startHr = w.startTime.slice(11, 16);
    const endHr = w.endTime.slice(11, 16);
    const val = preferredScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi;
    const scaleName = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
    return `${startHr}–${endHr}: ${w.suitabilityLabel} (${scaleName} ~${val ?? 'N/A'}, ${w.weatherLabel}, ${w.avgTempC ?? '—'}°C).`;
  });

  let recommendation = '';
  if (bestWindow && bestWindow.suitability !== 'limit_exposure') {
    recommendation = `Relative lowest-exposure window for ${activityLabel} on ${resolvedDate} is ${bestWindow.startTime.slice(11, 16)}–${bestWindow.endTime.slice(11, 16)} (${bestWindow.suitabilityLabel}). ${bestWindow.alternativeAction}`;
  } else if (bestWindow) {
    recommendation = `All forecast windows on ${resolvedDate} show elevated modelled pollution (lowest US AQI ~${bestWindow.avgUsAqi}). Postponing intense outdoor ${activityLabel.toLowerCase()} or switching to an indoor alternative is advisable.`;
  } else {
    recommendation = 'Forecast AQI values are incomplete for this date; avoid assuming any time slot is low-risk.';
  }

  return {
    agentResult: {
      agent_name: 'Smart Routine Agent',
      status: 'completed',
      observations,
      recommendation,
      evidence: [
        `Evaluated ${windows.length} 3-hour forecast windows on ${resolvedDate}`,
        ...(bestWindow ? [`Lowest modelled window: ${bestWindow.startTime.slice(11, 16)}–${bestWindow.endTime.slice(11, 16)} (US AQI ~${bestWindow.avgUsAqi})`] : []),
      ],
      data_timestamp: dataset.currentTimestamp,
      confidence: dataset.isStale ? 'low' : 'moderate',
      limitations: [
        'No time window can be guaranteed completely safe; modelled forecasts do not capture sudden local street-level emissions or burning events.',
      ],
    },
    windows,
    bestWindow,
    resolvedDate,
  };
}
