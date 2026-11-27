import { DEFAULT_CITY, PRESET_CITIES } from '../config/constants.ts';
import type {
  CityLocation,
  EnvironmentalDataset,
  HourlyAirQualityPoint,
} from '../types/airQuality.ts';
import { getWeatherLabel, identifyDominantPollutant } from '../utils/aqi.ts';
import {
  checkTimestampFreshness,
  evaluatePointCompleteness,
  sanitizeCityQuery,
  validateCoordinates,
  validateOpenMeteoAirQualityPayload,
} from '../utils/validators.ts';

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

const AQ_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const GEO_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
const MAX_CACHE_ENTRIES = 200;

const aqCache = new Map<string, CacheEntry<EnvironmentalDataset>>();
const geoCache = new Map<string, CacheEntry<CityLocation[]>>();

function setBoundedCache<T>(map: Map<string, CacheEntry<T>>, key: string, entry: CacheEntry<T>) {
  const now = Date.now();
  if (map.size >= MAX_CACHE_ENTRIES) {
    for (const [k, v] of map.entries()) {
      if (v.expiresAt <= now) {
        map.delete(k);
      }
    }
    while (map.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  }
  map.set(key, entry);
}

export function clearOpenMeteoCaches(): void {
  aqCache.clear();
  geoCache.clear();
}

function numAt(arr: unknown, idx: number): number | null {
  if (!Array.isArray(arr)) return null;
  const v = arr[idx];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function fetchWithTimeout(url: string, timeoutMs = 6500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeOpenMeteoPayloads(params: {
  location: CityLocation;
  aqPayload: Record<string, unknown>;
  weatherPayload: Record<string, unknown>;
  weatherAvailable?: boolean;
  nowMs?: number;
}): EnvironmentalDataset {
  const { location, aqPayload, weatherPayload, weatherAvailable = true, nowMs = Date.now() } = params;
  const validation = validateOpenMeteoAirQualityPayload(aqPayload);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid Open-Meteo Air Quality payload.');
  }

  const aqHourly = aqPayload.hourly as Record<string, unknown>;
  const weatherHourly = (weatherPayload?.hourly ?? {}) as Record<string, unknown>;
  const weatherCurrent = (weatherPayload?.current ?? {}) as Record<string, unknown>;
  const times = aqHourly.time as string[];
  const weatherTimes = Array.isArray(weatherHourly.time) ? (weatherHourly.time as string[]) : [];

  const weatherByTime = new Map<
    string,
    {
      temperature_2m: number | null;
      relative_humidity_2m: number | null;
      wind_speed_10m: number | null;
      wind_direction_10m: number | null;
      weather_code: number | null;
      precipitation_probability: number | null;
    }
  >();

  for (let i = 0; i < weatherTimes.length; i++) {
    weatherByTime.set(weatherTimes[i], {
      temperature_2m: numAt(weatherHourly.temperature_2m, i),
      relative_humidity_2m: numAt(weatherHourly.relative_humidity_2m, i),
      wind_speed_10m: numAt(weatherHourly.wind_speed_10m, i),
      wind_direction_10m: numAt(weatherHourly.wind_direction_10m, i),
      weather_code: numAt(weatherHourly.weather_code, i),
      precipitation_probability: numAt(weatherHourly.precipitation_probability, i),
    });
  }

  const hourly: Array<
    HourlyAirQualityPoint & {
      temperature_2m?: number | null;
      relative_humidity_2m?: number | null;
      wind_speed_10m?: number | null;
      wind_direction_10m?: number | null;
      weather_code?: number | null;
      precipitation_probability?: number | null;
    }
  > = times.map((time, idx) => {
    const w = weatherByTime.get(time);
    return {
      time,
      us_aqi: numAt(aqHourly.us_aqi, idx),
      european_aqi: numAt(aqHourly.european_aqi, idx),
      pm2_5: numAt(aqHourly.pm2_5, idx),
      pm10: numAt(aqHourly.pm10, idx),
      nitrogen_dioxide: numAt(aqHourly.nitrogen_dioxide, idx),
      ozone: numAt(aqHourly.ozone, idx),
      sulphur_dioxide: numAt(aqHourly.sulphur_dioxide, idx),
      carbon_monoxide: numAt(aqHourly.carbon_monoxide, idx),
      temperature_2m: w?.temperature_2m ?? null,
      relative_humidity_2m: w?.relative_humidity_2m ?? null,
      wind_speed_10m: w?.wind_speed_10m ?? null,
      wind_direction_10m: w?.wind_direction_10m ?? null,
      weather_code: w?.weather_code ?? null,
      precipitation_probability: w?.precipitation_probability ?? null,
    };
  });

  const utcOffsetSec =
    typeof aqPayload.utc_offset_seconds === 'number' && Number.isFinite(aqPayload.utc_offset_seconds)
      ? aqPayload.utc_offset_seconds
      : typeof weatherPayload?.utc_offset_seconds === 'number' && Number.isFinite(weatherPayload.utc_offset_seconds)
        ? (weatherPayload.utc_offset_seconds as number)
        : 0;

  const localNowIso = new Date(nowMs + utcOffsetSec * 1000).toISOString().slice(0, 13) + ':00';
  let currentIdx = hourly.findIndex((h) => h.time === localNowIso);
  if (currentIdx === -1 && typeof weatherCurrent.time === 'string') {
    const currentHourPrefix = weatherCurrent.time.slice(0, 13) + ':00';
    currentIdx = hourly.findIndex((h) => h.time === currentHourPrefix);
  }
  if (currentIdx === -1) {
    currentIdx = Math.min(24, Math.max(0, hourly.length - 1));
  }

  const currentPoint = hourly[currentIdx];
  const { completenessRatio, missingFields } = evaluatePointCompleteness(currentPoint);

  const localTimestampMs = Date.parse(`${currentPoint.time}:00Z`);
  const adjustedUtcIso = Number.isFinite(localTimestampMs)
    ? new Date(localTimestampMs - utcOffsetSec * 1000).toISOString()
    : '';

  const freshness = checkTimestampFreshness(adjustedUtcIso, nowMs);
  const weatherCode =
    typeof weatherCurrent.weather_code === 'number' && Number.isFinite(weatherCurrent.weather_code)
      ? weatherCurrent.weather_code
      : currentPoint.weather_code ?? null;

  const current = {
    us_aqi: currentPoint.us_aqi,
    european_aqi: currentPoint.european_aqi,
    pm2_5: currentPoint.pm2_5,
    pm10: currentPoint.pm10,
    nitrogen_dioxide: currentPoint.nitrogen_dioxide,
    ozone: currentPoint.ozone,
    sulphur_dioxide: currentPoint.sulphur_dioxide,
    carbon_monoxide: currentPoint.carbon_monoxide,
    temperature_2m:
      typeof weatherCurrent.temperature_2m === 'number' && Number.isFinite(weatherCurrent.temperature_2m)
        ? weatherCurrent.temperature_2m
        : currentPoint.temperature_2m ?? null,
    relative_humidity_2m:
      typeof weatherCurrent.relative_humidity_2m === 'number' && Number.isFinite(weatherCurrent.relative_humidity_2m)
        ? weatherCurrent.relative_humidity_2m
        : currentPoint.relative_humidity_2m ?? null,
    wind_speed_10m:
      typeof weatherCurrent.wind_speed_10m === 'number' && Number.isFinite(weatherCurrent.wind_speed_10m)
        ? weatherCurrent.wind_speed_10m
        : currentPoint.wind_speed_10m ?? null,
    wind_direction_10m:
      typeof weatherCurrent.wind_direction_10m === 'number' && Number.isFinite(weatherCurrent.wind_direction_10m)
        ? weatherCurrent.wind_direction_10m
        : currentPoint.wind_direction_10m ?? null,
    weather_code: weatherCode,
    weather_label: getWeatherLabel(weatherCode),
  };

  const dominantPollutant = identifyDominantPollutant(currentPoint);
  const weatherHasCore =
    weatherAvailable &&
    (current.temperature_2m !== null || current.wind_speed_10m !== null || current.relative_humidity_2m !== null);

  return {
    location: {
      ...location,
      timezone: typeof aqPayload.timezone === 'string' ? aqPayload.timezone : location.timezone,
    },
    utcOffsetSeconds: utcOffsetSec,
    fetchedAt: new Date(nowMs).toISOString(),
    currentTimestamp: currentPoint.time,
    modelSource: 'Open-Meteo Air Quality API (CAMS Atmospheric Forecast)',
    weatherSource: 'Open-Meteo Weather Forecast API',
    weatherAvailable: weatherHasCore,
    isModelledForecast: true,
    dataAgeMinutes: freshness.ageMinutes,
    isStale: freshness.isStale,
    completenessRatio,
    missingFields,
    current,
    dominantPollutant,
    hourly,
    cached: false,
  };
}

export async function fetchEnvironmentalDataset(locationInput?: Partial<CityLocation>): Promise<EnvironmentalDataset> {
  const latRaw = locationInput ? locationInput.latitude : DEFAULT_CITY.latitude;
  const lonRaw = locationInput ? locationInput.longitude : DEFAULT_CITY.longitude;
  const coords = validateCoordinates(latRaw, lonRaw);
  if (!coords.valid || coords.latitude === undefined || coords.longitude === undefined) {
    throw new Error(coords.error ?? 'Invalid location coordinates.');
  }

  const lat = Math.round(coords.latitude * 10000) / 10000;
  const lon = Math.round(coords.longitude * 10000) / 10000;
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;

  const resolvedName =
    locationInput?.name && locationInput.name.trim().length > 0
      ? locationInput.name.trim()
      : locationInput === undefined
        ? DEFAULT_CITY.name
        : `Coordinates (${lat.toFixed(3)}, ${lon.toFixed(3)})`;

  const cached = aqCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.data,
      location: {
        ...cached.data.location,
        name: resolvedName,
        country: locationInput?.country ?? cached.data.location.country,
        region: locationInput?.region ?? cached.data.location.region,
        latitude: lat,
        longitude: lon,
      },
      cached: true,
    };
  }

  const location: CityLocation = {
    id: locationInput?.id || `loc-${cacheKey}`,
    name: resolvedName,
    region: locationInput?.region,
    country: locationInput?.country || '',
    latitude: lat,
    longitude: lon,
    timezone: locationInput?.timezone,
  };

  const aqUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  aqUrl.searchParams.set('latitude', String(lat));
  aqUrl.searchParams.set('longitude', String(lon));
  aqUrl.searchParams.set(
    'hourly',
    'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi',
  );
  aqUrl.searchParams.set('past_days', '1');
  aqUrl.searchParams.set('forecast_days', '3');
  aqUrl.searchParams.set('timezone', 'auto');

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.searchParams.set('latitude', String(lat));
  weatherUrl.searchParams.set('longitude', String(lon));
  weatherUrl.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation_probability',
  );
  weatherUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code',
  );
  weatherUrl.searchParams.set('past_days', '1');
  weatherUrl.searchParams.set('forecast_days', '3');
  weatherUrl.searchParams.set('timezone', 'auto');

  const [aqSettled, weatherSettled] = await Promise.allSettled([
    fetchWithTimeout(aqUrl.toString()),
    fetchWithTimeout(weatherUrl.toString()),
  ]);

  if (aqSettled.status === 'rejected') {
    throw new Error('Unable to reach Open-Meteo Air Quality API within timeout.');
  }
  const aqRes = aqSettled.value;
  if (!aqRes.ok) {
    throw new Error(`Open-Meteo Air Quality API returned HTTP ${aqRes.status}.`);
  }

  let aqJson: Record<string, unknown>;
  try {
    aqJson = (await aqRes.json()) as Record<string, unknown>;
  } catch {
    throw new Error('Open-Meteo Air Quality API returned malformed JSON.');
  }

  let weatherJson: Record<string, unknown> = {};
  let weatherAvailable = false;
  if (weatherSettled.status === 'fulfilled' && weatherSettled.value.ok) {
    try {
      weatherJson = (await weatherSettled.value.json()) as Record<string, unknown>;
      weatherAvailable = weatherJson.error !== true;
    } catch {
      weatherAvailable = false;
    }
  }

  const dataset = normalizeOpenMeteoPayloads({
    location,
    aqPayload: aqJson,
    weatherPayload: weatherJson,
    weatherAvailable,
  });

  setBoundedCache(aqCache, cacheKey, {
    expiresAt: Date.now() + AQ_CACHE_TTL_MS,
    data: dataset,
  });

  return dataset;
}

export async function fetchLocalForecastGrid(lat: number, lon: number): Promise<
  Array<{
    label: string;
    latitude: number;
    longitude: number;
    us_aqi: number | null;
    european_aqi: number | null;
    pm2_5: number | null;
    timestamp: string;
  }>
> {
  const coords = validateCoordinates(lat, lon);
  if (!coords.valid || coords.latitude === undefined || coords.longitude === undefined) {
    throw new Error(coords.error ?? 'Invalid grid coordinates.');
  }

  const offsets = [
    { label: 'North Grid (+0.15°)', dLat: 0.15, dLon: 0 },
    { label: 'South Grid (-0.15°)', dLat: -0.15, dLon: 0 },
    { label: 'East Grid (+0.15°)', dLat: 0, dLon: 0.15 },
    { label: 'West Grid (-0.15°)', dLat: 0, dLon: -0.15 },
  ];

  const settled = await Promise.allSettled(
    offsets.map(async (off) => {
      const pLat = Math.max(-89, Math.min(89, Math.round((coords.latitude! + off.dLat) * 1000) / 1000));
      const pLon = Math.max(-179, Math.min(179, Math.round((coords.longitude! + off.dLon) * 1000) / 1000));
      const ds = await fetchEnvironmentalDataset({
        name: off.label,
        latitude: pLat,
        longitude: pLon,
      });
      return {
        label: off.label,
        latitude: pLat,
        longitude: pLon,
        us_aqi: ds.current.us_aqi,
        european_aqi: ds.current.european_aqi,
        pm2_5: ds.current.pm2_5,
        timestamp: ds.currentTimestamp,
      };
    }),
  );

  const fulfilled = settled
    .filter(
      (
        r,
      ): r is PromiseFulfilledResult<{
        label: string;
        latitude: number;
        longitude: number;
        us_aqi: number | null;
        european_aqi: number | null;
        pm2_5: number | null;
        timestamp: string;
      }> => r.status === 'fulfilled',
    )
    .map((r) => r.value);

  if (fulfilled.length === 0) {
    throw new Error('All surrounding Open-Meteo grid lookups failed.');
  }

  return fulfilled;
}

export async function searchCities(query: string): Promise<CityLocation[]> {
  const sanitized = sanitizeCityQuery(query);
  if (!sanitized.valid) {
    throw new Error(sanitized.error ?? 'Invalid city query.');
  }

  const key = sanitized.cleaned.toLowerCase();
  const cached = geoCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', sanitized.cleaned);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString(), 8000);
  } catch {
    const localMatches = PRESET_CITIES.filter((c) =>
      `${c.name} ${c.country} ${c.region ?? ''}`.toLowerCase().includes(key),
    );
    if (localMatches.length > 0) return localMatches;
    throw new Error('Geocoding service timed out.');
  }

  if (!res.ok) {
    const localMatches = PRESET_CITIES.filter((c) =>
      `${c.name} ${c.country} ${c.region ?? ''}`.toLowerCase().includes(key),
    );
    if (localMatches.length > 0) return localMatches;
    throw new Error(`Geocoding service returned HTTP ${res.status}.`);
  }

  const json = (await res.json()) as {
    results?: Array<{
      id: number;
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
      timezone?: string;
    }>;
  };

  const results: CityLocation[] = (json.results ?? []).map((r) => ({
    id: `geo-${r.id}`,
    name: r.name,
    region: r.admin1,
    country: r.country ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  }));

  setBoundedCache(geoCache, key, {
    expiresAt: Date.now() + GEO_CACHE_TTL_MS,
    data: results,
  });

  return results;
}

const NON_CITY_WORDS = new Set([
  'today',
  'tomorrow',
  'tonight',
  'morning',
  'afternoon',
  'evening',
  'night',
  'general',
  'india',
  'us',
  'eu',
  'aqi',
  'eaqi',
  'air',
  'pollution',
  'summer',
  'winter',
  'rain',
  'the',
  'my',
  'our',
  'this',
  'that',
  'home',
  'indoors',
  'outdoors',
  'outside',
  'inside',
  'city',
  'town',
  'area',
  'minutes',
  'hours',
  'days',
  'percent',
]);

/**
 * Checks whether a natural-language query explicitly names a city (e.g., "in Chennai", "for New Delhi").
 * Ensures explicit city queries resolve cleanly to the requested city's exact coordinates rather than
 * silently inheriting a previously cached or default location.
 */
export async function resolveQueryCityLocation(
  query: string,
  selectedLocation: Partial<CityLocation> | null,
): Promise<{
  explicitCityRequested: boolean;
  requestedCityName?: string;
  location: Partial<CityLocation> | null;
  unresolvedError?: string;
}> {
  const qLower = query.toLowerCase();

  // 1. Direct match against known preset cities (including "delhi" -> New Delhi, "bangalore" -> Bengaluru)
  const presetAliases: Array<{ alias: RegExp; city: CityLocation }> = [
    { alias: /\bnew\s+delhi\b|\bdelhi\b/i, city: PRESET_CITIES.find((c) => c.id === 'delhi-in')! },
    { alias: /\bchennai\b/i, city: PRESET_CITIES.find((c) => c.id === 'chennai-in')! },
    { alias: /\bbengaluru\b|\bbangalore\b/i, city: PRESET_CITIES.find((c) => c.id === 'bengaluru-in')! },
    { alias: /\bmumbai\b/i, city: PRESET_CITIES.find((c) => c.id === 'mumbai-in')! },
    { alias: /\bhyderabad\b/i, city: PRESET_CITIES.find((c) => c.id === 'hyderabad-in')! },
    { alias: /\bsingapore\b/i, city: PRESET_CITIES.find((c) => c.id === 'singapore-sg')! },
    { alias: /\blondon\b/i, city: PRESET_CITIES.find((c) => c.id === 'london-gb')! },
    { alias: /\btokyo\b/i, city: PRESET_CITIES.find((c) => c.id === 'tokyo-jp')! },
  ];

  for (const item of presetAliases) {
    if (item.city && item.alias.test(qLower)) {
      return {
        explicitCityRequested: true,
        requestedCityName: item.city.name,
        location: item.city,
      };
    }
  }

  // 2. Look for explicit capitalized place phrase after "in/for/at <Place>" in user's query
  const explicitMatch = query.match(/\b(?:in|for|at|around|near)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/);
  if (explicitMatch) {
    const candidate = explicitMatch[1].trim();
    const candidateLower = candidate.toLowerCase();
    if (!NON_CITY_WORDS.has(candidateLower) && candidate.length >= 3) {
      if (selectedLocation?.name && selectedLocation.name.toLowerCase() === candidateLower) {
        return {
          explicitCityRequested: true,
          requestedCityName: selectedLocation.name,
          location: selectedLocation,
        };
      }
      try {
        const matches = await searchCities(candidate);
        if (matches.length > 0) {
          return {
            explicitCityRequested: true,
            requestedCityName: candidate,
            location: matches[0],
          };
        }
        return {
          explicitCityRequested: true,
          requestedCityName: candidate,
          location: null,
          unresolvedError: `I could not resolve "${candidate}" to verified coordinates. Please select a city using the location selector and try again.`,
        };
      } catch {
        return {
          explicitCityRequested: true,
          requestedCityName: candidate,
          location: null,
          unresolvedError: `I could not look up "${candidate}" right now. Please select your city from the location selector instead.`,
        };
      }
    }
  }

  return {
    explicitCityRequested: false,
    location: selectedLocation,
  };
}
