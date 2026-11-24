import { interpretAqiCategory } from '../utils/aqi.ts';
import type {
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  HouseholdProfile,
} from '../types/airQuality.ts';

export function runFamilyProtectionAgent(
  dataset: EnvironmentalDataset | null,
  profiles: HouseholdProfile[],
  preferredScale: AqiScale = 'us_aqi',
): AgentResult {
  if (!dataset) {
    return {
      agent_name: 'Family Protection Agent',
      status: 'failed',
      observations: ['Cannot generate household exposure guidance without validated environmental readings.'],
      recommendation: 'Wait for air quality data to load before planning sensitive family members’ outdoor schedules.',
      evidence: [],
      data_timestamp: 'Unavailable',
      confidence: 'low',
      limitations: ['Missing environmental dataset. Guidance excludes medical diagnosis or treatment.'],
    };
  }

  const primaryAqi = preferredScale === 'european_aqi' ? dataset.current.european_aqi : dataset.current.us_aqi;
  const cat = interpretAqiCategory(primaryAqi, preferredScale);
  const hasChildren = profiles.some((p) => p.group === 'child');
  const hasOlderAdults = profiles.some((p) => p.group === 'older_adult');
  const sensitiveMembers = profiles.filter((p) => p.hasRespiratorySensitivity);
  const hasSensitiveGroup = hasChildren || hasOlderAdults || sensitiveMembers.length > 0;

  const observations: string[] = [];
  if (profiles.length === 0) {
    observations.push('No specific household profiles registered; applying general public protection thresholds.');
  } else {
    observations.push(
      `Evaluating exposure for ${profiles.length} household profile(s): ${profiles
        .map((p) => `${p.label} (${p.group.replace('_', ' ')}${p.hasRespiratorySensitivity ? ', respiratory sensitivity' : ''})`)
        .join('; ')}.`,
    );
  }

  const actions: string[] = [];
  if (cat.level === 'good') {
    observations.push(`Modelled ${cat.label} (${cat.value}) indicates low ambient particle and gas stress.`);
    actions.push('Normal outdoor play and errands are appropriate.');
    if (sensitiveMembers.length > 0) {
      actions.push('Even in Good modelled conditions, keep personal reliever plans accessible if someone has known sensitivity to local dust or traffic.');
    }
  } else if (cat.level === 'moderate') {
    observations.push(
      `Modelled ${cat.label} (${cat.value}) is Moderate; ${hasSensitiveGroup ? 'sensitive household members merit extra pacing.' : 'most adults tolerate routine outdoor activity well.'}`,
    );
    if (hasChildren || sensitiveMembers.length > 0) {
      actions.push('Schedule active play or walks away from busy arterial roads and during cooler, lower-AQI forecast hours.');
      actions.push('Monitor for mild airway irritation when outdoor exertion exceeds 45–60 minutes.');
    } else {
      actions.push('Routine outdoor tasks are acceptable; avoid prolonged idling near traffic.');
    }
  } else if (cat.level === 'sensitive') {
    observations.push(
      `Modelled ${cat.label} (${cat.value}) reaches the Sensitive Groups threshold; ${hasSensitiveGroup ? 'registered vulnerable household members should reduce outdoor intensity.' : 'sensitive individuals may experience discomfort.'}`,
    );
    actions.push('Shorten vigorous outdoor play for children and keep older adults in shaded, low-traffic spaces.');
    actions.push('Keep windows facing major roads closed during peak hours and run HEPA air filtration if available.');
    if (sensitiveMembers.length > 0) {
      actions.push('Consider well-fitted particulate respirators (e.g., N95/KN95 for adults where tolerated) for unavoidable high-traffic commutes.');
    }
  } else if (cat.level === 'unhealthy' || cat.level === 'very_unhealthy' || cat.level === 'hazardous') {
    observations.push(`Modelled ${cat.label} (${cat.value}) indicates elevated exposure risk across all household groups.`);
    actions.push('Shift children’s play, older adults’ walks, and exercise indoors.');
    actions.push('Seal exterior drafts, run indoor air purifiers on medium/high, and use kitchen exhaust ventilation when cooking.');
    actions.push('Limit outdoor trips to essential errands away from rush-hour corridors.');
  } else {
    observations.push('Current AQI is unavailable; err on the side of caution for vulnerable household members.');
    actions.push('Check local visibility and retry data fetch before extended outdoor exposure.');
  }

  const evidence: string[] = [
    `Current ${cat.label}: ${cat.value ?? 'N/A'}`,
    `PM2.5: ${dataset.current.pm2_5 !== null ? `${dataset.current.pm2_5.toFixed(1)} µg/m³` : 'unavailable'}`,
    `O₃: ${dataset.current.ozone !== null ? `${dataset.current.ozone.toFixed(1)} µg/m³` : 'unavailable'}`,
  ];

  return {
    agent_name: 'Family Protection Agent',
    status: cat.level === 'unknown' ? 'partial' : 'completed',
    observations,
    recommendation: actions.join(' '),
    evidence,
    data_timestamp: dataset.currentTimestamp,
    confidence: cat.level === 'unknown' ? 'low' : dataset.isStale ? 'low' : 'high',
    limitations: [
      'Environmental precautions only — VAYU AI does not provide medical diagnosis, clinical assessment, or treatment advice. Consult a qualified clinician for respiratory symptoms.',
      'Household profiles remain private in local browser storage and are never persisted on external servers.',
    ],
  };
}
