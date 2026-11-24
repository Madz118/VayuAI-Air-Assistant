import { STALE_DATA_THRESHOLD_MINUTES } from '../config/constants.ts';
import type { HourlyAirQualityPoint, ObservationCategory } from '../types/airQuality.ts';

export function validateCoordinates(lat: unknown, lon: unknown): {
  valid: boolean;
  latitude?: number;
  longitude?: number;
  error?: string;
} {
  const latNum = typeof lat === 'string' ? Number(lat) : lat;
  const lonNum = typeof lon === 'string' ? Number(lon) : lon;

  if (typeof latNum !== 'number' || !Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return { valid: false, error: 'Latitude must be a finite number between -90 and 90.' };
  }
  if (typeof lonNum !== 'number' || !Number.isFinite(lonNum) || lonNum < -180 || lonNum > 180) {
    return { valid: false, error: 'Longitude must be a finite number between -180 and 180.' };
  }
  return { valid: true, latitude: latNum, longitude: lonNum };
}

export function sanitizeCityQuery(query: unknown): { valid: boolean; cleaned: string; error?: string } {
  if (typeof query !== 'string') {
    return { valid: false, cleaned: '', error: 'Search query must be a string.' };
  }
  const cleaned = query.trim().replace(/[<>`"'\\]/g, '').slice(0, 80);
  if (cleaned.length < 2) {
    return { valid: false, cleaned: '', error: 'Please enter at least 2 characters to search for a city.' };
  }
  return { valid: true, cleaned };
}

export function checkTimestampFreshness(
  isoTimestamp: string | null | undefined,
  nowMs: number = Date.now(),
  staleThresholdMinutes: number = STALE_DATA_THRESHOLD_MINUTES,
): {
  validTimestamp: boolean;
  ageMinutes: number;
  isStale: boolean;
  label: string;
} {
  if (!isoTimestamp || typeof isoTimestamp !== 'string') {
    return {
      validTimestamp: false,
      ageMinutes: Number.POSITIVE_INFINITY,
      isStale: true,
      label: 'Timestamp unavailable',
    };
  }
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) {
    return {
      validTimestamp: false,
      ageMinutes: Number.POSITIVE_INFINITY,
      isStale: true,
      label: 'Invalid timestamp',
    };
  }
  const ageMinutes = Math.max(0, Math.round((nowMs - parsed) / 60000));
  const isStale = ageMinutes > staleThresholdMinutes;
  const label =
    ageMinutes < 2
      ? 'Updated just now'
      : ageMinutes < 60
        ? `Updated ${ageMinutes}m ago`
        : `Updated ${Math.round(ageMinutes / 60)}h ago`;

  return {
    validTimestamp: true,
    ageMinutes,
    isStale,
    label,
  };
}

export function validateOpenMeteoAirQualityPayload(payload: unknown): {
  valid: boolean;
  error?: string;
  hourlyTimes: string[];
} {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Empty or non-object response from air quality provider.', hourlyTimes: [] };
  }
  const obj = payload as Record<string, unknown>;
  if (obj.error === true) {
    return {
      valid: false,
      error: typeof obj.reason === 'string' ? obj.reason : 'Air quality provider returned an error.',
      hourlyTimes: [],
    };
  }
  const hourly = obj.hourly as Record<string, unknown> | undefined;
  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
    return { valid: false, error: 'Hourly air quality array is missing or empty.', hourlyTimes: [] };
  }
  return { valid: true, hourlyTimes: hourly.time as string[] };
}

export function evaluatePointCompleteness(point: Partial<HourlyAirQualityPoint>): {
  completenessRatio: number;
  missingFields: string[];
} {
  const fields: Array<{ key: keyof HourlyAirQualityPoint; label: string }> = [
    { key: 'us_aqi', label: 'US AQI' },
    { key: 'european_aqi', label: 'European AQI' },
    { key: 'pm2_5', label: 'PM2.5' },
    { key: 'pm10', label: 'PM10' },
    { key: 'nitrogen_dioxide', label: 'NO₂' },
    { key: 'ozone', label: 'O₃' },
    { key: 'sulphur_dioxide', label: 'SO₂' },
    { key: 'carbon_monoxide', label: 'CO' },
  ];

  const missingFields: string[] = [];
  for (const field of fields) {
    const val = point[field.key];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      missingFields.push(field.label);
    }
  }
  const completenessRatio = Math.round(((fields.length - missingFields.length) / fields.length) * 100) / 100;
  return { completenessRatio, missingFields };
}

const VALID_OBSERVATION_CATEGORIES = new Set<ObservationCategory>([
  'smoke_burning',
  'traffic_exhaust',
  'construction_dust',
  'industrial_odor',
  'clear_visibility',
]);

export function validateCommunityReportInput(input: unknown): {
  valid: boolean;
  error?: string;
  sanitized?: {
    cityName: string;
    latitude: number;
    longitude: number;
    category: ObservationCategory;
    description: string;
    consentGiven: boolean;
  };
} {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Invalid submission payload.' };
  }
  const raw = input as Record<string, unknown>;
  if (raw.consentGiven !== true) {
    return { valid: false, error: 'Explicit location and publication consent is required.' };
  }
  const coords = validateCoordinates(raw.latitude, raw.longitude);
  if (!coords.valid || coords.latitude === undefined || coords.longitude === undefined) {
    return { valid: false, error: coords.error ?? 'Invalid coordinates.' };
  }
  const cityName = typeof raw.cityName === 'string' ? raw.cityName.trim().replace(/[<>]/g, '').slice(0, 60) : '';
  if (cityName.length < 2) {
    return { valid: false, error: 'City name must be at least 2 characters.' };
  }
  const category = raw.category as ObservationCategory;
  if (!VALID_OBSERVATION_CATEGORIES.has(category)) {
    return { valid: false, error: 'Select a valid observation category.' };
  }
  const description = typeof raw.description === 'string' ? raw.description.trim().replace(/[<>]/g, '').slice(0, 280) : '';
  if (description.length < 8) {
    return { valid: false, error: 'Description must be at least 8 characters.' };
  }

  return {
    valid: true,
    sanitized: {
      cityName,
      latitude: coords.latitude,
      longitude: coords.longitude,
      category,
      description,
      consentGiven: true,
    },
  };
}
