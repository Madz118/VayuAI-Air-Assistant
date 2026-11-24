import { interpretAqiCategory } from '../utils/aqi.ts';
import { checkTimestampFreshness } from '../utils/validators.ts';
import type {
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  RoutineWindow,
  VerificationReport,
} from '../types/airQuality.ts';

export interface SynthesisDraft {
  directAnswer: string;
  explanation: string;
  recommendedActions: string[];
  aiSynthesized: boolean;
  aiError?: string;
}

const ABSOLUTE_SAFETY_RE = /\b(100%\s*safe|completely\s*safe|totally\s*safe|guaranteed\s*safe|zero\s*risk|no\s*risk\s*at\s*all)\b/gi;
const MEDICAL_CLAIM_RE = /\b(diagnos\w*|prescrib\w*|cure[sd]?|take\s+\d+\s*mg|start\s+medication)\b/i;
const FAVORABLE_OUTDOOR_RE =
  /\b(great time to (?:jog|run|exercise|play)|ideal for (?:jogging|running|outdoor exercise)|favorable for outdoor|safe to exercise outdoors|good air quality today)\b/i;
const FORMAL_WHO_EXCEEDANCE_RE =
  /\b(exceeds?\s+the\s+who\s+(?:24-?hour|8-?hour)\s+(?:guideline|limit|standard)|violates?\s+who)\b/gi;

function collectGroundedMetrics(
  dataset: EnvironmentalDataset,
  routineWindows: RoutineWindow[] = [],
): { aqiValues: Set<number>; pm25Values: Set<number> } {
  const aqiValues = new Set<number>();
  const pm25Values = new Set<number>();

  const addNum = (set: Set<number>, val: number | null | undefined) => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      set.add(Math.round(val));
      set.add(Math.round(val * 10) / 10);
    }
  };

  addNum(aqiValues, dataset.current.us_aqi);
  addNum(aqiValues, dataset.current.european_aqi);
  addNum(pm25Values, dataset.current.pm2_5);

  for (const h of dataset.hourly) {
    addNum(aqiValues, h.us_aqi);
    addNum(aqiValues, h.european_aqi);
    addNum(pm25Values, h.pm2_5);
  }
  for (const w of routineWindows) {
    addNum(aqiValues, w.avgUsAqi);
    addNum(aqiValues, w.avgEuAqi);
    addNum(pm25Values, w.avgPm25);
  }

  return { aqiValues, pm25Values };
}

function hasNearMatch(set: Set<number>, candidate: number, tolerance: number): boolean {
  for (const v of set) {
    if (Math.abs(v - candidate) <= tolerance) return true;
  }
  return false;
}

function detectUngroundedReadings(
  text: string,
  dataset: EnvironmentalDataset,
  routineWindows: RoutineWindow[] = [],
): string[] {
  const { aqiValues, pm25Values } = collectGroundedMetrics(dataset, routineWindows);
  const issues: string[] = [];

  const aqiRegex = /\b(?:us\s*aqi|eu\s*eaqi|eaqi|aqi)\s*(?:is|of|at|around|about|averages?|~|:)\s*(\d{1,3}(?:\.\d+)?)\b/gi;
  for (const match of text.matchAll(aqiRegex)) {
    const val = Number(match[1]);
    if (Number.isFinite(val) && aqiValues.size > 0 && !hasNearMatch(aqiValues, val, 3)) {
      issues.push(`Rejected ungrounded AQI figure (${val}) not present in retrieved Open-Meteo dataset.`);
    }
  }

  const pmRegex = /\bpm2\.?5\s*(?:is|of|at|around|about|averages?|~|:)\s*(\d{1,4}(?:\.\d+)?)\s*(?:µg\/m³|ug\/m3)?\b/gi;
  for (const match of text.matchAll(pmRegex)) {
    const val = Number(match[1]);
    if (Number.isFinite(val) && pm25Values.size > 0 && !hasNearMatch(pm25Values, val, 2.5)) {
      issues.push(`Rejected ungrounded PM2.5 reading (${val} µg/m³) not matched in retrieved Open-Meteo dataset.`);
    }
  }

  return Array.from(new Set(issues));
}

function validateWindowsIndividually(
  windows: RoutineWindow[],
  preferredScale: AqiScale,
  degradedConfidence: boolean,
): { passed: boolean; detail: string; issues: string[] } {
  if (windows.length === 0) {
    return {
      passed: true,
      detail: 'No routine windows in scope for this query.',
      issues: [],
    };
  }

  const scaleLabel = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
  const issues: string[] = [];

  for (const w of windows) {
    const slot = `${w.startTime.slice(11, 16)}–${w.endTime.slice(11, 16)}`;
    const activeVal = preferredScale === 'european_aqi' ? w.avgEuAqi : w.avgUsAqi;

    if (activeVal === null || !Number.isFinite(activeVal)) {
      if (w.suitability !== 'insufficient_data') {
        issues.push(`Window ${slot} lacks ${scaleLabel} data but was not marked insufficient_data.`);
      }
      continue;
    }

    const cat = interpretAqiCategory(activeVal, preferredScale);
    const highRiskLevel =
      cat.level === 'sensitive' ||
      cat.level === 'unhealthy' ||
      cat.level === 'very_unhealthy' ||
      cat.level === 'hazardous';

    if (highRiskLevel && w.suitability === 'favorable') {
      issues.push(
        `Window ${slot} has elevated ${scaleLabel} (${activeVal} — ${cat.shortLabel}) and cannot be marked favorable.`,
      );
    }

    if (degradedConfidence && w.suitability === 'favorable') {
      issues.push(
        `Window ${slot} was marked favorable despite stale or incomplete underlying environmental data.`,
      );
    }
  }

  return {
    passed: issues.length === 0,
    detail:
      issues.length === 0
        ? `Validated ${windows.length} forecast window(s) individually under ${scaleLabel}.`
        : issues.join(' '),
    issues,
  };
}

export function runVerificationAgent(params: {
  dataset: EnvironmentalDataset | null;
  agentResults: AgentResult[];
  preferredScale: AqiScale;
  draftAnswer?: string;
  routineWindows?: RoutineWindow[];
}): { agentResult: AgentResult; report: VerificationReport } {
  const { dataset, agentResults, preferredScale, draftAnswer, routineWindows = [] } = params;
  const checks: VerificationReport['checks'] = [];
  const warnings: string[] = [];
  const rejectedClaims: string[] = [];

  if (!dataset) {
    checks.push({
      check: 'Source & Timestamp Presence',
      passed: false,
      detail: 'No verified environmental dataset present.',
    });
    warnings.push('Live Open-Meteo data is missing; quantitative claims cannot be verified.');
    if (draftAnswer && /\b(?:aqi|pm2\.?5)\s*(?:is|of|around)\s*\d+/i.test(draftAnswer)) {
      rejectedClaims.push('Rejected numeric AQI/PM2.5 claims because live environmental dataset is unavailable.');
    }
  } else {
    const freshness = checkTimestampFreshness(dataset.currentTimestamp);
    const freshnessPassed = freshness.validTimestamp && !freshness.isStale;
    checks.push({
      check: 'Timestamp Freshness',
      passed: freshnessPassed,
      detail: freshness.validTimestamp
        ? `Timestamp ${dataset.currentTimestamp} (${freshness.label}, age ${freshness.ageMinutes}m).`
        : 'Timestamp is missing or malformed.',
    });
    if (!freshnessPassed) {
      warnings.push(
        freshness.validTimestamp
          ? `Data is ${freshness.ageMinutes} minutes old and should not be represented as real-time current conditions.`
          : 'Data timestamp could not be validated.',
      );
    }

    const completeOk = dataset.completenessRatio >= 0.75;
    checks.push({
      check: 'Data Completeness',
      passed: completeOk,
      detail: `${Math.round(dataset.completenessRatio * 100)}% core pollutant fields available.${dataset.missingFields.length ? ` Missing: ${dataset.missingFields.join(', ')}.` : ''}`,
    });
    if (!completeOk) {
      warnings.push(`Incomplete pollutant profile (${dataset.missingFields.join(', ')} unavailable).`);
    }

    const val = preferredScale === 'european_aqi' ? dataset.current.european_aqi : dataset.current.us_aqi;
    const cat = interpretAqiCategory(val, preferredScale);
    const scaleLabel = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
    const degradedConfidence =
      cat.level === 'unknown' || dataset.isStale || dataset.completenessRatio < 0.6;

    const cpcbMislabelled =
      Boolean(draftAnswer) &&
      /\bCPCB\b/i.test(draftAnswer ?? '') &&
      !/not\s+(?:an?\s+)?official\s+(?:indian\s+)?CPCB/i.test(draftAnswer ?? '') &&
      !/cannot\s+be\s+equated\s+to\s+CPCB/i.test(draftAnswer ?? '') &&
      !/differs?\s+from\s+(?:india['’]s\s+)?(?:official\s+)?CPCB/i.test(draftAnswer ?? '');

    const wrongScaleLabel =
      Boolean(draftAnswer) &&
      preferredScale === 'european_aqi' &&
      /\bUS\s*AQI\b/i.test(draftAnswer ?? '') &&
      !/\b(?:EU\s*EAQI|European\s*(?:Air\s*Quality\s*Index|EAQI))\b/i.test(draftAnswer ?? '');

    checks.push({
      check: 'AQI Scale Consistency',
      passed: !cpcbMislabelled && !wrongScaleLabel,
      detail: cpcbMislabelled
        ? `Detected potential CPCB mislabelling while active dataset uses ${scaleLabel}.`
        : wrongScaleLabel
          ? 'Draft answer cited US AQI when EU EAQI was selected.'
          : `Verified scale ${scaleLabel} (${cat.value ?? 'N/A'} — ${cat.shortLabel}).`,
    });
    if (cpcbMislabelled) {
      rejectedClaims.push('Rejected implicit equating of Open-Meteo US/EU AQI with official Indian CPCB AQI.');
    }
    if (wrongScaleLabel) {
      rejectedClaims.push('Rejected scale mismatch: answer cited US AQI while EU EAQI is active.');
    }

    // 4. Individual forecast window validation
    const windowCheck = validateWindowsIndividually(routineWindows, preferredScale, degradedConfidence);
    checks.push({
      check: 'Forecast Window Validation',
      passed: windowCheck.passed,
      detail: windowCheck.detail,
    });
    if (!windowCheck.passed) {
      for (const issue of windowCheck.issues) {
        rejectedClaims.push(issue);
      }
    }

    // 5. Numeric grounding check on draftAnswer
    const ungroundedIssues = draftAnswer ? detectUngroundedReadings(draftAnswer, dataset, routineWindows) : [];
    checks.push({
      check: 'Dataset Grounding Audit',
      passed: ungroundedIssues.length === 0,
      detail:
        ungroundedIssues.length === 0
          ? 'Cited pollutant and AQI figures align with the retrieved Open-Meteo dataset.'
          : ungroundedIssues.join(' '),
    });
    for (const issue of ungroundedIssues) {
      rejectedClaims.push(issue);
    }

    // 6. Safety guarantee & cross-agent contradiction check
    const routineAgent = agentResults.find((a) => a.agent_name === 'Smart Routine Agent');
    const familyAgent = agentResults.find((a) => a.agent_name === 'Family Protection Agent');
    const hasAbsoluteSafetyGuarantee = Boolean(draftAnswer && ABSOLUTE_SAFETY_RE.test(draftAnswer));
    ABSOLUTE_SAFETY_RE.lastIndex = 0;
    if (hasAbsoluteSafetyGuarantee) {
      rejectedClaims.push(
        'Rejected absolute safety guarantee ("completely safe" / "zero risk") because modelled data cannot guarantee zero exposure.',
      );
    }

    const whoOverclaim = Boolean(draftAnswer && FORMAL_WHO_EXCEEDANCE_RE.test(draftAnswer));
    FORMAL_WHO_EXCEEDANCE_RE.lastIndex = 0;
    if (whoOverclaim) {
      rejectedClaims.push(
        'Clarified WHO comparison: single-hour modelled concentrations are screening ratios against 24h/8h references, not formal guideline exceedances.',
      );
    }

    const routinePositive = routineAgent?.recommendation.toLowerCase().includes('favorable') ?? false;
    const highPollutionCurrent =
      cat.level === 'unhealthy' || cat.level === 'very_unhealthy' || cat.level === 'hazardous';
    const allWindowsElevated =
      routineWindows.length > 0 &&
      routineWindows.every((w) => w.suitability === 'limit_exposure' || w.suitability === 'insufficient_data');
    const draftPositive = Boolean(draftAnswer && FAVORABLE_OUTDOOR_RE.test(draftAnswer));

    const contradictory =
      (highPollutionCurrent && routinePositive) ||
      ((highPollutionCurrent || allWindowsElevated || degradedConfidence) && draftPositive);

    checks.push({
      check: 'Cross-Agent Consistency & Safety Guard',
      passed: !contradictory && !hasAbsoluteSafetyGuarantee && !whoOverclaim,
      detail: contradictory
        ? 'Contradiction detected: outdoor recommendation sounded favorable despite elevated pollution or degraded data confidence.'
        : hasAbsoluteSafetyGuarantee
          ? 'Blocked unsupported absolute safety guarantee.'
          : whoOverclaim
            ? 'Corrected WHO averaging-period phrasing.'
            : `No contradictions across ${agentResults.length} specialist agent outputs.`,
    });

    if (contradictory) {
      const reason = degradedConfidence
        ? 'Rejected confident outdoor endorsement because environmental data is stale, incomplete, or unavailable.'
        : `Rejected favorable outdoor endorsement because ${cat.label} or forecast windows indicate elevated exposure.`;
      rejectedClaims.push(reason);
      warnings.push(reason);
    }

    // 7. Medical diagnosis guard
    const medicalClaim = Boolean(draftAnswer && MEDICAL_CLAIM_RE.test(draftAnswer));
    if (medicalClaim) {
      rejectedClaims.push('Rejected potential medical diagnosis or dosage language.');
    }
    checks.push({
      check: 'Non-Medical Boundary',
      passed:
        !medicalClaim &&
        (!familyAgent || familyAgent.limitations.some((l) => l.toLowerCase().includes('diagnosis'))),
      detail: medicalClaim ? 'Detected disallowed clinical claim.' : 'Verified guidance stays strictly environmental.',
    });
  }

  const allPassed = checks.every((c) => c.passed) && rejectedClaims.length === 0;
  const report: VerificationReport = {
    passed: allPassed,
    checks,
    warnings,
    rejectedClaims,
    correctionApplied: rejectedClaims.length > 0,
  };

  const agentResult: AgentResult = {
    agent_name: 'Verification Agent',
    status: dataset ? 'completed' : 'partial',
    observations: checks.map((c) => `${c.passed ? 'PASS' : 'FLAG'} — ${c.check}: ${c.detail}`),
    recommendation: allPassed
      ? 'All verification checks passed: timestamps, individual forecast windows, scale attribution, and cross-agent guidance are consistent.'
      : `Verification flagged ${warnings.length + rejectedClaims.length} item(s): ${[...warnings, ...rejectedClaims].join(' ')}`,
    evidence: checks.map((c) => `${c.check}: ${c.passed ? 'Verified' : 'Flagged'}`),
    data_timestamp: dataset?.currentTimestamp ?? 'Unavailable',
    confidence: dataset && allPassed ? 'high' : 'low',
    limitations: [
      'Deterministic verification validates internal consistency, forecast window alignment, dataset grounding, and freshness; it cannot independently verify physical station readings not present in Open-Meteo.',
    ],
  };

  return { agentResult, report };
}

/**
 * Actively enforces Verification Agent findings onto the final user-facing synthesis so
 * unsupported, ungrounded, scale-mismatched, or unsafe claims are corrected or replaced before delivery.
 */
export function verifyAndEnforceSynthesis(params: {
  dataset: EnvironmentalDataset | null;
  agentResults: AgentResult[];
  preferredScale: AqiScale;
  synthesis: SynthesisDraft;
  fallback: SynthesisDraft;
  routineWindows?: RoutineWindow[];
}): {
  enforcedSynthesis: SynthesisDraft;
  verificationAgentResult: AgentResult;
  report: VerificationReport;
} {
  const { dataset, agentResults, preferredScale, synthesis, fallback, routineWindows = [] } = params;
  const draftText = `${synthesis.directAnswer} ${synthesis.explanation} ${synthesis.recommendedActions.join(' ')}`;

  const { agentResult, report } = runVerificationAgent({
    dataset,
    agentResults,
    preferredScale,
    draftAnswer: draftText,
    routineWindows,
  });

  if (report.rejectedClaims.length === 0 && report.passed) {
    return {
      enforcedSynthesis: synthesis,
      verificationAgentResult: agentResult,
      report,
    };
  }

  let directAnswer = synthesis.directAnswer;
  let explanation = synthesis.explanation;
  let recommendedActions = [...synthesis.recommendedActions];

  const sanitizeString = (txt: string): string =>
    txt
      .replace(ABSOLUTE_SAFETY_RE, 'lower relative exposure (not risk-free)')
      .replace(/\bCPCB\b/gi, 'modelled grid AQI (distinct from official CPCB)')
      .replace(
        FORMAL_WHO_EXCEEDANCE_RE,
        'is above the WHO 24-hour/8-hour screening reference on a single-hour modelled basis',
      );

  directAnswer = sanitizeString(directAnswer);
  explanation = sanitizeString(explanation);
  recommendedActions = recommendedActions
    .filter((act) => !MEDICAL_CLAIM_RE.test(act))
    .map((act) => sanitizeString(act));

  // Hard override when severe grounding, scale, medical, or safety contradictions occur
  const requiresHardOverride =
    !dataset ||
    report.rejectedClaims.some(
      (c) =>
        c.includes('ungrounded') ||
        c.includes('scale mismatch') ||
        c.includes('favorable outdoor endorsement') ||
        c.includes('stale, incomplete, or unavailable') ||
        c.includes('medical diagnosis'),
    );

  if (requiresHardOverride) {
    directAnswer = fallback.directAnswer;
    explanation = `${fallback.explanation} (Verification Agent replaced or constrained parts of the initial draft to remain strictly grounded in verified Open-Meteo data.)`;
    recommendedActions = fallback.recommendedActions;
  } else if (recommendedActions.length === 0) {
    recommendedActions = fallback.recommendedActions;
  }

  return {
    enforcedSynthesis: {
      ...synthesis,
      directAnswer,
      explanation,
      recommendedActions,
    },
    verificationAgentResult: agentResult,
    report: {
      ...report,
      correctionApplied: true,
    },
  };
}
