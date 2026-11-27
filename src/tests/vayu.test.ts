import test from 'node:test';
import assert from 'node:assert/strict';
import { runFamilyProtectionAgent } from '../agents/familyProtectionAgent.ts';
import { runPollutionIntelligenceAgent } from '../agents/pollutionIntelligenceAgent.ts';
import { runSmartRoutineAgent } from '../agents/smartRoutineAgent.ts';
import { runSustainabilityAgent } from '../agents/sustainabilityAgent.ts';
import { runVerificationAgent } from '../agents/verificationAgent.ts';
import { DEFAULT_CITY } from '../config/constants.ts';
import { classifyUserIntent, runVayuOrchestrator } from '../orchestrator/vayuOrchestrator.ts';
import { CommunityStore } from '../services/communityStore.ts';
import { normalizeOpenMeteoPayloads, resolveQueryCityLocation } from '../services/openMeteoClient.ts';
import { parseHypotheticalScenario } from '../utils/hypotheticalScenario.ts';
import { evaluateWindowTimeValidity, getLocalDateTimeContext } from '../utils/localTime.ts';
import type { EnvironmentalDataset, HouseholdProfile, RoutineWindow } from '../types/airQuality.ts';
import {
  buildPollutantBreakdown,
  identifyDominantPollutant,
  interpretAqiCategory,
} from '../utils/aqi.ts';
import {
  buildFloatingChatPayload,
  createWelcomeMessage,
  FLOATING_CHAT_SUGGESTIONS,
  FLOATING_CHAT_WELCOME,
  formatAssistantResponseForCopy,
  validateChatInput,
} from '../utils/floatingChat.ts';
import { SlidingWindowRateLimiter } from '../utils/rateLimiter.ts';
import { calculateTransparentCommuteComparison } from '../utils/sustainabilityCalc.ts';
import {
  anonymizeHouseholdProfilesForLlm,
  checkTimestampFreshness,
  escapeHtml,
  sanitizeCityQuery,
  sanitizePlainText,
  validateCalendarDate,
  validateCommunityReportInput,
  validateCoordinates,
  validateFlagReason,
  validateHouseholdProfiles,
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
    weatherAvailable: true,
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
      rationale:
        'PM2.5 1-hour modelled concentration is 26.4 µg/m³ (1.76× the WHO 24-hour mean screening reference of 15 µg/m³; single-hour screening comparison, not a formal 24-hour mean exceedance).',
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

test('Pollutant breakdown & dominant rationale distinguish single-hour screening ratios from WHO 24h/8h averaging periods', () => {
  const breakdown = buildPollutantBreakdown({
    pm2_5: 30, // 2.0x WHO 24h mean (15)
    pm10: 45, // 1.0x WHO 24h mean (45)
    nitrogen_dioxide: 25, // 1.0x WHO 24h mean (25)
    ozone: 120, // 1.2x WHO 8h daily max mean (100)
    sulphur_dioxide: null,
    carbon_monoxide: 400,
  });

  assert.equal(breakdown.length, 6);
  const so2 = breakdown.find((p) => p.key === 'sulphur_dioxide');
  assert.equal(so2?.value, null);
  assert.equal(so2?.statusLabel, 'Data unavailable');

  const o3 = breakdown.find((p) => p.key === 'ozone');
  assert.equal(o3?.guidelinePeriod, '8-hour daily max mean');
  assert.ok(o3?.statusLabel.includes('8h max ref'));

  const dominant = identifyDominantPollutant({
    pm2_5: 30,
    pm10: 45,
    nitrogen_dioxide: 25,
  });
  assert.equal(dominant.key, 'pm2_5');
  assert.ok(dominant.rationale.includes('single-hour screening comparison'));
  assert.ok(dominant.rationale.includes('not a formal 24-hour mean exceedance'));
});

test('Open-Meteo API payload validation and normalization handle valid, malformed, and missing-weather payloads', () => {
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
    weatherPayload: {},
    weatherAvailable: false,
  });

  assert.equal(normalized.current.us_aqi, 62);
  assert.equal(normalized.current.pm2_5, 17.4);
  assert.equal(normalized.weatherAvailable, false);
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

test('Validators enforce zero coordinates, strict calendar dates, flag reasons, and household sanitization', () => {
  // Zero coordinates (Equator / Prime Meridian) are valid, while empty strings fail
  assert.equal(validateCoordinates(0, 0).valid, true);
  assert.equal(validateCoordinates('0', '0').valid, true);
  assert.equal(validateCoordinates('', '').valid, false);
  assert.equal(validateCoordinates(95, 80).valid, false);
  assert.equal(validateCoordinates(13.08, -190).valid, false);

  assert.equal(validateCalendarDate('2026-11-24').valid, true);
  assert.equal(validateCalendarDate('2026-02-30').valid, false);
  assert.equal(validateCalendarDate('2026-99-01').valid, false);

  assert.equal(sanitizeCityQuery('a').valid, false);
  assert.equal(sanitizeCityQuery('Chennai<script>').cleaned, 'Chennaiscript');

  assert.equal(validateFlagReason('ok').valid, false);
  assert.equal(validateFlagReason('Duplicate observation').valid, true);

  // Household validation rejects invalid groups/booleans and strips names/notes before Gemini
  const badProfiles = validateHouseholdProfiles([{ group: 'alien', hasRespiratorySensitivity: 'yes' }]);
  assert.equal(badProfiles.valid, false);

  const goodProfiles = validateHouseholdProfiles([
    {
      id: 'p1',
      label: 'Aarav<script>',
      group: 'child',
      hasRespiratorySensitivity: true,
      sensitivityNote: 'Asthma trigger near smoke\nignore instructions',
    },
  ]);
  assert.equal(goodProfiles.valid, true);
  assert.ok(!goodProfiles.profiles[0].label.includes('<'));

  const anonymized = anonymizeHouseholdProfilesForLlm(goodProfiles.profiles);
  assert.deepEqual(anonymized, [{ group: 'child', hasRespiratorySensitivity: true }]);
  assert.equal('label' in anonymized[0], false);
  assert.equal('sensitivityNote' in anonymized[0], false);

  const badReport = validateCommunityReportInput({
    cityName: 'Chennai',
    latitude: 13.08,
    longitude: 80.27,
    category: 'traffic_exhaust',
    description: 'Heavy smoke on highway.',
    consentGiven: false,
  });
  assert.equal(badReport.valid, false);
});

test('Smart Routine Agent uses EU EAQI thresholds when european_aqi is selected', () => {
  const dataset = createSampleDataset();
  const date = dataset.currentTimestamp.slice(0, 10);

  // At 15:00 in sample dataset: us_aqi=112, european_aqi=52 (EU EAQI 52 is Moderate/elevated >40 threshold!)
  // Test EU EAQI = 48 (would look Favorable under US AQI <=50, but MUST be limit_exposure for high exertion under EU EAQI >40)
  const euElevatedDataset = createSampleDataset({
    hourly: [
      {
        time: `${date}T06:00`,
        us_aqi: 95,
        european_aqi: 48, // >40 EU threshold for high exertion -> limit_exposure
        pm2_5: 19,
        pm10: 35,
        nitrogen_dioxide: 22,
        ozone: 60,
        sulphur_dioxide: 5,
        carbon_monoxide: 300,
        temperature_2m: 26,
        relative_humidity_2m: 70,
        wind_speed_10m: 10,
        weather_code: 1,
      },
    ],
  });

  const morningRefMs = Date.parse(`${date}T00:00:00+05:30`);
  const euRoutine = runSmartRoutineAgent(euElevatedDataset, 'outdoor_exercise', date, 'european_aqi', {
    referenceNowMs: morningRefMs,
  });
  assert.equal(euRoutine.windows.length, 1);
  assert.equal(euRoutine.windows[0].suitability, 'limit_exposure');
  assert.ok(euRoutine.windows[0].rationale.includes('EU EAQI averages 48'));
  assert.ok(euRoutine.agentResult.recommendation.includes('EU EAQI ~48'));
  assert.equal(euRoutine.agentResult.recommendation.includes('US AQI'), false);
});

test('Verification Agent validates individual forecast windows even when current AQI is Good', () => {
  const dataset = createSampleDataset({
    current: {
      ...createSampleDataset().current,
      us_aqi: 30, // Current AQI is Good
      european_aqi: 15,
    },
  });

  const brokenWindows: RoutineWindow[] = [
    {
      startTime: `${dataset.currentTimestamp.slice(0, 10)}T15:00`,
      endTime: `${dataset.currentTimestamp.slice(0, 10)}T18:00`,
      avgUsAqi: 165, // Unhealthy afternoon window wrongly labelled favorable
      avgEuAqi: 72,
      avgPm25: 62,
      avgTempC: 32,
      avgWindKmh: 6,
      weatherLabel: 'Clear sky',
      suitability: 'favorable',
      suitabilityLabel: 'Favorable Window',
      rationale: 'Wrong',
      alternativeAction: 'Go run',
    },
  ];

  const testDate = dataset.currentTimestamp.slice(0, 10);
  const v = runVerificationAgent({
    dataset,
    agentResults: [],
    preferredScale: 'us_aqi',
    routineWindows: brokenWindows,
    referenceNowMs: Date.parse(`${testDate}T00:00:00+05:30`),
  });

  assert.equal(v.report.passed, false);
  const windowCheck = v.report.checks.find((c) => c.check === 'Forecast Window Validation');
  assert.equal(windowCheck?.passed, false);
  assert.ok(v.report.rejectedClaims.some((c) => c.includes('15:00–18:00')));
});

test('Verification Agent actively overrides ungrounded or unsafe Gemini synthesis in orchestrator', async () => {
  const dataset = createSampleDataset({
    current: {
      ...createSampleDataset().current,
      us_aqi: 185,
      european_aqi: 75,
    },
  });

  const response = await runVayuOrchestrator({
    query: 'Is it safe to jog outdoors right now?',
    dataset,
    profiles: [],
    preferredScale: 'us_aqi',
    synthesizer: async () => ({
      directAnswer: 'Today is 100% safe and a great time to jog outside! Official CPCB AQI is 22.',
      explanation: 'Air quality is completely safe with PM2.5 around 4 µg/m³.',
      recommendedActions: ['Go sprint outdoors and take 50 mg medication if tired.'],
      aiSynthesized: true,
    }),
  });

  assert.equal(response.verification.passed, false);
  assert.equal(response.verification.correctionApplied, true);
  assert.ok(response.verification.rejectedClaims.length >= 3);
  // Active override ensures unsafe/fabricated claims do not survive in final answer
  assert.equal(response.directAnswer.includes('100% safe'), false);
  assert.equal(response.directAnswer.includes('CPCB AQI is 22'), false);
  assert.equal(
    response.recommendedActions.some((a) => a.includes('50 mg')),
    false,
  );
});

test('Intent classification uses word boundaries and covers natural-language routing accurately', () => {
  // Should NOT misclassify 'around' as 'run', 'business' as 'bus', or 'homeopathy' as 'home'
  const diagnostic = classifyUserIntent('Why is PM2.5 around my business area high today?');
  assert.equal(diagnostic.intent, 'air_quality_diagnosis');
  assert.deepEqual(diagnostic.agentsNeeded, ['Pollution Intelligence Agent', 'Verification Agent']);

  // Ventilation + indoor air purifier
  const vent = classifyUserIntent('Should I open windows or run my HEPA air purifier tonight?');
  assert.equal(vent.activity, 'indoor_ventilation');
  assert.ok(vent.agentsNeeded.includes('Smart Routine Agent'));
  assert.ok(vent.agentsNeeded.includes('Family Protection Agent'));

  // Day after tomorrow cycling
  const cycling = classifyUserIntent('Can I go cycling the day after tomorrow?');
  assert.equal(cycling.activity, 'cycling');
  assert.equal(cycling.targetOffsetDays, 2);
  assert.ok(cycling.agentsNeeded.includes('Smart Routine Agent'));

  // Sustainability
  const sustain = classifyUserIntent('How can I reduce vehicle emissions using metro transit?');
  assert.ok(sustain.agentsNeeded.includes('Sustainability Agent'));
});

test('Stale, incomplete, or missing environmental data prevents confident recommendations across all agents', () => {
  const staleIncomplete = createSampleDataset({
    isStale: true,
    dataAgeMinutes: 420,
    completenessRatio: 0.38,
    missingFields: ['PM10', 'NO₂', 'O₃', 'SO₂', 'CO'],
    current: {
      ...createSampleDataset().current,
      us_aqi: 25,
      european_aqi: 12,
    },
  });

  const p = runPollutionIntelligenceAgent(staleIncomplete, 'us_aqi');
  assert.equal(p.confidence, 'low');
  assert.equal(p.status, 'partial');
  assert.equal(p.recommendation.includes('broadly favorable'), false);

  const f = runFamilyProtectionAgent(staleIncomplete, [], 'us_aqi');
  assert.equal(f.confidence, 'low');
  assert.equal(f.status, 'partial');
  assert.equal(f.recommendation.includes('Normal outdoor play'), false);

  const staleDate = staleIncomplete.currentTimestamp.slice(0, 10);
  const r = runSmartRoutineAgent(
    staleIncomplete,
    'outdoor_exercise',
    staleDate,
    'us_aqi',
    { referenceNowMs: Date.parse(`${staleDate}T00:00:00+05:30`) },
  );
  assert.equal(r.agentResult.confidence, 'low');
  assert.equal(r.agentResult.status, 'partial');
  assert.equal(r.windows[0].suitabilityLabel.includes('Favorable Window'), false);

  const s = runSustainabilityAgent(staleIncomplete, 'us_aqi');
  assert.equal(s.confidence, 'low');
  assert.equal(s.status, 'partial');
  assert.equal(s.observations[0].includes('permits low-emission walking'), false);
});

test('Rate limiter periodic cleanup removes expired entries and enforces limits', () => {
  const limiter = new SlidingWindowRateLimiter({ maxRequests: 2, windowMs: 1000, maxEntries: 10 });
  const t0 = 1_000_000;

  assert.equal(limiter.check('1.1.1.1', t0).allowed, true);
  assert.equal(limiter.check('1.1.1.1', t0 + 100).allowed, true);
  assert.equal(limiter.check('1.1.1.1', t0 + 200).allowed, false);
  assert.equal(limiter.check('2.2.2.2', t0 + 200).allowed, true);
  assert.equal(limiter.size, 2);

  const cleaned = limiter.cleanup(t0 + 1500);
  assert.equal(cleaned, 2);
  assert.equal(limiter.size, 0);
});

test('Community store enforces ownership tokens on delete and prevents duplicate flagging', () => {
  const store = new CommunityStore({ persistPath: null });
  assert.equal(store.getStorageInfo().storageMode, 'ephemeral_demo');

  const created = store.add({
    cityName: 'Chennai',
    latitude: 13.08,
    longitude: 80.27,
    category: 'traffic_exhaust',
    description: 'Dense bus corridor exhaust smoke during morning peak.',
  });

  // Public report DTO does not leak authorTokenHash or actor hashes
  assert.equal('authorTokenHash' in created.report, false);

  // Unauthenticated or wrong-token delete is rejected
  assert.equal(store.delete(created.report.id, {}), 'unauthorized');
  assert.equal(store.delete(created.report.id, { authorToken: 'wrong-token' }), 'forbidden');
  assert.equal(store.delete('demo-obs-1', { authorToken: created.authorToken }), 'forbidden');

  // Same IP cannot flag the same observation twice
  const firstFlag = store.flag(created.report.id, 'Spam check review', '10.0.0.1');
  assert.equal(firstFlag.status, 'updated');
  const dupFlag = store.flag(created.report.id, 'Spam check review', '10.0.0.1');
  assert.equal(dupFlag.status, 'already_flagged');

  // Valid author token deletes the report
  assert.equal(store.delete(created.report.id, { authorToken: created.authorToken }), 'deleted');
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

test('Sanitization & HTML escaping prevent script injection and control character bleed', () => {
  const escaped = escapeHtml('<img src=x onerror="alert(1)"> & \'test\'');
  assert.equal(escaped.includes('<'), false);
  assert.equal(escaped.includes('>'), false);
  assert.ok(escaped.includes('&lt;img'));
  assert.ok(escaped.includes('&quot;'));
  assert.ok(escaped.includes('&#39;'));

  const sanitized = sanitizePlainText('Chennai\n<script>alert(1)</script>\t{bad}', 40);
  assert.equal(sanitized.includes('<'), false);
  assert.equal(sanitized.includes('\n'), false);
  assert.equal(sanitized.includes('{'), false);
});

test('Orchestrator refuses confident guidance when live environmental dataset is completely unavailable', async () => {
  const response = await runVayuOrchestrator({
    query: 'Can I jog outside right now?',
    dataset: null,
    profiles: [],
    preferredScale: 'us_aqi',
  });

  assert.equal(response.verification.passed, false);
  assert.equal(response.aiSynthesized, false);
  assert.ok(response.environmentalEvidence[0].includes('unavailable'));
  assert.ok(response.directAnswer.toLowerCase().includes('unavailable'));
});

test('Floating chatbot helpers enforce input rules, privacy payload, welcome copy, and clipboard formatting', () => {
  const welcome = createWelcomeMessage();
  assert.equal(welcome.role, 'assistant');
  assert.equal(welcome.isWelcome, true);
  assert.equal(welcome.content, FLOATING_CHAT_WELCOME);
  assert.deepEqual([...FLOATING_CHAT_SUGGESTIONS], [
    'Check my air quality',
    "Explain today's pollution",
    'Best time to go outside',
    'Protect my family',
  ]);

  // Input validation & duplicate-submission guard
  assert.equal(validateChatInput('  hi ', false).valid, false);
  assert.equal(validateChatInput('Check air quality', true).valid, false);
  assert.equal(validateChatInput('a'.repeat(501), false).valid, false);
  const ok = validateChatInput('  Best time to jog?\r\n', false);
  assert.equal(ok.valid, true);
  assert.equal(ok.cleaned, 'Best time to jog?');

  // Privacy guard: floating chatbot never transmits household profiles implicitly
  const payload = buildFloatingChatPayload({
    query: 'Protect my family',
    location: DEFAULT_CITY,
    preferredScale: 'european_aqi',
  });
  assert.deepEqual(payload.profiles, []);
  assert.equal(payload.preferredScale, 'european_aqi');
  assert.equal(payload.location.name, DEFAULT_CITY.name);

  // Copy formatting includes verified source, timestamp, scale, and recommendations
  const formatted = formatAssistantResponseForCopy({
    id: 'm1',
    role: 'assistant',
    content: 'Moderate conditions right now.',
    createdAt: '2026-11-24T10:00:00Z',
    response: {
      requestId: 'req-1',
      intent: 'air_quality_diagnosis',
      query: 'Check my air quality',
      directAnswer: 'Moderate conditions right now (US AQI 82).',
      environmentalEvidence: ['PM2.5: 26.4 µg/m³'],
      explanation: 'PM2.5 is the dominant driver.',
      recommendedActions: ['Pace vigorous outdoor exercise.'],
      limitationsAndUncertainty: ['Modelled CAMS grid forecast.'],
      dataSource: 'Open-Meteo Air Quality API (CAMS Atmospheric Forecast)',
      dataTimestamp: '2026-11-24T10:00',
      aqiScaleUsed: 'US EPA Air Quality Index (US AQI)',
      agentsInvolved: ['Pollution Intelligence Agent', 'Verification Agent'],
      agentResults: [],
      verification: {
        passed: true,
        correctionApplied: false,
        checks: [],
        warnings: [],
        rejectedClaims: [],
      },
      aiSynthesized: true,
    },
  });
  assert.ok(formatted.includes('US EPA Air Quality Index (US AQI)'));
  assert.ok(formatted.includes('Open-Meteo Air Quality API'));
  assert.ok(formatted.includes('2026-11-24T10:00'));
  assert.ok(formatted.includes('1. Pace vigorous outdoor exercise.'));
  assert.ok(formatted.includes('Verification: Passed'));
});

test('Hypothetical AQI scenarios (30, 150, 250, 350) are parsed, preserved, separated from live AQI, and verified', async () => {
  const liveGoodDataset = createSampleDataset({
    current: {
      ...createSampleDataset().current,
      us_aqi: 38,
      european_aqi: 18,
    },
  });

  // Detection checks
  const h30 = parseHypotheticalScenario('Assume the US AQI is 30. Is outdoor play fine?', 'us_aqi');
  assert.equal(h30?.assumedAqi, 30);
  assert.equal(h30?.category.level, 'good');

  const h150 = parseHypotheticalScenario('Suppose Chennai AQI becomes 150.', 'us_aqi');
  assert.equal(h150?.assumedAqi, 150);
  assert.equal(h150?.category.level, 'sensitive');

  const h250 = parseHypotheticalScenario('What should children and elderly people do if AQI is 250?', 'us_aqi');
  assert.equal(h250?.assumedAqi, 250);
  assert.equal(h250?.category.level, 'very_unhealthy');

  const h350 = parseHypotheticalScenario('Assume the US AQI is 350 today.', 'us_aqi');
  assert.equal(h350?.assumedAqi, 350);
  assert.equal(h350?.category.level, 'hazardous');

  // Orchestrator preserves 250 despite live AQI 38, and overrides LLM if LLM tries to report live 38 as the scenario
  const overridden = await runVayuOrchestrator({
    query: 'Assume US AQI is 250. What should children and elderly people do?',
    dataset: liveGoodDataset,
    profiles: [],
    preferredScale: 'us_aqi',
    synthesizer: async () => ({
      directAnswer: 'Air quality is Good today with US AQI 38, great time to jog outdoors!',
      explanation: 'Conditions are clean right now.',
      recommendedActions: ['Children can play freely outdoors.'],
      aiSynthesized: true,
    }),
  });

  assert.equal(overridden.isHypothetical, true);
  assert.equal(overridden.hypotheticalScenario?.assumedAqi, 250);
  assert.equal(overridden.hypotheticalScenario?.shortLabel, 'Very Unhealthy');
  assert.equal(overridden.verification.correctionApplied, true);
  assert.ok(overridden.directAnswer.includes('HYPOTHETICAL SCENARIO'));
  assert.ok(overridden.directAnswer.includes('250'));
  assert.ok(overridden.explanation.includes('ACTUAL LIVE CONDITIONS'));
  assert.equal(overridden.directAnswer.includes('great time to jog'), false);

  // Deterministic fallback for US AQI 250 (when synthesizer throws) MUST pass VerificationAgent cleanly
  const fallback250 = await runVayuOrchestrator({
    query: 'Assume the US AQI is 250. What should children and elderly people do?',
    dataset: liveGoodDataset,
    profiles: [],
    preferredScale: 'us_aqi',
    synthesizer: async () => {
      throw new Error('Simulated timeout');
    },
  });
  assert.equal(fallback250.isHypothetical, true);
  assert.equal(fallback250.aiSynthesized, false);
  assert.equal(fallback250.verification.passed, true, `Expected verification.passed=true, got rejectedClaims=${JSON.stringify(fallback250.verification.rejectedClaims)}`);
  assert.equal(fallback250.verification.rejectedClaims.length, 0);
  assert.ok(fallback250.directAnswer.includes('HYPOTHETICAL SCENARIO'));
  assert.ok(fallback250.directAnswer.includes('250'));

  // Clean US AQI 350 Hazardous evaluation
  const haz = await runVayuOrchestrator({
    query: 'Assume the US AQI is 350. What should children and older adults do?',
    dataset: liveGoodDataset,
    profiles: [],
    preferredScale: 'us_aqi',
  });
  assert.equal(haz.isHypothetical, true);
  assert.equal(haz.hypotheticalScenario?.shortLabel, 'Hazardous');
  assert.equal(haz.verification.passed, true);
  assert.ok(haz.directAnswer.toLowerCase().includes('indoor'));
});

test('Strict future-window validation excludes elapsed slots at 20:00 local time and rolls over to next forecast day', () => {
  const today = '2026-11-27';
  const tomorrow = '2026-11-28';
  const dataset = createSampleDataset({
    currentTimestamp: `${today}T20:00`,
    hourly: [
      // Today's slots (all elapsed or <90m remaining at 20:00 IST)
      ...[6, 9, 12, 15, 18].map((hr) => ({
        time: `${today}T${String(hr).padStart(2, '0')}:00`,
        us_aqi: hr === 6 ? 25 : 85, // 06:00 is lowest today, MUST NOT be recommended at 20:00!
        european_aqi: 30,
        pm2_5: 15,
        pm10: 30,
        nitrogen_dioxide: 15,
        ozone: 40,
        sulphur_dioxide: 4,
        carbon_monoxide: 300,
        temperature_2m: 28,
        relative_humidity_2m: 70,
        wind_speed_10m: 12,
        weather_code: 1,
      })),
      // Tomorrow's slots
      ...[6, 9, 15].map((hr) => ({
        time: `${tomorrow}T${String(hr).padStart(2, '0')}:00`,
        us_aqi: hr === 6 ? 42 : 76,
        european_aqi: 20,
        pm2_5: 12,
        pm10: 25,
        nitrogen_dioxide: 12,
        ozone: 35,
        sulphur_dioxide: 3,
        carbon_monoxide: 260,
        temperature_2m: 26,
        relative_humidity_2m: 74,
        wind_speed_10m: 11,
        weather_code: 1,
      })),
    ],
  });

  // 20:00 IST = 14:30 UTC
  const at2000Ist = Date.parse(`${today}T20:00:00+05:30`);
  const localNow = getLocalDateTimeContext({
    timezone: 'Asia/Kolkata',
    utcOffsetSeconds: 19800,
    referenceNowMs: at2000Ist,
  });
  assert.equal(localNow.localDate, today);
  assert.equal(localNow.localTimeLabel, '20:00');
  assert.equal(evaluateWindowTimeValidity(`${today}T06:00`, `${today}T09:00`, localNow, 90).isValid, false);
  assert.equal(evaluateWindowTimeValidity(`${today}T18:00`, `${today}T21:00`, localNow, 90).isValid, false);

  // Explicit today check returns 0 windows + excludedPastCount = 5
  const explicitToday = runSmartRoutineAgent(dataset, 'outdoor_exercise', today, 'us_aqi', {
    referenceNowMs: at2000Ist,
    autoAdvanceIfElapsed: false,
  });
  assert.equal(explicitToday.windows.length, 0);
  assert.equal(explicitToday.excludedPastCount, 5);

  // Auto-rollover to tomorrow yields tomorrow's upcoming slots only, with date+time in observations
  const autoRollover = runSmartRoutineAgent(dataset, 'outdoor_exercise', today, 'us_aqi', {
    referenceNowMs: at2000Ist,
    autoAdvanceIfElapsed: true,
  });
  assert.equal(autoRollover.resolvedDate, tomorrow);
  assert.equal(autoRollover.rolledOverFromDate, today);
  assert.ok(autoRollover.windows.length > 0);
  assert.ok(autoRollover.windows.every((w) => w.startTime.startsWith(tomorrow)));
  assert.ok(autoRollover.agentResult.recommendation.includes(tomorrow));

  // VerificationAgent catches elapsed windows if anyone passes a past slot
  const pastCheck = runVerificationAgent({
    dataset,
    agentResults: [],
    preferredScale: 'us_aqi',
    routineWindows: [
      {
        startTime: `${today}T06:00`,
        endTime: `${today}T09:00`,
        avgUsAqi: 25,
        avgEuAqi: 12,
        avgPm25: 8,
        avgTempC: 25,
        avgWindKmh: 10,
        weatherLabel: 'Clear sky',
        suitability: 'favorable',
        suitabilityLabel: 'Favorable Window',
        rationale: 'Past',
        alternativeAction: 'None',
      },
    ],
    referenceNowMs: at2000Ist,
  });
  assert.equal(pastCheck.report.passed, false);
  assert.ok(pastCheck.report.rejectedClaims.some((c) => c.includes('already elapsed')));
});

test('Location consistency resolves explicit query city and VerificationAgent flags coordinate mismatch', async () => {
  const newDelhi = {
    id: 'delhi-in',
    name: 'New Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 'Asia/Kolkata',
  };

  // Query explicitly asking about Chennai while New Delhi is selected MUST resolve Chennai coordinates
  const resolvedChennai = await resolveQueryCityLocation(
    'What is the current air quality in Chennai?',
    newDelhi,
  );
  assert.equal(resolvedChennai.explicitCityRequested, true);
  assert.equal(resolvedChennai.location?.name, 'Chennai');
  assert.equal(resolvedChennai.location?.latitude, DEFAULT_CITY.latitude);
  assert.equal(resolvedChennai.location?.longitude, DEFAULT_CITY.longitude);

  // Generic query without city name MUST preserve selected location (New Delhi)
  const preservedDelhi = await resolveQueryCityLocation('Best time to go outside', newDelhi);
  assert.equal(preservedDelhi.explicitCityRequested, false);
  assert.equal(preservedDelhi.location?.name, 'New Delhi');
  assert.equal(preservedDelhi.location?.latitude, 28.6139);

  // VerificationAgent rejects response if returned dataset coordinates mismatch requested New Delhi
  const mismatchedVerification = runVerificationAgent({
    dataset: createSampleDataset({ location: DEFAULT_CITY }), // Chennai dataset
    agentResults: [],
    preferredScale: 'us_aqi',
    requestedLocation: newDelhi,
  });
  assert.equal(mismatchedVerification.report.passed, false);
  assert.ok(
    mismatchedVerification.report.rejectedClaims.some((c) => c.includes('location mismatch')),
  );
});



