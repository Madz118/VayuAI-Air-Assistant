import { ACTIVITIES_META, STALE_DATA_THRESHOLD_MINUTES } from '../config/constants.ts';
import type {
  ActivityType,
  AqiScale,
  CityLocation,
  HouseholdMemberGroup,
  HouseholdProfile,
  HourlyAirQualityPoint,
  ObservationCategory,
} from '../types/airQuality.ts';

function sanitizePlainText(value: string, maxLen: number): string {
  return value
    .replace(/[<>{}`\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function validateCoordinates(lat: unknown, lon: unknown): {
  valid: boolean;
  latitude?: number;
  longitude?: number;
  error?: string;
} {
  if (typeof lat === 'boolean' || typeof lon === 'boolean' || lat === null || lon === null) {
    return { valid: false, error: 'Latitude and longitude must be finite numbers.' };
  }
  if (typeof lat === 'string' && lat.trim() === '') {
    return { valid: false, error: 'Latitude cannot be empty.' };
  }
  if (typeof lon === 'string' && lon.trim() === '') {
    return { valid: false, error: 'Longitude cannot be empty.' };
  }

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

export function validateLocationInput(
  input: unknown,
  fallback: CityLocation,
): {
  valid: boolean;
  location?: Partial<CityLocation>;
  error?: string;
} {
  if (input === undefined || input === null) {
    return { valid: true, location: fallback };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Location must be an object with valid coordinates.' };
  }
  const obj = input as Record<string, unknown>;
  const latRaw = obj.latitude !== undefined ? obj.latitude : fallback.latitude;
  const lonRaw = obj.longitude !== undefined ? obj.longitude : fallback.longitude;
  const coords = validateCoordinates(latRaw, lonRaw);
  if (!coords.valid || coords.latitude === undefined || coords.longitude === undefined) {
    return { valid: false, error: coords.error };
  }

  const name =
    typeof obj.name === 'string' && sanitizePlainText(obj.name, 80).length > 0
      ? sanitizePlainText(obj.name, 80)
      : fallback.name;
  const country = typeof obj.country === 'string' ? sanitizePlainText(obj.country, 60) : '';
  const region = typeof obj.region === 'string' ? sanitizePlainText(obj.region, 60) : undefined;
  const id =
    typeof obj.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(obj.id) ? obj.id : undefined;

  return {
    valid: true,
    location: {
      id,
      name,
      country,
      region,
      latitude: coords.latitude,
      longitude: coords.longitude,
    },
  };
}

export function validateAqiScale(scale: unknown): {
  valid: boolean;
  scale?: AqiScale;
  error?: string;
} {
  if (scale === undefined || scale === null) {
    return { valid: true, scale: 'us_aqi' };
  }
  if (scale === 'us_aqi' || scale === 'european_aqi') {
    return { valid: true, scale };
  }
  return { valid: false, error: "preferredScale must be 'us_aqi' or 'european_aqi'." };
}

export function validateActivityType(activity: unknown): {
  valid: boolean;
  activity?: ActivityType;
  error?: string;
} {
  if (activity === undefined || activity === null) {
    return { valid: true, activity: 'outdoor_exercise' };
  }
  if (typeof activity === 'string' && ACTIVITIES_META.some((a) => a.id === activity)) {
    return { valid: true, activity: activity as ActivityType };
  }
  return { valid: false, error: 'Invalid activity type specified.' };
}

export function validateCalendarDate(dateStr: unknown): {
  valid: boolean;
  date?: string;
  error?: string;
} {
  if (dateStr === undefined || dateStr === null || dateStr === '') {
    return { valid: true, date: undefined };
  }
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { valid: false, error: 'Date must use YYYY-MM-DD format.' };
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return { valid: false, error: 'Date is not a valid calendar date.' };
  }
  return { valid: true, date: dateStr };
}

const VALID_HOUSEHOLD_GROUPS = new Set<HouseholdMemberGroup>(['adult', 'child', 'older_adult']);

export function validateHouseholdProfiles(input: unknown): {
  valid: boolean;
  profiles: HouseholdProfile[];
  error?: string;
} {
  if (input === undefined || input === null) {
    return { valid: true, profiles: [] };
  }
  if (!Array.isArray(input)) {
    return { valid: false, profiles: [], error: 'Household profiles must be an array.' };
  }
  if (input.length > 12) {
    return { valid: false, profiles: [], error: 'At most 12 household profiles can be evaluated at once.' };
  }

  const sanitized: HouseholdProfile[] = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { valid: false, profiles: [], error: `Household profile at index ${i} must be an object.` };
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj.group !== 'string' || !VALID_HOUSEHOLD_GROUPS.has(obj.group as HouseholdMemberGroup)) {
      return {
        valid: false,
        profiles: [],
        error: `Household profile at index ${i} must specify group as 'adult', 'child', or 'older_adult'.`,
      };
    }
    if (typeof obj.hasRespiratorySensitivity !== 'boolean') {
      return {
        valid: false,
        profiles: [],
        error: `Household profile at index ${i} must specify hasRespiratorySensitivity as a boolean.`,
      };
    }

    const rawLabel = typeof obj.label === 'string' ? sanitizePlainText(obj.label, 40) : '';
    const rawNote =
      obj.hasRespiratorySensitivity && typeof obj.sensitivityNote === 'string'
        ? sanitizePlainText(obj.sensitivityNote, 120)
        : '';

    const groupLabel =
      obj.group === 'child' ? 'Child' : obj.group === 'older_adult' ? 'Older adult' : 'Adult';

    sanitized.push({
      id: typeof obj.id === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(obj.id) ? obj.id : `hh-${i + 1}`,
      label: rawLabel.length >= 1 ? rawLabel : `${groupLabel} member ${i + 1}`,
      group: obj.group as HouseholdMemberGroup,
      hasRespiratorySensitivity: obj.hasRespiratorySensitivity,
      sensitivityNote: rawNote,
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt.slice(0, 40) : nowIso,
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt.slice(0, 40) : nowIso,
    });
  }

  return { valid: true, profiles: sanitized };
}

/**
 * Strips personal names/labels, IDs, timestamps, and free-text notes before sending
 * household exposure categories to Gemini.
 */
export function anonymizeHouseholdProfilesForLlm(profiles: HouseholdProfile[]): Array<{
  group: HouseholdMemberGroup;
  hasRespiratorySensitivity: boolean;
}> {
  return profiles
    .filter(
      (p) =>
        VALID_HOUSEHOLD_GROUPS.has(p.group) && typeof p.hasRespiratorySensitivity === 'boolean',
    )
    .slice(0, 12)
    .map((p) => ({
      group: p.group,
      hasRespiratorySensitivity: p.hasRespiratorySensitivity,
    }));
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
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
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
  const cityName = typeof raw.cityName === 'string' ? sanitizePlainText(raw.cityName, 60) : '';
  if (cityName.length < 2) {
    return { valid: false, error: 'City name must be at least 2 characters.' };
  }
  const category = raw.category as ObservationCategory;
  if (!VALID_OBSERVATION_CATEGORIES.has(category)) {
    return { valid: false, error: 'Select a valid observation category.' };
  }
  const description =
    typeof raw.description === 'string' ? sanitizePlainText(raw.description, 280) : '';
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

export function validateReportId(id: unknown): { valid: boolean; id?: string; error?: string } {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(id)) {
    return { valid: false, error: 'Invalid observation ID format.' };
  }
  return { valid: true, id };
}

export function validateFlagReason(reason: unknown): {
  valid: boolean;
  reason?: string;
  error?: string;
} {
  if (reason === undefined) {
    return { valid: true, reason: 'Flagged for moderation review' };
  }
  if (typeof reason !== 'string') {
    return { valid: false, error: 'Flag reason must be text.' };
  }
  const cleaned = sanitizePlainText(reason, 120);
  if (cleaned.length < 5) {
    return { valid: false, error: 'Please provide a flag reason of at least 5 characters.' };
  }
  return { valid: true, reason: cleaned };
}
