import { runFamilyProtectionAgent } from '../agents/familyProtectionAgent.ts';
import { runPollutionIntelligenceAgent } from '../agents/pollutionIntelligenceAgent.ts';
import { runSmartRoutineAgent } from '../agents/smartRoutineAgent.ts';
import { runSustainabilityAgent } from '../agents/sustainabilityAgent.ts';
import {
  verifyAndEnforceSynthesis,
  type SynthesisDraft,
} from '../agents/verificationAgent.ts';
import type {
  ActivityType,
  AgentName,
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  HouseholdProfile,
  OrchestratorResponse,
  RoutineWindow,
} from '../types/airQuality.ts';
import { validateHouseholdProfiles } from '../utils/validators.ts';

export type SynthesizedExplanation = SynthesisDraft;

export type AiSynthesizerFn = (context: {
  query: string;
  intent: string;
  dataset: EnvironmentalDataset | null;
  preferredScale: AqiScale;
  agentResults: AgentResult[];
  profiles: HouseholdProfile[];
  routineWindows?: RoutineWindow[];
}) => Promise<SynthesizedExplanation>;

const DIAGNOSTIC_RE =
  /\b(why|what(?:'s| is)\s+(?:the\s+)?(?:aqi|air\s*quality|pollution)|which\s+pollutant\w*|pm2\.?5|pm10|ozone|o3|no2|so2|smog|haze|trend|increas\w*|spike\w*|forecast)\b/;
const DAY_AFTER_TOMORROW_RE = /\b(day\s+after\s+tomorrow|in\s+2\s+days|two\s+days\s+from\s+now)\b/;
const TOMORROW_RE = /\b(tomorrow|tmrw)\b/;

const INDOOR_VENT_RE =
  /\b(window|windows|ventilat\w*|cross-ventilat\w*|indoor\s*air|purifier|hepa|air\s*filter|open\s+(?:the\s+)?house)\b/;
const CYCLING_RE = /\b(cycl\w*|bike|biking|bicycle|e-bike)\b/;
const WALKING_RE = /\b(walk\w*|stroll\w*|hike|hiking)\b/;
const COMMUTING_RE = /\b(commut\w*|office|workplace|metro|bus|rail|train|driving|traffic)\b/;
const KIDS_OUTDOOR_RE = /\b(kid|kids|child|children|toddler|baby|infant|school|playground|recess)\b/;
const GARDENING_RE = /\b(garden\w*|yard|lawn|balcony)\b/;
const EXERCISE_RE =
  /\b(jog\w*|running|run\s+outdoors?|exercis\w*|workout|sprint\w*|marathon|training|sport\w*)\b/;

const ROUTINE_TRIGGER_RE =
  /\b(when|best\s+time|time\s+slot|schedule|plan|window|windows|ventilat\w*|tomorrow|tonight|this\s+(?:morning|afternoon|evening)|outside|outdoors?|jog\w*|running|run\s+outdoors?|exercis\w*|workout|walk\w*|stroll\w*|hike|hiking|cycl\w*|bike|biking|bicycle|commut\w*|travel\w*|garden\w*|playground)\b/;
const FAMILY_TRIGGER_RE =
  /\b(family|household|kid|kids|child|children|toddler|baby|infant|elder\w*|senior\w*|older\s+adult\w*|parent\w*|grandparent\w*|pregnant|pregnancy|asthma\w*|copd|allerg\w*|breath\w*|lung\w*|respirat\w*|sensitiv\w*|vulnerab\w*|protect\w*|mask\w*|n95|kn95|purifier|hepa|indoor\s+air|at\s+home)\b/;
const SUSTAINABILITY_TRIGGER_RE =
  /\b(sustain\w*|emission\w*|carbon|co2e?|foot\s*print|reduce\b.*\b(?:pollution|contribut\w*|impact|car)|public\s+transit|metro|bus|rail|carpool\w*|electric\s+vehicle|\bev\b|waste|burn\w*|eco-?friendly|green\s+commut\w*)\b/;

export function classifyUserIntent(query: string): {
  intent: string;
  activity: ActivityType;
  targetOffsetDays: number;
  agentsNeeded: AgentName[];
} {
  const q = query.toLowerCase().trim();

  const targetOffsetDays = DAY_AFTER_TOMORROW_RE.test(q) ? 2 : TOMORROW_RE.test(q) ? 1 : 0;

  let activity: ActivityType = 'outdoor_exercise';
  if (INDOOR_VENT_RE.test(q)) {
    activity = 'indoor_ventilation';
  } else if (CYCLING_RE.test(q)) {
    activity = 'cycling';
  } else if (KIDS_OUTDOOR_RE.test(q) && /\b(play|outside|outdoor|school|playground|recess|park)\b/.test(q)) {
    activity = 'children_outdoor';
  } else if (WALKING_RE.test(q)) {
    activity = 'walking';
  } else if (COMMUTING_RE.test(q)) {
    activity = 'commuting';
  } else if (GARDENING_RE.test(q)) {
    activity = 'gardening';
  } else if (EXERCISE_RE.test(q)) {
    activity = 'outdoor_exercise';
  }

  const agentsNeeded: AgentName[] = ['Pollution Intelligence Agent'];

  if (ROUTINE_TRIGGER_RE.test(q)) {
    agentsNeeded.push('Smart Routine Agent');
  }
  if (FAMILY_TRIGGER_RE.test(q)) {
    agentsNeeded.push('Family Protection Agent');
  }
  if (SUSTAINABILITY_TRIGGER_RE.test(q)) {
    agentsNeeded.push('Sustainability Agent');
  }

  // Only invoke broad advisory defaults when the prompt does not clearly map to pollutant diagnostics
  if (agentsNeeded.length === 1 && !DIAGNOSTIC_RE.test(q)) {
    agentsNeeded.push('Family Protection Agent', 'Smart Routine Agent');
  }

  agentsNeeded.push('Verification Agent');

  const specialistCount = agentsNeeded.length - 2; // excluding Pollution Intelligence + Verification
  let intent = 'air_quality_diagnosis';
  if (specialistCount >= 2) {
    intent = 'multi_domain_advisory';
  } else if (agentsNeeded.includes('Smart Routine Agent')) {
    intent = 'activity_timing_and_exposure';
  } else if (agentsNeeded.includes('Family Protection Agent')) {
    intent = 'family_and_indoor_protection';
  } else if (agentsNeeded.includes('Sustainability Agent')) {
    intent = 'sustainability_and_emissions';
  }

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
      directAnswer:
        'Live environmental data is currently unavailable, so I cannot provide verified air-quality guidance for this location.',
      explanation:
        'Open-Meteo air quality or weather data could not be retrieved. VAYU AI refuses to fabricate AQI readings or forecasts.',
      recommendedActions: [
        'Retry fetching environmental data for your selected city before deciding on outdoor exertion.',
      ],
      aiSynthesized: false,
      aiError,
    };
  }

  const primaryObservation = pollution?.observations[0];
  const primaryGuidance = routine?.recommendation ?? family?.recommendation ?? pollution?.recommendation;
  const directParts = [primaryObservation, primaryGuidance].filter(Boolean);
  const explanationParts = agentResults.flatMap((a) => a.observations.slice(0, 2));
  const actions = [
    routine?.recommendation,
    family?.recommendation,
    sustain?.recommendation,
    pollution?.recommendation,
  ].filter((v): v is string => Boolean(v));

  return {
    directAnswer: directParts.join(' '),
    explanation: explanationParts.join(' '),
    recommendedActions:
      actions.length > 0
        ? Array.from(new Set(actions)).slice(0, 4)
        : ['Monitor local forecast updates before prolonged outdoor activity.'],
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
  const { query, dataset, preferredScale, synthesizer } = params;
  const profileCheck = validateHouseholdProfiles(params.profiles);
  const profiles = profileCheck.valid ? profileCheck.profiles : [];
  const requestId = `vayu-${Date.now().toString(36)}`;
  const { intent, activity, targetOffsetDays, agentsNeeded } = classifyUserIntent(query);

  const specialistResults: AgentResult[] = [];
  let routineWindows: RoutineWindow[] = [];

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
    routineWindows = routineOut.windows;
    specialistResults.push(routineOut.agentResult);
  }

  if (agentsNeeded.includes('Sustainability Agent')) {
    specialistResults.push(runSustainabilityAgent(dataset, preferredScale));
  }

  const deterministicFallback = buildDeterministicFallbackExplanation({
    query,
    dataset,
    agentResults: specialistResults,
  });

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
        routineWindows,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini synthesis failed';
      synthesis = {
        ...deterministicFallback,
        aiError: msg,
      };
    }
  } else {
    synthesis = deterministicFallback;
  }

  // Verification Agent actively validates & corrects/rejects unsafe or ungrounded synthesis
  const { enforcedSynthesis, verificationAgentResult, report: verificationReport } =
    verifyAndEnforceSynthesis({
      dataset,
      agentResults: specialistResults,
      preferredScale,
      synthesis,
      fallback: {
        ...deterministicFallback,
        aiSynthesized: synthesis.aiSynthesized,
        aiError: synthesis.aiError,
      },
      routineWindows,
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
    directAnswer: enforcedSynthesis.directAnswer,
    environmentalEvidence,
    explanation: enforcedSynthesis.explanation,
    recommendedActions: enforcedSynthesis.recommendedActions,
    limitationsAndUncertainty: limitations,
    dataSource: dataset
      ? `${dataset.modelSource} & ${dataset.weatherSource} (Modelled Grid Forecast)`
      : 'Unavailable',
    dataTimestamp: dataset?.currentTimestamp ?? 'Unavailable',
    aqiScaleUsed:
      preferredScale === 'european_aqi'
        ? 'European Air Quality Index (EU EAQI)'
        : 'US EPA Air Quality Index (US AQI)',
    agentsInvolved: allAgentResults.map((a) => a.agent_name),
    agentResults: allAgentResults,
    verification: verificationReport,
    aiSynthesized: enforcedSynthesis.aiSynthesized,
    aiError: enforcedSynthesis.aiError,
  };
}
