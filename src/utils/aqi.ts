import { POLLUTANT_META, WMO_WEATHER_LABELS } from '../config/constants.ts';
import type {
  AqiCategoryInfo,
  AqiScale,
  HourlyAirQualityPoint,
  PollutantMetric,
} from '../types/airQuality.ts';

/**
 * Interprets a numeric AQI value strictly under its declared scale (US EPA AQI or European EAQI).
 * Never conflates US AQI with Indian CPCB AQI.
 */
export function interpretAqiCategory(value: number | null | undefined, scale: AqiScale = 'us_aqi'): AqiCategoryInfo {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return {
      scale,
      value: null,
      level: 'unknown',
      label: 'Unavailable',
      shortLabel: 'Unavailable',
      description: 'No valid modelled AQI reading is available for this timestamp.',
      colorHex: '#9BB0C0',
      bgTintClass: 'bg-slate-800/60',
      borderTintClass: 'border-white/10',
      textTintClass: 'text-[#9BB0C0]',
    };
  }

  if (scale === 'european_aqi') {
    if (value <= 20) {
      return {
        scale,
        value: Math.round(value),
        level: 'good',
        label: 'Good (EU EAQI)',
        shortLabel: 'Good',
        description: 'Low modelled pollutant burden under the European Air Quality Index (0–20).',
        colorHex: '#22C55E',
        bgTintClass: 'bg-emerald-500/10',
        borderTintClass: 'border-emerald-400/25',
        textTintClass: 'text-emerald-300',
      };
    }
    if (value <= 40) {
      return {
        scale,
        value: Math.round(value),
        level: 'moderate',
        label: 'Fair (EU EAQI)',
        shortLabel: 'Fair',
        description: 'Acceptable modelled air quality for most people (EU EAQI 21–40).',
        colorHex: '#49E3D0',
        bgTintClass: 'bg-teal-500/10',
        borderTintClass: 'border-teal-400/25',
        textTintClass: 'text-[#49E3D0]',
      };
    }
    if (value <= 60) {
      return {
        scale,
        value: Math.round(value),
        level: 'sensitive',
        label: 'Moderate (EU EAQI)',
        shortLabel: 'Moderate',
        description: 'Sensitive individuals should consider moderating prolonged outdoor exertion (EU EAQI 41–60).',
        colorHex: '#F59E0B',
        bgTintClass: 'bg-amber-500/10',
        borderTintClass: 'border-amber-400/25',
        textTintClass: 'text-amber-300',
      };
    }
    if (value <= 80) {
      return {
        scale,
        value: Math.round(value),
        level: 'unhealthy',
        label: 'Poor (EU EAQI)',
        shortLabel: 'Poor',
        description: 'Elevated modelled pollution; reduce strenuous outdoor activity (EU EAQI 61–80).',
        colorHex: '#F97316',
        bgTintClass: 'bg-orange-500/10',
        borderTintClass: 'border-orange-400/25',
        textTintClass: 'text-orange-300',
      };
    }
    if (value <= 100) {
      return {
        scale,
        value: Math.round(value),
        level: 'very_unhealthy',
        label: 'Very Poor (EU EAQI)',
        shortLabel: 'Very Poor',
        description: 'High modelled pollutant load; move intense activities indoors (EU EAQI 81–100).',
        colorHex: '#EF4444',
        bgTintClass: 'bg-red-500/10',
        borderTintClass: 'border-red-400/25',
        textTintClass: 'text-red-300',
      };
    }
    return {
      scale,
      value: Math.round(value),
      level: 'hazardous',
      label: 'Extremely Poor (EU EAQI)',
      shortLabel: 'Extremely Poor',
      description: 'Severe modelled pollution; avoid outdoor exertion and keep indoor air filtered (EU EAQI >100).',
      colorHex: '#DC2626',
      bgTintClass: 'bg-red-600/15',
      borderTintClass: 'border-red-500/35',
      textTintClass: 'text-red-300',
    };
  }

  // Default: US EPA AQI scale (0 - 500+)
  if (value <= 50) {
    return {
      scale: 'us_aqi',
      value: Math.round(value),
      level: 'good',
      label: 'Good (US AQI)',
      shortLabel: 'Good',
      description: 'Modelled US AQI is 0–50. Air quality is satisfactory with low expected exposure risk.',
      colorHex: '#22C55E',
      bgTintClass: 'bg-emerald-500/10',
      borderTintClass: 'border-emerald-400/25',
      textTintClass: 'text-emerald-300',
    };
  }
  if (value <= 100) {
    return {
      scale: 'us_aqi',
      value: Math.round(value),
      level: 'moderate',
      label: 'Moderate (US AQI)',
      shortLabel: 'Moderate',
      description: 'Modelled US AQI is 51–100. Acceptable for most, though unusually sensitive groups may notice mild irritation.',
      colorHex: '#F59E0B',
      bgTintClass: 'bg-amber-500/10',
      borderTintClass: 'border-amber-400/25',
      textTintClass: 'text-amber-300',
    };
  }
  if (value <= 150) {
    return {
      scale: 'us_aqi',
      value: Math.round(value),
      level: 'sensitive',
      label: 'Unhealthy for Sensitive Groups (US AQI)',
      shortLabel: 'Sensitive Groups',
      description: 'Modelled US AQI is 101–150. Children, older adults, and people with respiratory sensitivities should shorten intense outdoor exertion.',
      colorHex: '#F97316',
      bgTintClass: 'bg-orange-500/10',
      borderTintClass: 'border-orange-400/25',
      textTintClass: 'text-orange-300',
    };
  }
  if (value <= 200) {
    return {
      scale: 'us_aqi',
      value: Math.round(value),
      level: 'unhealthy',
      label: 'Unhealthy (US AQI)',
      shortLabel: 'Unhealthy',
      description: 'Modelled US AQI is 151–200. Everyone may begin to experience effects; shift heavy exertion indoors.',
      colorHex: '#EF4444',
      bgTintClass: 'bg-red-500/10',
      borderTintClass: 'border-red-400/25',
      textTintClass: 'text-red-300',
    };
  }
  if (value <= 300) {
    return {
      scale: 'us_aqi',
      value: Math.round(value),
      level: 'very_unhealthy',
      label: 'Very Unhealthy (US AQI)',
      shortLabel: 'Very Unhealthy',
      description: 'Modelled US AQI is 201–300. Health alert conditions; avoid prolonged outdoor physical activity.',
      colorHex: '#DC2626',
      bgTintClass: 'bg-red-600/15',
      borderTintClass: 'border-red-500/35',
      textTintClass: 'text-red-300',
    };
  }
  return {
    scale: 'us_aqi',
    value: Math.round(value),
    level: 'hazardous',
    label: 'Hazardous (US AQI)',
    shortLabel: 'Hazardous',
    description: 'Modelled US AQI exceeds 300. Stay indoors with clean air filtration and minimize outdoor exposure.',
    colorHex: '#B91C1C',
    bgTintClass: 'bg-red-700/20',
    borderTintClass: 'border-red-500/45',
    textTintClass: 'text-red-200',
  };
}

export function buildPollutantBreakdown(point: Partial<HourlyAirQualityPoint>): PollutantMetric[] {
  const keys = Object.keys(POLLUTANT_META) as Array<keyof typeof POLLUTANT_META>;
  return keys.map((key) => {
    const meta = POLLUTANT_META[key];
    const raw = point[key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw * 10) / 10 : null;
    const whoRatio =
      value !== null && meta.whoGuideline ? Math.round((value / meta.whoGuideline) * 100) / 100 : null;

    let statusLabel = 'Data unavailable';
    if (whoRatio !== null) {
      if (whoRatio <= 1) {
        statusLabel = `1h below ${meta.guidelinePeriodShort} ref`;
      } else if (whoRatio <= 2) {
        statusLabel = `1h level ${whoRatio.toFixed(1)}× ${meta.guidelinePeriodShort} ref`;
      } else {
        statusLabel = `High 1h spike (${whoRatio.toFixed(1)}× ${meta.guidelinePeriodShort} ref)`;
      }
    }

    return {
      key,
      symbol: meta.symbol,
      name: meta.name,
      value,
      unit: meta.unit,
      whoGuideline: meta.whoGuideline,
      guidelinePeriod: meta.guidelinePeriod,
      guidelinePeriodShort: meta.guidelinePeriodShort,
      whoRatio,
      statusLabel,
      healthNote: meta.healthNote,
    };
  });
}

/**
 * Determines dominant pollutant objectively by computing a single-hour screening ratio
 * against WHO 2021 24-hour (or 8-hour for O3) guideline reference values.
 * Screening ratios indicate relative dominance, not formal multi-hour guideline exceedances.
 */
export function identifyDominantPollutant(point: Partial<HourlyAirQualityPoint>): {
  key: string;
  symbol: string;
  name: string;
  value: number | null;
  unit: string;
  rationale: string;
} {
  const metrics = buildPollutantBreakdown(point).filter((m) => m.value !== null && m.whoRatio !== null);
  if (metrics.length === 0) {
    return {
      key: 'unknown',
      symbol: 'N/A',
      name: 'Unavailable',
      value: null,
      unit: 'µg/m³',
      rationale: 'Pollutant concentrations are missing for the selected timestamp.',
    };
  }

  metrics.sort((a, b) => (b.whoRatio ?? 0) - (a.whoRatio ?? 0));
  const top = metrics[0];
  return {
    key: top.key,
    symbol: top.symbol,
    name: top.name,
    value: top.value,
    unit: top.unit,
    rationale: `${top.symbol} 1-hour modelled concentration is ${top.value} ${top.unit} (${top.whoRatio?.toFixed(2)}× the WHO ${top.guidelinePeriod} screening reference of ${top.whoGuideline} ${top.unit}; single-hour screening comparison, not a formal ${top.guidelinePeriod} exceedance).`,
  };
}

export function getWeatherLabel(code: number | null | undefined): string {
  if (code === null || code === undefined || !Number.isFinite(code)) {
    return 'Conditions unavailable';
  }
  return WMO_WEATHER_LABELS[code] ?? `Weather code ${code}`;
}

export function formatTemperature(celsius: number | null | undefined, unit: 'celsius' | 'fahrenheit'): string {
  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) return '—';
  if (unit === 'fahrenheit') {
    const f = (celsius * 9) / 5 + 32;
    return `${f.toFixed(1)}°F`;
  }
  return `${celsius.toFixed(1)}°C`;
}

export function formatWindDirection(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((degrees % 360) / 45)) % 8;
  return `${dirs[idx]} (${Math.round(degrees)}°)`;
}
