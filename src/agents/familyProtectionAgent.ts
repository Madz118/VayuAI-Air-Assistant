import { interpretAqiCategory } from '../utils/aqi.ts';
import type { HypotheticalScenario } from '../utils/hypotheticalScenario.ts';
import type {
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  HouseholdProfile,
} from '../types/airQuality.ts';

function sanitizeDisplayLabel(label: string): string {
  return label.replace(/[<>{}`\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Household member';
}

export function runFamilyProtectionAgent(
  dataset: EnvironmentalDataset | null,
  profiles: HouseholdProfile[],
  preferredScale: AqiScale = 'us_aqi',
  hypotheticalScenario: HypotheticalScenario | null = null,
): AgentResult {
  if (!dataset && !hypotheticalScenario) {
    return {
      agent_name: 'Family Protection Agent',
      status: 'failed',
      observations: ['Cannot generate household exposure guidance without validated environmental readings.'],
      recommendation: 'Wait for air quality data to load before planning sensitive family members’ outdoor schedules.',
      evidence: [],
      data_timestamp: 'Unavailable',
      confidence: 'low',
      limitations: [
        'Missing environmental dataset. Guidance excludes medical diagnosis or treatment.',
        'Household profiles remain in local browser storage; when using Ask VAYU AI, only anonymized age/exposure groups and sensitivity flags (never names or personal notes) are transmitted to Gemini.',
      ],
    };
  }

  const cat = hypotheticalScenario
    ? hypotheticalScenario.category
    : interpretAqiCategory(
        preferredScale === 'european_aqi' ? dataset!.current.european_aqi : dataset!.current.us_aqi,
        preferredScale,
      );

  const hasChildren = profiles.some((p) => p.group === 'child');
  const hasOlderAdults = profiles.some((p) => p.group === 'older_adult');
  const sensitiveMembers = profiles.filter((p) => p.hasRespiratorySensitivity);
  const hasSensitiveGroup = hasChildren || hasOlderAdults || sensitiveMembers.length > 0;

  const degradedConfidence =
    !hypotheticalScenario &&
    Boolean(dataset) &&
    (cat.level === 'unknown' || dataset!.isStale || dataset!.completenessRatio < 0.6);

  const observations: string[] = [];
  if (profiles.length === 0) {
    observations.push('No specific household profiles registered; applying general, child, and older-adult protection thresholds.');
  } else {
    observations.push(
      `Evaluating exposure for ${profiles.length} household profile(s): ${profiles
        .map(
          (p) =>
            `${sanitizeDisplayLabel(p.label)} (${p.group.replace('_', ' ')}${p.hasRespiratorySensitivity ? ', respiratory sensitivity' : ''})`,
        )
        .join('; ')}.`,
    );
  }

  const contextPrefix = hypotheticalScenario ? 'HYPOTHETICAL SCENARIO: ' : 'Modelled ';
  const actions: string[] = [];

  if (cat.level === 'unknown') {
    observations.push('Current AQI is unavailable; err on the side of caution for vulnerable household members.');
    actions.push('Check local visibility and retry data fetch before extended outdoor exposure for children, older adults, or sensitive airways.');
  } else if (degradedConfidence && dataset) {
    observations.push(
      `Modelled ${cat.label} reads ${cat.value ?? 'N/A'} (${cat.shortLabel}), but the dataset is ${dataset.isStale ? 'stale' : 'incomplete'} (${Math.round(dataset.completenessRatio * 100)}% fields present).`,
    );
    actions.push(
      'Refresh environmental readings before approving prolonged outdoor activity for children, older adults, or anyone with respiratory sensitivity.',
    );
    if (cat.level !== 'good') {
      actions.push('Favor lower-traffic areas, keep windows facing busy roads closed if haze is visible, and keep personal reliever plans accessible.');
    }
  } else if (cat.level === 'good') {
    observations.push(`${contextPrefix}${cat.label} (${cat.value}) indicates low ambient particle and gas stress.`);
    actions.push('Normal outdoor play for children, walking for older adults, and routine outdoor errands are appropriate.');
    if (sensitiveMembers.length > 0) {
      actions.push('Even in Good conditions, keep personal reliever plans accessible if someone has known sensitivity to local dust or traffic.');
    }
  } else if (cat.level === 'moderate') {
    observations.push(
      `${contextPrefix}${cat.label} (${cat.value}) is Moderate; ${hasSensitiveGroup ? 'sensitive household members merit extra pacing.' : 'most adults tolerate routine outdoor activity well while unusually sensitive people should pace heavy exertion.'}`,
    );
    if (hasChildren || sensitiveMembers.length > 0 || profiles.length === 0) {
      actions.push('Schedule active play or walks for children and older adults away from busy arterial roads and during lower-AQI forecast hours.');
      actions.push('Monitor for mild airway irritation when outdoor exertion exceeds 45–60 minutes.');
    } else {
      actions.push('Routine outdoor tasks are acceptable; avoid prolonged idling near traffic.');
    }
  } else if (cat.level === 'sensitive') {
    observations.push(
      `${contextPrefix}${cat.label} (${cat.value}) reaches the Sensitive Groups threshold; children, older adults, and people with respiratory sensitivity should reduce outdoor intensity.`,
    );
    actions.push('Shorten vigorous outdoor play for children and keep older adults in shaded, low-traffic or indoor spaces.');
    actions.push('Keep windows facing major roads closed during peak hours and run HEPA air filtration if available.');
    if (sensitiveMembers.length > 0 || profiles.length === 0) {
      actions.push('Consider well-fitted particulate respirators (e.g., N95/KN95 for adults where tolerated) for unavoidable high-traffic commutes.');
    }
  } else if (cat.level === 'unhealthy') {
    observations.push(
      `${contextPrefix}${cat.label} (${cat.value}) is Unhealthy across all groups, with heightened impact on children, older adults, and sensitive airways.`,
    );
    actions.push('Move children’s active play, older adults’ walks, and strenuous exercise indoors.');
    actions.push('Keep exterior windows closed, run indoor HEPA air purifiers, and limit outdoor trips to brief essentials.');
  } else if (cat.level === 'very_unhealthy') {
    observations.push(
      `${contextPrefix}${cat.label} (${cat.value}) is Very Unhealthy (health alert level) for children, older adults, and the general population.`,
    );
    actions.push('Keep children and older adults indoors and suspend outdoor sports, playground play, and walks.');
    actions.push('Seal exterior window/door drafts, run HEPA air purifiers on medium/high, and use kitchen exhaust ventilation when cooking.');
    actions.push('Wear a well-fitted N95/KN95 respirator if an unavoidable essential outdoor trip is required, and contact a clinician promptly if breathing symptoms occur.');
  } else {
    // Hazardous (>300 US AQI or >100 EU EAQI)
    observations.push(
      `${contextPrefix}${cat.label} (${cat.value}) represents Hazardous emergency air-quality conditions requiring strict indoor protection for everyone, especially children and older adults.`,
    );
    actions.push('Keep children, older adults, and all household members indoors; cancel all non-essential outdoor exposure.');
    actions.push('Close and seal windows/vents, operate HEPA purifiers continuously on high, and avoid indoor smoke sources such as incense or candles.');
    actions.push('Use a well-fitted N95/KN95 mask only for critical, brief outdoor movement and seek prompt medical advice if respiratory distress develops.');
  }

  const evidence: string[] = hypotheticalScenario
    ? [
        `Scenario ${cat.label}: ${hypotheticalScenario.assumedAqi} (${cat.shortLabel})`,
        ...(dataset
          ? [
              `Actual Live Reference (${dataset.location.name}): ${
                hypotheticalScenario.scale === 'european_aqi'
                  ? `EU EAQI ${dataset.current.european_aqi ?? 'N/A'}`
                  : `US AQI ${dataset.current.us_aqi ?? 'N/A'}`
              } at ${dataset.currentTimestamp}`,
            ]
          : []),
      ]
    : [
        `Current ${cat.label}: ${cat.value ?? 'N/A'}`,
        `PM2.5: ${dataset!.current.pm2_5 !== null ? `${dataset!.current.pm2_5.toFixed(1)} µg/m³` : 'unavailable'}`,
        `O₃: ${dataset!.current.ozone !== null ? `${dataset!.current.ozone.toFixed(1)} µg/m³` : 'unavailable'}`,
      ];

  return {
    agent_name: 'Family Protection Agent',
    status: degradedConfidence ? 'partial' : 'completed',
    observations,
    recommendation: actions.join(' '),
    evidence,
    data_timestamp: dataset?.currentTimestamp ?? 'Hypothetical Scenario',
    confidence: degradedConfidence ? 'low' : 'high',
    limitations: [
      'Environmental precautions only — VAYU AI does not provide medical diagnosis, clinical assessment, or treatment advice. Consult a qualified clinician for respiratory symptoms.',
      'Full household names and optional notes stay in local browser storage and are never stored on remote servers; when asking VAYU AI, only anonymized age/exposure groups and respiratory sensitivity booleans are sent to Gemini.',
    ],
  };
}
