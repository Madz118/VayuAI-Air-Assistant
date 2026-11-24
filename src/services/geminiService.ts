import { GoogleGenAI, Type } from '@google/genai';
import type { SynthesizedExplanation } from '../orchestrator/vayuOrchestrator.ts';
import type {
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  HouseholdProfile,
  RoutineWindow,
} from '../types/airQuality.ts';
import { anonymizeHouseholdProfilesForLlm } from '../utils/validators.ts';

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
  return /\b(429|503|rate limit|resource exhausted|unavailable|timeout|etimedout)\b/i.test(msg);
}

function normalizeGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Upstream Gemini request failed.';
  if (/GEMINI_API_KEY/i.test(raw)) {
    return 'Gemini API key is not configured on the server.';
  }
  if (/429|resource exhausted|quota/i.test(raw)) {
    return 'Gemini AI service is temporarily rate-limited; deterministic agent guidance is shown.';
  }
  if (/503|unavailable|timeout|abort/i.test(raw)) {
    return 'Gemini AI service is temporarily unavailable; deterministic agent guidance is shown.';
  }
  return 'Gemini synthesis encountered an error; deterministic specialist agent guidance is shown.';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function synthesizeVayuResponse(context: {
  query: string;
  intent: string;
  dataset: EnvironmentalDataset | null;
  preferredScale: AqiScale;
  agentResults: AgentResult[];
  profiles: HouseholdProfile[];
  routineWindows?: RoutineWindow[];
}): Promise<SynthesizedExplanation> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  if (!context.dataset) {
    throw new Error('Cannot synthesize AI explanation without verified environmental data.');
  }

  const scaleLabel =
    context.preferredScale === 'european_aqi'
      ? 'European Air Quality Index (EU EAQI)'
      : 'US EPA Air Quality Index (US AQI)';

  // Strictly strip names/labels, IDs, timestamps, and free-text notes before passing to Gemini.
  const anonymizedGroups = anonymizeHouseholdProfilesForLlm(context.profiles);

  const nowIdx = context.dataset.hourly.findIndex(
    (h) => h.time === context.dataset!.currentTimestamp,
  );
  const startIdx = nowIdx >= 0 ? nowIdx : 0;
  const next12hForecast = context.dataset.hourly.slice(startIdx + 1, startIdx + 13).map((h) => ({
    time: h.time,
    activeAqi: context.preferredScale === 'european_aqi' ? h.european_aqi : h.us_aqi,
    pm2_5: h.pm2_5,
    ozone: h.ozone,
    wind_speed_10m: h.wind_speed_10m,
  }));

  const promptPayload = {
    userQuestion: context.query,
    detectedIntent: context.intent,
    location: `${context.dataset.location.name}, ${context.dataset.location.country}`,
    dataSource: `${context.dataset.modelSource} & ${context.dataset.weatherSource}`,
    dataTimestamp: context.dataset.currentTimestamp,
    dataFreshness: {
      dataAgeMinutes: context.dataset.dataAgeMinutes,
      isStale: context.dataset.isStale,
      completenessRatio: context.dataset.completenessRatio,
      missingFields: context.dataset.missingFields,
      weatherAvailable: context.dataset.weatherAvailable ?? true,
    },
    activeAqiScale: scaleLabel,
    currentMetrics: {
      activeAqi:
        context.preferredScale === 'european_aqi'
          ? context.dataset.current.european_aqi
          : context.dataset.current.us_aqi,
      pm2_5: context.dataset.current.pm2_5,
      pm10: context.dataset.current.pm10,
      nitrogen_dioxide: context.dataset.current.nitrogen_dioxide,
      ozone: context.dataset.current.ozone,
      sulphur_dioxide: context.dataset.current.sulphur_dioxide,
      carbon_monoxide: context.dataset.current.carbon_monoxide,
      temperature_2m: context.dataset.current.temperature_2m,
      relative_humidity_2m: context.dataset.current.relative_humidity_2m,
      wind_speed_10m: context.dataset.current.wind_speed_10m,
      weather_label: context.dataset.current.weather_label,
    },
    dominantPollutant: context.dataset.dominantPollutant,
    next12hForecast,
    routineWindows: (context.routineWindows ?? []).map((w) => ({
      startTime: w.startTime,
      endTime: w.endTime,
      activeAqi: context.preferredScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi,
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
1. Ground EVERY numeric value, pollutant reading, weather metric, and forecast window strictly in the JSON context provided. NEVER invent numbers, monitoring stations, or unsupported facts.
2. Explicitly cite the active AQI scale (${scaleLabel}) whenever mentioning an AQI score. Never call Open-Meteo CAMS modelled grid data an official Indian CPCB monitoring station reading.
3. Never guarantee that any outdoor time window is "completely safe" or "zero risk". Use relative phrasing like "lower-exposure window".
4. Do NOT present single-hour pollutant values as formal 24-hour or 8-hour WHO guideline exceedances; describe them as single-hour screening comparisons.
5. If dataFreshness.isStale is true, completenessRatio < 0.6, or currentMetrics.activeAqi is null, do NOT give confident outdoor endorsements—explicitly state the data limitation and advise refreshing readings.
6. Never give medical diagnoses, clinical assessments, or prescriptions. Keep guidance strictly focused on environmental exposure reduction.`;

  let lastError: unknown;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Synthesize a clear, evidence-backed response for this context:\n${JSON.stringify(promptPayload)}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              directAnswer: {
                type: Type.STRING,
                description:
                  'A direct 1-2 sentence answer addressing the user question using verified metrics and active AQI scale.',
              },
              explanation: {
                type: Type.STRING,
                description:
                  'Clear 2-4 sentence explanation of the pollutants, weather factors, forecast windows, and specialist agent reasoning.',
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
      });

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
        await sleep(350 * Math.pow(2, attempt - 1));
        continue;
      }
      break;
    }
  }

  throw new Error(normalizeGeminiError(lastError));
}
