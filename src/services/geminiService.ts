import { GoogleGenAI, Type } from '@google/genai';
import type { SynthesizedExplanation } from '../orchestrator/vayuOrchestrator.ts';
import type {
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  HouseholdProfile,
} from '../types/airQuality.ts';

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

export async function synthesizeVayuResponse(context: {
  query: string;
  intent: string;
  dataset: EnvironmentalDataset | null;
  preferredScale: AqiScale;
  agentResults: AgentResult[];
  profiles: HouseholdProfile[];
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

  const promptPayload = {
    userQuestion: context.query,
    detectedIntent: context.intent,
    location: `${context.dataset.location.name}, ${context.dataset.location.country}`,
    dataSource: `${context.dataset.modelSource} & ${context.dataset.weatherSource}`,
    dataTimestamp: context.dataset.currentTimestamp,
    activeAqiScale: scaleLabel,
    currentMetrics: context.dataset.current,
    dominantPollutant: context.dataset.dominantPollutant,
    householdProfilesCount: context.profiles.length,
    householdGroups: context.profiles.map((p) => ({
      group: p.group,
      hasRespiratorySensitivity: p.hasRespiratorySensitivity,
    })),
    specialistAgentFindings: context.agentResults.map((a) => ({
      agent: a.agent_name,
      status: a.status,
      observations: a.observations,
      recommendation: a.recommendation,
      limitations: a.limitations,
    })),
  };

  const systemInstruction = `You are VAYU AI, a calm, factual Urban Air Quality Intelligence Assistant.
Strictly obey these rules:
1. Base EVERY numeric value, pollutant reading, weather metric, and forecast window strictly on the JSON context provided. NEVER invent numbers, stations, or scientific facts.
2. Explicitly state the active AQI scale (${scaleLabel}) whenever citing an AQI score. Never call Open-Meteo CAMS modelled grid data an official Indian CPCB monitoring station reading.
3. Never guarantee that any outdoor time window is "completely safe" or "zero risk". Use relative phrasing like "lower-exposure window" or "more favorable forecast period".
4. Never give medical diagnoses, clinical assessments, or prescriptions. Keep guidance strictly focused on environmental exposure reduction.
5. Be concise, clear, empathetic, and practical.`;

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
            description: 'A direct 1-2 sentence answer addressing the user question using verified metrics and scale.',
          },
          explanation: {
            type: Type.STRING,
            description: 'Clear 2-4 sentence explanation of the pollutants, weather factors, and specialist agent reasoning.',
          },
          recommendedActions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 to 4 concrete, practical actions tailored to the user question and household context.',
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

  if (!parsed.directAnswer || !parsed.explanation || !Array.isArray(parsed.recommendedActions)) {
    throw new Error('Gemini response did not match the expected structured format.');
  }

  return {
    directAnswer: parsed.directAnswer,
    explanation: parsed.explanation,
    recommendedActions: parsed.recommendedActions.slice(0, 5),
    aiSynthesized: true,
  };
}
