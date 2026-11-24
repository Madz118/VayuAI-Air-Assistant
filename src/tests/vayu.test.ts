import test from 'node:test';
import assert from 'node:assert/strict';
import { runFamilyProtectionAgent } from '../agents/familyProtectionAgent.ts';
import { runPollutionIntelligenceAgent } from '../agents/pollutionIntelligenceAgent.ts';
import { runSmartRoutineAgent } from '../agents/smartRoutineAgent.ts';
import { runSustainabilityAgent } from '../agents/sustainabilityAgent.ts';
import { runVerificationAgent } from '../agents/verificationAgent.ts';
import { DEFAULT_CITY } from '../config/constants.ts';
import { runVayuOrchestrator } from '../orchestrator/vayuOrchestrator.ts';
import { normalizeOpenMeteoPayloads } from '../services/openMeteoClient.ts';
import type { EnvironmentalDataset, HouseholdProfile } from '../types/airQuality.ts';
import {
  buildPollutantBreakdown,
  identifyDominantPollutant,
  interpretAqiCategory,
} from '../utils/aqi.ts';
import { calculateTransparentCommuteComparison } from '../utils/sustainabilityCalc.ts';
import {
  checkTimestampFreshness,
  sanitizeCityQuery,
  validateCommunityReportInput,
  validateCoordinates,
  validateOpenMeteoAirQualityPayload,
} from '../utils/validators.ts';

function createSampleDataset(overrides?: Partial<EnvironmentalDataset>): EnvironmentalDataset {
  const baseTime = new Date(Date.now() - 20 * 60 * 1000).toISOString().slice(0, 13) + ':00';
  const datePrefix = baseTime.slice(0, 10);
  return {
    location: DEFAULT_CITY,
    fetchedAt: new Date().toISOString(),
    currentTimestamp: baseTime,
    modelSource: 'Open-Meteo Air Quality API (CAMS Atmospheric Forecast)',
    weatherSource: 'Open-Meteo Weather Forecast API',
    isModelledForecast: true,
    dataAgeMinutes: 20,
    isStale: false,
    completenessRatio: 1,
    missingFields: [],
    current: {
      us_aqi: 82,
      european_aqi: 38,
      pm2_5: 26.4,
      pm10: 48.2,
      nitrogen_dioxide: 21.0,
      ozone: 64.0,
      sulphur_dioxide: 6.2,
      carbon_monoxide: 410,
      temperature_2m: 29.4,
      relative_humidity_2m: 71,
      wind_speed_10m: 14.2,
      wind_direction_10m: 120,
      weather_code: 2,
      weather_label: 'Partly cloudy',
    },
    dominantPollutant: {
      key: 'pm2_5',
      symbol: 'PM2.5',
      name: 'Fine Particulate Matter',
      value: 26.4,
      unit: 'µg/m³',
      rationale: 'PM2.5 is 26.4 µg/m³, representing 1.76× the WHO reference threshold (15 µg/m³).',
    },
    hourly: [
      {
        time: `${datePrefix}T06:00`,
        us_aqi: 44,
        european_aqi: 20,
        pm2_5: 10.5,
        pm10: 22.0,
        nitrogen_dioxide: 12.0,
        ozone: 38.0,
        sulphur_dioxide: 3.1,
        carbon_monoxide: 260,
        temperature_2m: 25.5,
        relative_humidity_2m: 80,
        wind_speed_10m: 10.2,
        weather_code: 1,
      },
      {
        time: `${datePrefix}T09:00`,
        us_aqi: 68,
        european_aqi: 31,
        pm2_5: 20.1,
        pm10: 36.4,
        nitrogen_dioxide: 18.0,
        ozone: 52.0,
        sulphur_dioxide: 4.5,
        carbon_monoxide: 340,
        temperature_2m: 28.0,
        relative_humidity_2m: 74,
        wind_speed_10m: 13.5,
        weather_code: 2,
      },
      {
        time: `${datePrefix}T15:00`,
        us_aqi: 112,
        european_aqi: 52,
        pm2_5: 40.0,
        pm10: 66.0,
        nitrogen_dioxide: 30.0,
        ozone: 88.0,
        sulphur_dioxide: 7.0,
        carbon_monoxide: 510,
        temperature_2m: 31.2,
        relative_humidity_2m: 62,
        wind_speed_10m: 15.0,
        weather_code: 2,
      },
    ],
    cached: false,
    ...overrides,
  };
}

test('AQI category interpretation accurately classifies US AQI and EU EAQI scales', () => {
  assert.equal(interpretAqiCategory(35, 'us_aqi').level, 'good');
  assert.equal(interpretAqiCategory(75, 'us_aqi').level, 'moderate');
  assert.equal(interpretAqiCategory(135, 'us_aqi').level, 'sensitive');
  assert.equal(interpretAqiCategory(175, 'us_aqi').level, 'unhealthy');
  assert.equal(interpretAqiCategory(240, 'us_aqi').level, 'very_unhealthy');
  assert.equal(interpretAqiCategory(350, 'us_aqi').level, 'hazardous');
  assert.equal(interpretAqiCategory(null, 'us_aqi').level, 'unknown');

  assert.equal(interpretAqiCategory(18, 'european_aqi').shortLabel, 'Good');
  assert.equal(interpretAqiCategory(35, 'european_aqi').shortLabel, 'Fair');
  assert.equal(interpretAqiCategory(75, 'european_aqi').shortLabel, 'Poor');
});

test('Pollutant parsing and dominant pollutant selection use WHO guideline ratios', () => {
  const breakdown = buildPollutantBreakdown({
    pm2_5: 30, // 2.0x WHO (15)
    pm10: 45, // 1.0x WHO (45)
    nitrogen_dioxide: 25, // 1.0x WHO (25)
    ozone: 50,
    sulphur_dioxide: null,
    carbon_monoxide: 400,
  });

  assert.equal(breakdown.length, 6);
  const so2 = breakdown.find((p) => p.key === 'sulphur_dioxide');
  assert.equal(so2?.value, null);
  assert.equal(so2?.statusLabel, 'Data unavailable');

  const dominant = identifyDominantPollutant({
    pm2_5: 30,
    pm10: 45,
    nitrogen_dioxide: 25,
  });
  assert.equal(dominant.key, 'pm2_5');
});

test('Open-Meteo API payload validation and normalization handle valid and malformed payloads', () => {
  const invalid = validateOpenMeteoAirQualityPayload({ error: true, reason: 'Invalid lat' });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.error, 'Invalid lat');

  const nowIso = new Date().toISOString().slice(0, 13) + ':00';
  const normalized = normalizeOpenMeteoPayloads({
    location: DEFAULT_CITY,
    aqPayload: {
      utc_offset_seconds: 0,
      timezone: 'GMT',
      hourly: {
        time: [nowIso],
        us_aqi: [62],
        european_aqi: [28],
        pm2_5: [17.4],
        pm10: [31.2],
        nitrogen_dioxide: [16.5],
        ozone: [58.0],
        sulphur_dioxide: [4.0],
        carbon_monoxide: [310],
      },
    },
    weatherPayload: {
      current: {
        time: nowIso,
        temperature_2m: 28.5,
        relative_humidity_2m: 68,
        wind_speed_10m: 12.1,
        wind_direction_10m: 90,
        weather_code: 1,
      },
      hourly: {
        time: [nowIso],
        temperature_2m: [28.5],
        relative_humidity_2m: [68],
        wind_speed_10m: [12.1],
        wind_direction_10m: [90],
        weather_code: [1],
      },
    },
  });

  assert.equal(normalized.current.us_aqi, 62);
  assert.equal(normalized.current.pm2_5, 17.4);
  assert.equal(normalized.isModelledForecast, true);
  assert.equal(normalized.completenessRatio, 1);
});

test('Timestamp freshness flags stale data accurately', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const fresh = checkTimestampFreshness('2026-11-24T11:30:00Z', now);
  assert.equal(fresh.isStale, false);
  assert.equal(fresh.ageMinutes, 30);

  const stale = checkTimestampFreshness('2026-11-24T05:00:00Z', now);
  assert.equal(stale.isStale, true);
  assert.equal(stale.ageMinutes, 420);
});

test('Location, query, and community report validators reject unsafe or out-of-range inputs', () => {
  assert.equal(validateCoordinates(95, 80).valid, false);
  assert.equal(validateCoordinates(13.08, -190).valid, false);
  assert.equal(validateCoordinates(13.08, 80.27).valid, true);

  assert.equal(sanitizeCityQuery('a').valid, false);
  assert.equal(sanitizeCityQuery('Chennai<script>').cleaned, 'Chennaiscript');

  const badReport = validateCommunityReportInput({
    cityName: 'Chennai',
    latitude: 13.08,
    longitude: 80.27,
    category: 'traffic_exhaust',
    description: 'Heavy smoke on highway.',
    consentGiven: false,
  });
  assert.equal(badReport.valid, false);

  const goodReport = validateCommunityReportInput({
    cityName: 'Chennai',
    latitude: 13.08,
    longitude: 80.27,
    category: 'traffic_exhaust',
    description: 'Heavy diesel smoke observed near bus terminus.',
    consentGiven: true,
  });
  assert.equal(goodReport.valid, true);
});

test('Sustainability calculation exposes transparent assumptions', () => {
  const calc = calculateTransparentCommuteComparison({
    distanceKm: 10,
    currentMode: 'solo_car',
    alternativeMode: 'metro_rail',
    tripsPerWeek: 4,
  });
  assert.ok(calc.weeklyDeltaKgCo2e > 0);
  assert.ok(calc.assumptions.length >= 3);
});

test('All 5 agents produce structured outputs and handle missing/stale data honestly', () => {
  const dataset = createSampleDataset();
  const profiles: HouseholdProfile[] = [
    {
      id: 'p1',
      label: 'Aarav',
      group: 'child',
      hasRespiratorySensitivity: true,
      sensitivityNote: 'Dust sensitivity',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const a1 = runPollutionIntelligenceAgent(dataset, 'us_aqi');
  assert.equal(a1.status, 'completed');
  assert.ok(a1.observations[0].includes('US AQI'));

  const a1Missing = runPollutionIntelligenceAgent(null, 'us_aqi');
  assert.equal(a1Missing.status, 'failed');

  const a2 = runFamilyProtectionAgent(dataset, profiles, 'us_aqi');
  assert.equal(a2.status, 'completed');
  assert.ok(a2.limitations.some((l) => l.toLowerCase().includes('diagnosis')));

  const date = dataset.currentTimestamp.slice(0, 10);
  const a3 = runSmartRoutineAgent(dataset, 'outdoor_exercise', date, 'us_aqi');
  assert.equal(a3.agentResult.status, 'completed');
  assert.ok(a3.windows.length >= 2);
  assert.equal(a3.bestWindow?.startTime, `${date}T06:00`);

  const a4 = runSustainabilityAgent(dataset, 'us_aqi');
  assert.equal(a4.status, 'completed');

  // Verification Agent flags unsafe absolute safety claims & CPCB mislabelling
  const vBad = runVerificationAgent({
    dataset,
    agentResults: [a1, a2, a3.agentResult, a4],
    preferredScale: 'us_aqi',
    draftAnswer: 'This reading is official CPCB AQI and tomorrow morning is 100% safe.',
  });
  assert.equal(vBad.report.passed, false);
  assert.ok(vBad.report.rejectedClaims.length >= 2);
});

test('Multi-agent orchestrator handles Gemini failure gracefully without fabricating answers', async () => {
  const dataset = createSampleDataset();
  const response = await runVayuOrchestrator({
    query: 'Is it suitable to go jogging tomorrow morning?',
    dataset,
    profiles: [],
    preferredScale: 'us_aqi',
    synthesizer: async () => {
      throw new Error('Upstream Gemini quota error');
    },
  });

  assert.equal(response.aiSynthesized, false);
  assert.equal(response.aiError, 'Upstream Gemini quota error');
  assert.ok(response.agentsInvolved.includes('Pollution Intelligence Agent'));
  assert.ok(response.agentsInvolved.includes('Smart Routine Agent'));
  assert.ok(response.agentsInvolved.includes('Verification Agent'));
  assert.ok(response.directAnswer.length > 10);
});
