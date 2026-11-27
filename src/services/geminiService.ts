import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { SynthesizedExplanation } from '../orchestrator/vayuOrchestrator.ts';
import type {
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  HouseholdProfile,
  RoutineWindow,
} from '../types/airQuality.ts';
import type { HypotheticalScenario } from '../utils/hypotheticalScenario.ts';
import { anonymizeHouseholdProfilesForLlm } from '../utils/validators.ts';

const GEMINI_ATTEMPT_TIMEOUT_MS = 15_000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out|abort/i.test(msg)) return false;
  return /\b(429|503|rate limit|resource exhausted|unavailable)\b/i.test(msg);
}

function normalizeGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Upstream Gemini request failed.';
  if (/GEMINI_API_KEY/i.test(raw)) {
    return 'Gemini API key is not configured on the server.';
  }
  if (/429|resource exhausted|quota/i.test(raw)) {
    return 'Gemini AI service is temporarily rate-limited; deterministic agent guidance is shown.';
  }
  if (/503|unavailable|timeout|timed out|abort/i.test(raw)) {
    return 'Gemini AI service took too long or is temporarily unavailable; deterministic agent guidance is shown.';
  }
  return 'Gemini synthesis encountered an error; deterministic specialist agent guidance is shown.';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function synthesizeVayuResponse(context: {
  query: string;
  intent: string;
  dataset: EnvironmentalDataset | null;
  preferredScale: AqiScale;
  agentResults: AgentResult[];
  profiles: HouseholdProfile[];
  routineWindows?: RoutineWindow[];
  hypotheticalScenario?: HypotheticalScenario | null;
}): Promise<SynthesizedExplanation> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  if (!context.dataset && !context.hypotheticalScenario) {
    throw new Error('Cannot synthesize AI explanation without verified environmental data.');
  }

  const effectiveScale = context.hypotheticalScenario
    ? context.hypotheticalScenario.scale
    : context.preferredScale;

  const scaleLabel =
    effectiveScale === 'european_aqi'
      ? 'European Air Quality Index (EU EAQI)'
      : 'US EPA Air Quality Index (US AQI)';

  // Strictly strip names/labels, IDs, timestamps, and free-text notes before passing to Gemini.
  const anonymizedGroups = anonymizeHouseholdProfilesForLlm(context.profiles);

  const dataset = context.dataset;
  let next12hForecast: Array<{
    time: string;
    activeAqi: number | null;
    pm2_5: number | null;
    ozone: number | null;
    wind_speed_10m: number | null;
  }> = [];

  if (dataset) {
    const nowIdx = dataset.hourly.findIndex((h) => h.time === dataset.currentTimestamp);
    const startIdx = nowIdx >= 0 ? nowIdx : 0;
    next12hForecast = dataset.hourly.slice(startIdx + 1, startIdx + 13).map((h) => ({
      time: h.time,
      activeAqi: effectiveScale === 'european_aqi' ? h.european_aqi : h.us_aqi,
      pm2_5: h.pm2_5,
      ozone: h.ozone,
      wind_speed_10m: h.wind_speed_10m ?? null,
    }));
  }

  const promptPayload = {
    userQuestion: context.query,
    detectedIntent: context.intent,
    hypotheticalScenario: context.hypotheticalScenario
      ? {
          isHypothetical: true,
          assumedAqi: context.hypotheticalScenario.assumedAqi,
          scaleLabel: context.hypotheticalScenario.scaleLabel,
          categoryLabel: context.hypotheticalScenario.category.label,
          shortLabel: context.hypotheticalScenario.category.shortLabel,
          guidanceRule:
            'Evaluate this HYPOTHETICAL SCENARIO using the exact assumedAqi. Keep live readings strictly separate under an Actual Live Conditions note if mentioned. NEVER overwrite assumedAqi with live AQI.',
        }
      : null,
    location: dataset
      ? `${dataset.location.name}${dataset.location.country ? `, ${dataset.location.country}` : ''} (${dataset.location.latitude.toFixed(4)}, ${dataset.location.longitude.toFixed(4)})`
      : 'Scenario evaluation',
    dataSource: dataset ? `${dataset.modelSource} & ${dataset.weatherSource}` : 'Hypothetical Scenario',
    dataTimestamp: dataset?.currentTimestamp ?? 'Hypothetical Scenario',
    dataFreshness: dataset
      ? {
          dataAgeMinutes: dataset.dataAgeMinutes,
          isStale: dataset.isStale,
          completenessRatio: dataset.completenessRatio,
          missingFields: dataset.missingFields,
          weatherAvailable: dataset.weatherAvailable ?? true,
        }
      : null,
    activeAqiScale: scaleLabel,
    currentMetrics: dataset
      ? {
          activeAqi:
            effectiveScale === 'european_aqi'
              ? dataset.current.european_aqi
              : dataset.current.us_aqi,
          pm2_5: dataset.current.pm2_5,
          pm10: dataset.current.pm10,
          nitrogen_dioxide: dataset.current.nitrogen_dioxide,
          ozone: dataset.current.ozone,
          sulphur_dioxide: dataset.current.sulphur_dioxide,
          carbon_monoxide: dataset.current.carbon_monoxide,
          temperature_2m: dataset.current.temperature_2m,
          relative_humidity_2m: dataset.current.relative_humidity_2m,
          wind_speed_10m: dataset.current.wind_speed_10m,
          weather_label: dataset.current.weather_label,
        }
      : null,
    dominantPollutant: dataset?.dominantPollutant ?? null,
    next12hForecast,
    routineWindows: (context.routineWindows ?? []).map((w) => ({
      date: w.startTime.slice(0, 10),
      startTime: w.startTime,
      endTime: w.endTime,
      timeStatus: w.timeStatus ?? 'future',
      remainingMinutes: w.remainingMinutes,
      activeAqi: effectiveScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi,
      avgPm25: w.avgPm25,
      suitability: w.suitability,
      suitabilityLabel: w.suitabilityLabel,
      weatherLabel: w.weatherLabel,
    })),
    whoAveragingDisclosure:
      'Hourly concentrations compared against WHO 24-hour mean (PM2.5 15, PM10 45, NO2 25, SO2 40, CO 4000) or 8-hour daily max mean (O3 100) are single-hour screening ratios, NOT formal multi-hour compliance exceedances.',
    anonymizedHouseholdSummary: {
      totalProfiles: anonymizedGroups.length,
      groups: anonymizedGroups,
    },
    specialistAgentFindings: context.agentResults.map((a) => ({
      agent: a.agent_name,
      status: a.status,
      confidence: a.confidence,
      observations: a.observations,
      recommendation: a.recommendation,
      limitations: a.limitations,
    })),
  };

  const systemInstruction = `You are VAYU AI, a calm, factual Urban Air Quality Intelligence Assistant.
Strictly obey these rules:
1. Ground EVERY numeric value, pollutant reading, weather metric, and forecast window strictly in the JSON context provided. NEVER invent numbers, monitoring stations, time slots, or unsupported facts.
2. Explicitly cite the active AQI scale (${scaleLabel}) and the resolved location whenever mentioning an AQI score. Never call Open-Meteo CAMS modelled grid data an official Indian CPCB monitoring station reading.
3. Never guarantee that any outdoor time window is "completely safe" or "zero risk". Use relative phrasing like "lower-exposure window".
4. Do NOT present single-hour pollutant values as formal 24-hour or 8-hour WHO guideline exceedances; describe them as single-hour screening comparisons.
5. If dataFreshness is present and (isStale is true, completenessRatio < 0.6, or currentMetrics.activeAqi is null) AND hypotheticalScenario is null, do NOT give confident outdoor endorsements—explicitly state the data limitation and advise refreshing readings.
6. Never give medical diagnoses, clinical assessments, or prescriptions. Keep guidance strictly focused on environmental exposure reduction.
7. When hypotheticalScenario is non-null: clearly begin with "HYPOTHETICAL SCENARIO", evaluate the exact assumedAqi (${context.hypotheticalScenario?.assumedAqi ?? ''}) and its category (${context.hypotheticalScenario?.category.shortLabel ?? ''}), NEVER replace assumedAqi with currentMetrics.activeAqi, and mention actual live conditions only as a clearly separated reference note.
8. When referencing routineWindows, include BOTH the date and time range (YYYY-MM-DD HH:MM–HH:MM) and NEVER recommend or invent time windows outside routineWindows.`;

  let lastError: unknown;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Synthesize a clear, concise, evidence-backed response for this context:\n${JSON.stringify(promptPayload)}`,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                directAnswer: {
                  type: Type.STRING,
                  description:
                    'A direct 1-2 sentence answer addressing the user question using verified metrics (or hypothetical assumed AQI) and active AQI scale.',
                },
                explanation: {
                  type: Type.STRING,
                  description:
                    'Clear 2-4 sentence explanation of pollutants, weather factors, future forecast windows, or hypothetical vs actual live separation.',
                },
                recommendedActions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    '3 to 4 concrete, practical actions tailored to the user question and anonymized household groups.',
                },
              },
              required: ['directAnswer', 'explanation', 'recommendedActions'],
            },
          },
        }),
        GEMINI_ATTEMPT_TIMEOUT_MS,
        'Gemini synthesis timed out.',
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error('Gemini returned an empty response.');
      }

      const parsed = JSON.parse(rawText) as {
        directAnswer?: string;
        explanation?: string;
        recommendedActions?: string[];
      };

      if (
        typeof parsed.directAnswer !== 'string' ||
        !parsed.directAnswer.trim() ||
        typeof parsed.explanation !== 'string' ||
        !parsed.explanation.trim() ||
        !Array.isArray(parsed.recommendedActions)
      ) {
        throw new Error('Gemini response did not match the expected structured format.');
      }

      return {
        directAnswer: parsed.directAnswer.trim(),
        explanation: parsed.explanation.trim(),
        recommendedActions: parsed.recommendedActions
          .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
          .slice(0, 5),
        aiSynthesized: true,
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isTransientGeminiError(err)) {
        await sleep(250);
        continue;
      }
      break;
    }
  }

  throw new Error(normalizeGeminiError(lastError));
}
