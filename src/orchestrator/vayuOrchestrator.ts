import { runFamilyProtectionAgent } from '../agents/familyProtectionAgent.ts';
import { runPollutionIntelligenceAgent } from '../agents/pollutionIntelligenceAgent.ts';
import { runSmartRoutineAgent } from '../agents/smartRoutineAgent.ts';
import { runSustainabilityAgent } from '../agents/sustainabilityAgent.ts';
import { runVerificationAgent } from '../agents/verificationAgent.ts';
import type {
  ActivityType,
  AgentName,
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  HouseholdProfile,
  OrchestratorResponse,
} from '../types/airQuality.ts';

export interface SynthesizedExplanation {
  directAnswer: string;
  explanation: string;
  recommendedActions: string[];
  aiSynthesized: boolean;
  aiError?: string;
}

export type AiSynthesizerFn = (context: {
  query: string;
  intent: string;
  dataset: EnvironmentalDataset | null;
  preferredScale: AqiScale;
  agentResults: AgentResult[];
  profiles: HouseholdProfile[];
}) => Promise<SynthesizedExplanation>;

export function classifyUserIntent(query: string): {
  intent: string;
  activity: ActivityType;
  targetOffsetDays: number;
  agentsNeeded: AgentName[];
} {
  const q = query.toLowerCase();
  const targetOffsetDays = q.includes('tomorrow') ? 1 : 0;

  let activity: ActivityType = 'outdoor_exercise';
  if (q.includes('window') || q.includes('ventilat') || q.includes('indoor')) {
    activity = 'indoor_ventilation';
  } else if (q.includes('cycl') || q.includes('bike')) {
    activity = 'cycling';
  } else if (q.includes('walk')) {
    activity = 'walking';
  } else if (q.includes('commut') || q.includes('travel') || q.includes('office')) {
    activity = 'commuting';
  } else if (q.includes('kid') || q.includes('child') || q.includes('school')) {
    activity = 'children_outdoor';
  } else if (q.includes('garden')) {
    activity = 'gardening';
  }

  const agentsNeeded: AgentName[] = ['Pollution Intelligence Agent'];

  if (
    q.includes('jog') ||
    q.includes('run') ||
    q.includes('exercis') ||
    q.includes('when') ||
    q.includes('window') ||
    q.includes('tomorrow') ||
    q.includes('outside') ||
    q.includes('travel') ||
    q.includes('walk') ||
    q.includes('cycl')
  ) {
    agentsNeeded.push('Smart Routine Agent');
  }

  if (
    q.includes('family') ||
    q.includes('child') ||
    q.includes('elder') ||
    q.includes('parent') ||
    q.includes('asthma') ||
    q.includes('protect') ||
    q.includes('sensitive') ||
    q.includes('home') ||
    q.includes('indoor')
  ) {
    agentsNeeded.push('Family Protection Agent');
  }

  if (
    q.includes('sustain') ||
    q.includes('reduce') ||
    q.includes('emission') ||
    q.includes('transit') ||
    q.includes('bus') ||
    q.includes('metro') ||
    q.includes('contribut') ||
    q.includes('waste')
  ) {
    agentsNeeded.push('Sustainability Agent');
  }

  // Always include Family Protection if user hasn't hit any specialist other than Pollution Intelligence
  if (agentsNeeded.length === 1) {
    agentsNeeded.push('Family Protection Agent', 'Smart Routine Agent');
  }

  agentsNeeded.push('Verification Agent');

  const intent = agentsNeeded.includes('Smart Routine Agent')
    ? 'activity_timing_and_exposure'
    : agentsNeeded.includes('Sustainability Agent')
      ? 'sustainability_and_emissions'
      : 'air_quality_diagnosis';

  return { intent, activity, targetOffsetDays, agentsNeeded };
}

function buildDeterministicFallbackExplanation(params: {
  query: string;
  dataset: EnvironmentalDataset | null;
  agentResults: AgentResult[];
  aiError?: string;
}): SynthesizedExplanation {
  const { dataset, agentResults, aiError } = params;
  const pollution = agentResults.find((a) => a.agent_name === 'Pollution Intelligence Agent');
  const routine = agentResults.find((a) => a.agent_name === 'Smart Routine Agent');
  const family = agentResults.find((a) => a.agent_name === 'Family Protection Agent');
  const sustain = agentResults.find((a) => a.agent_name === 'Sustainability Agent');

  if (!dataset) {
    return {
      directAnswer: 'Live environmental data is currently unavailable, so I cannot provide verified air-quality guidance for this location.',
      explanation: 'Open-Meteo air quality or weather data could not be retrieved. VAYU AI refuses to fabricate AQI readings or forecasts.',
      recommendedActions: ['Retry fetching environmental data for your selected city before deciding on outdoor exertion.'],
      aiSynthesized: false,
      aiError,
    };
  }

  const directParts = [pollution?.observations[0], routine?.recommendation ?? family?.recommendation].filter(Boolean);
  const explanationParts = agentResults.flatMap((a) => a.observations.slice(0, 2));
  const actions = [routine?.recommendation, family?.recommendation, sustain?.recommendation].filter(
    (v): v is string => Boolean(v),
  );

  return {
    directAnswer: directParts.join(' '),
    explanation: explanationParts.join(' '),
    recommendedActions: actions.length > 0 ? actions : ['Monitor local forecast updates before prolonged outdoor activity.'],
    aiSynthesized: false,
    aiError,
  };
}

export async function runVayuOrchestrator(params: {
  query: string;
  dataset: EnvironmentalDataset | null;
  profiles: HouseholdProfile[];
  preferredScale: AqiScale;
  synthesizer?: AiSynthesizerFn;
}): Promise<OrchestratorResponse> {
  const { query, dataset, profiles, preferredScale, synthesizer } = params;
  const requestId = `vayu-${Date.now().toString(36)}`;
  const { intent, activity, targetOffsetDays, agentsNeeded } = classifyUserIntent(query);

  const specialistResults: AgentResult[] = [];

  if (agentsNeeded.includes('Pollution Intelligence Agent')) {
    specialistResults.push(runPollutionIntelligenceAgent(dataset, preferredScale));
  }

  if (agentsNeeded.includes('Family Protection Agent')) {
    specialistResults.push(runFamilyProtectionAgent(dataset, profiles, preferredScale));
  }

  if (agentsNeeded.includes('Smart Routine Agent')) {
    let targetDate = dataset?.currentTimestamp.slice(0, 10);
    if (targetDate && targetOffsetDays > 0) {
      const base = new Date(`${targetDate}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() + targetOffsetDays);
      targetDate = base.toISOString().slice(0, 10);
    }
    const routineOut = runSmartRoutineAgent(dataset, activity, targetDate, preferredScale);
    specialistResults.push(routineOut.agentResult);
  }

  if (agentsNeeded.includes('Sustainability Agent')) {
    specialistResults.push(runSustainabilityAgent(dataset, preferredScale));
  }

  // Call Gemini synthesizer (single grounded LLM call) if provided & dataset is present
  let synthesis: SynthesizedExplanation;
  if (synthesizer && dataset) {
    try {
      synthesis = await synthesizer({
        query,
        intent,
        dataset,
        preferredScale,
        agentResults: specialistResults,
        profiles,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini synthesis failed';
      synthesis = buildDeterministicFallbackExplanation({
        query,
        dataset,
        agentResults: specialistResults,
        aiError: msg,
      });
    }
  } else {
    synthesis = buildDeterministicFallbackExplanation({
      query,
      dataset,
      agentResults: specialistResults,
    });
  }

  // Pass final output through Verification Agent
  const draftText = `${synthesis.directAnswer} ${synthesis.explanation} ${synthesis.recommendedActions.join(' ')}`;
  const { agentResult: verificationAgentResult, report: verificationReport } = runVerificationAgent({
    dataset,
    agentResults: specialistResults,
    preferredScale,
    draftAnswer: draftText,
  });

  const allAgentResults = [...specialistResults, verificationAgentResult];

  const limitations = Array.from(
    new Set([
      ...allAgentResults.flatMap((a) => a.limitations),
      ...verificationReport.warnings,
      ...verificationReport.rejectedClaims,
    ]),
  );

  const environmentalEvidence = Array.from(
    new Set(specialistResults.flatMap((a) => a.evidence).slice(0, 8)),
  );

  return {
    requestId,
    intent,
    query,
    directAnswer: synthesis.directAnswer,
    environmentalEvidence,
    explanation: synthesis.explanation,
    recommendedActions: synthesis.recommendedActions,
    limitationsAndUncertainty: limitations,
    dataSource: dataset
      ? `${dataset.modelSource} & ${dataset.weatherSource} (Modelled Grid Forecast)`
      : 'Unavailable',
    dataTimestamp: dataset?.currentTimestamp ?? 'Unavailable',
    aqiScaleUsed: preferredScale === 'european_aqi' ? 'European Air Quality Index (EU EAQI)' : 'US EPA Air Quality Index (US AQI)',
    agentsInvolved: allAgentResults.map((a) => a.agent_name),
    agentResults: allAgentResults,
    verification: verificationReport,
    aiSynthesized: synthesis.aiSynthesized,
    aiError: synthesis.aiError,
  };
}
