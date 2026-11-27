import { ACTIVITIES_META } from '../config/constants.ts';
import { getWeatherLabel, interpretAqiCategory } from '../utils/aqi.ts';
import {
  addDaysToIsoDate,
  evaluateWindowTimeValidity,
  getLocalDateTimeContext,
  type LocalDateTimeContext,
} from '../utils/localTime.ts';
import type {
  ActivityType,
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  RoutineWindow,
} from '../types/airQuality.ts';

const MIN_REMAINING_MINUTES_IN_WINDOW = 90;

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
  options?: { referenceNowMs?: number },
): {
  windows: RoutineWindow[];
  bestWindow: RoutineWindow | null;
  activityLabel: string;
  excludedPastCount: number;
  localNow: LocalDateTimeContext;
} {
  const actMeta = ACTIVITIES_META.find((a) => a.id === activity) ?? ACTIVITIES_META[0];
  const localNow = getLocalDateTimeContext({
    timezone: dataset?.location.timezone,
    utcOffsetSeconds: dataset?.utcOffsetSeconds,
    referenceNowMs: options?.referenceNowMs,
  });

  if (!dataset || dataset.hourly.length === 0) {
    return {
      windows: [],
      bestWindow: null,
      activityLabel: actMeta.label,
      excludedPastCount: 0,
      localNow,
    };
  }

  const dayPoints = dataset.hourly.filter((h) => h.time.startsWith(targetDate));
  if (dayPoints.length === 0) {
    return {
      windows: [],
      bestWindow: null,
      activityLabel: actMeta.label,
      excludedPastCount: 0,
      localNow,
    };
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
  let excludedPastCount = 0;

  for (const slot of slots) {
    const startTime = `${targetDate}T${String(slot.startHour).padStart(2, '0')}:00`;
    const endTime = `${targetDate}T${String(slot.endHour).padStart(2, '0')}:00`;

    // Strictly validate against current local clock in the location's timezone
    const timeCheck = evaluateWindowTimeValidity(
      startTime,
      endTime,
      localNow,
      MIN_REMAINING_MINUTES_IN_WINDOW,
    );
    if (!timeCheck.isValid) {
      excludedPastCount += 1;
      continue;
    }

    const block = dayPoints.filter((p) => {
      const hr = Number(p.time.slice(11, 13));
      if (!Number.isFinite(hr)) return false;
      if (timeCheck.status === 'in_progress' && targetDate === localNow.localDate) {
        return hr >= Math.max(slot.startHour, localNow.localHour) && hr < slot.endHour;
      }
      return hr >= slot.startHour && hr < slot.endHour;
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

    const remainingPrefix =
      timeCheck.status === 'in_progress'
        ? `In progress (~${timeCheck.remainingMinutes}m remaining before ${endTime.slice(11, 16)}). `
        : '';

    let rationale =
      activeAqi !== null
        ? `${remainingPrefix}Modelled ${scaleName} averages ${activeAqi} (${cat.shortLabel}) with PM2.5 around ${avgPm25 ?? '—'} µg/m³`
        : `${remainingPrefix}Forecast ${scaleName} data is missing for this time block.`;
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
      startTime,
      endTime,
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
      timeStatus: timeCheck.status === 'in_progress' ? 'in_progress' : 'future',
      remainingMinutes: timeCheck.remainingMinutes,
    });
  }

  const getScore = (w: RoutineWindow): number | null =>
    preferredScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi;

  const scored = windows
    .filter((w) => getScore(w) !== null)
    .sort((a, b) => (getScore(a) ?? 999) - (getScore(b) ?? 999));

  const bestWindow = scored.length > 0 ? scored[0] : null;
  return {
    windows,
    bestWindow,
    activityLabel: actMeta.label,
    excludedPastCount,
    localNow,
  };
}

export function runSmartRoutineAgent(
  dataset: EnvironmentalDataset | null,
  activity: ActivityType = 'outdoor_exercise',
  targetDate?: string,
  preferredScale: AqiScale = 'us_aqi',
  options?: { referenceNowMs?: number; autoAdvanceIfElapsed?: boolean },
): {
  agentResult: AgentResult;
  windows: RoutineWindow[];
  bestWindow: RoutineWindow | null;
  resolvedDate: string;
  localTimeLabel: string;
  excludedPastCount: number;
  rolledOverFromDate?: string;
} {
  const localNow = getLocalDateTimeContext({
    timezone: dataset?.location.timezone,
    utcOffsetSeconds: dataset?.utcOffsetSeconds,
    referenceNowMs: options?.referenceNowMs,
  });

  const initialDate = targetDate || localNow.localDate;

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
      resolvedDate: initialDate,
      localTimeLabel: `${localNow.localTimeLabel} (${localNow.timezone})`,
      excludedPastCount: 0,
    };
  }

  let resolvedDate = initialDate;
  let rolledOverFromDate: string | undefined;
  let computed = computeRoutineWindows(dataset, activity, resolvedDate, preferredScale, {
    referenceNowMs: options?.referenceNowMs,
  });

  // If today's daytime/evening windows have all elapsed and autoAdvanceIfElapsed is allowed, inspect next forecast day
  const canRollOver =
    options?.autoAdvanceIfElapsed !== false &&
    resolvedDate === localNow.localDate &&
    computed.windows.length === 0;

  if (canRollOver) {
    const nextDate = addDaysToIsoDate(localNow.localDate, 1);
    const tomorrowComputed = computeRoutineWindows(dataset, activity, nextDate, preferredScale, {
      referenceNowMs: options?.referenceNowMs,
    });
    if (tomorrowComputed.windows.length > 0) {
      rolledOverFromDate = resolvedDate;
      resolvedDate = nextDate;
      computed = {
        ...tomorrowComputed,
        excludedPastCount: computed.excludedPastCount + tomorrowComputed.excludedPastCount,
      };
    }
  }

  const { windows, bestWindow, activityLabel, excludedPastCount } = computed;
  const localClockStr = `${localNow.localTimeLabel} (${localNow.timezone})`;

  if (windows.length === 0) {
    const allElapsedToday = resolvedDate === localNow.localDate && excludedPastCount > 0;
    const obsMsg = allElapsedToday
      ? `All daytime/evening 3-hour forecast slots for ${resolvedDate} have elapsed or have under ${MIN_REMAINING_MINUTES_IN_WINDOW} minutes remaining as of ${localClockStr}, and no upcoming forecast windows remain available in the retrieved horizon.`
      : `No valid future forecast blocks found for ${resolvedDate} after ${localClockStr} in the current Open-Meteo horizon.`;

    const recMsg = allElapsedToday
      ? `No remaining reliable outdoor windows are available today (${resolvedDate} after ${localClockStr}). Select tomorrow's forecast date or check back after the next forecast update.`
      : `No reliable future windows are available for ${resolvedDate}; select an upcoming forecast date within the Open-Meteo horizon.`;

    return {
      agentResult: {
        agent_name: 'Smart Routine Agent',
        status: 'partial',
        observations: [obsMsg],
        recommendation: recMsg,
        evidence: [
          `Local clock (${dataset.location.name}): ${localNow.localDate} ${localClockStr}`,
          `Excluded elapsed/insufficient-duration slots: ${excludedPastCount}`,
        ],
        data_timestamp: dataset.currentTimestamp,
        confidence: 'low',
        limitations: ['Past or nearly elapsed time windows are excluded so expired slots are never recommended.'],
      },
      windows: [],
      bestWindow: null,
      resolvedDate,
      localTimeLabel: localClockStr,
      excludedPastCount,
      rolledOverFromDate,
    };
  }

  const scaleName = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
  const degradedConfidence = dataset.isStale || dataset.completenessRatio < 0.6;
  const bestVal = bestWindow
    ? preferredScale === 'european_aqi'
      ? bestWindow.avgEuAqi
      : bestWindow.avgUsAqi
    : null;

  const observations: string[] = [];
  if (rolledOverFromDate) {
    observations.push(
      `All daytime/evening slots for ${rolledOverFromDate} have elapsed as of ${localClockStr}; evaluating tomorrow's (${resolvedDate}) upcoming windows instead.`,
    );
  } else if (excludedPastCount > 0) {
    observations.push(
      `Excluded ${excludedPastCount} elapsed window(s) prior to current local time (${localClockStr}).`,
    );
  }

  for (const w of windows) {
    const startHr = w.startTime.slice(11, 16);
    const endHr = w.endTime.slice(11, 16);
    const val = preferredScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi;
    const statusTag = w.timeStatus === 'in_progress' ? ` [In progress · ~${w.remainingMinutes}m left]` : '';
    observations.push(
      `${resolvedDate} ${startHr}–${endHr}${statusTag}: ${w.suitabilityLabel} (${scaleName} ~${val ?? 'N/A'}, ${w.weatherLabel}, ${w.avgTempC ?? '—'}°C).`,
    );
  }

  const bestRange = bestWindow
    ? `${resolvedDate} ${bestWindow.startTime.slice(11, 16)}–${bestWindow.endTime.slice(11, 16)}`
    : resolvedDate;

  let recommendation = '';
  const rolloverIntro = rolledOverFromDate
    ? `All outdoor slots for ${rolledOverFromDate} have elapsed as of ${localClockStr}. `
    : '';

  if (degradedConfidence) {
    recommendation = bestWindow
      ? `${rolloverIntro}Data is ${dataset.isStale ? 'stale' : 'incomplete'} (${Math.round(dataset.completenessRatio * 100)}% complete), so routine windows on ${resolvedDate} cannot be recommended with high confidence. Tentatively, ${bestRange} shows the lowest ${scaleName} (~${bestVal ?? 'N/A'}); refresh data before strenuous outdoor ${activityLabel.toLowerCase()}.`
      : `${rolloverIntro}Data is ${dataset.isStale ? 'stale' : 'incomplete'} and forecast ${scaleName} values are missing for ${resolvedDate}; postpone confident outdoor scheduling until fresh data loads.`;
  } else if (bestWindow && bestWindow.suitability !== 'limit_exposure' && bestWindow.suitability !== 'insufficient_data') {
    recommendation = `${rolloverIntro}Lowest-exposure upcoming window for ${activityLabel} is ${bestRange} (${bestWindow.suitabilityLabel}, ${scaleName} ~${bestVal ?? 'N/A'}). ${bestWindow.alternativeAction}`;
  } else if (bestWindow && bestWindow.suitability === 'limit_exposure') {
    recommendation = `${rolloverIntro}All upcoming forecast windows on ${resolvedDate} show elevated modelled pollution (lowest ${scaleName} ~${bestVal ?? 'N/A'}). Postponing intense outdoor ${activityLabel.toLowerCase()} or switching to an indoor alternative is advisable.`;
  } else {
    recommendation = `${rolloverIntro}Forecast ${scaleName} values are incomplete for upcoming slots on ${resolvedDate}; avoid assuming any time slot is low-risk.`;
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
        `Local clock (${dataset.location.name}): ${localNow.localDate} ${localClockStr}`,
        `Evaluated ${windows.length} upcoming forecast window(s) on ${resolvedDate} using ${scaleName} (excluded ${excludedPastCount} past/insufficient slot(s))`,
        ...(bestWindow
          ? [`Lowest modelled upcoming window: ${bestRange} (${scaleName} ~${bestVal ?? 'N/A'})`]
          : []),
      ],
      data_timestamp: dataset.currentTimestamp,
      confidence: degradedConfidence || !bestWindow ? 'low' : 'moderate',
      limitations,
    },
    windows,
    bestWindow,
    resolvedDate,
    localTimeLabel: localClockStr,
    excludedPastCount,
    rolledOverFromDate,
  };
}
