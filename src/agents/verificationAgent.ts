import { interpretAqiCategory } from '../utils/aqi.ts';
import { checkTimestampFreshness } from '../utils/validators.ts';
import type {
  AgentResult,
  AqiScale,
  EnvironmentalDataset,
  VerificationReport,
} from '../types/airQuality.ts';

export function runVerificationAgent(params: {
  dataset: EnvironmentalDataset | null;
  agentResults: AgentResult[];
  preferredScale: AqiScale;
  draftAnswer?: string;
}): { agentResult: AgentResult; report: VerificationReport } {
  const { dataset, agentResults, preferredScale, draftAnswer } = params;
  const checks: VerificationReport['checks'] = [];
  const warnings: string[] = [];
  const rejectedClaims: string[] = [];

  // 1. Source timestamp validation
  if (!dataset) {
    checks.push({
      check: 'Source & Timestamp Presence',
      passed: false,
      detail: 'No verified environmental dataset present.',
    });
    warnings.push('Live Open-Meteo data is missing; quantitative claims cannot be verified.');
  } else {
    const freshness = checkTimestampFreshness(dataset.currentTimestamp);
    const passed = freshness.validTimestamp && !freshness.isStale;
    checks.push({
      check: 'Timestamp Freshness',
      passed,
      detail: freshness.validTimestamp
        ? `Timestamp ${dataset.currentTimestamp} (${freshness.label}, age ${freshness.ageMinutes}m).`
        : 'Timestamp is missing or malformed.',
    });
    if (!passed) {
      warnings.push(
        freshness.validTimestamp
          ? `Data is ${freshness.ageMinutes} minutes old and should not be represented as real-time current conditions.`
          : 'Data timestamp could not be validated.',
      );
    }

    // 2. Data completeness
    const completeOk = dataset.completenessRatio >= 0.75;
    checks.push({
      check: 'Data Completeness',
      passed: completeOk,
      detail: `${Math.round(dataset.completenessRatio * 100)}% core pollutant fields available.${dataset.missingFields.length ? ` Missing: ${dataset.missingFields.join(', ')}.` : ''}`,
    });
    if (!completeOk) {
      warnings.push(`Incomplete pollutant profile (${dataset.missingFields.join(', ')} unavailable).`);
    }

    // 3. Scale consistency check
    const val = preferredScale === 'european_aqi' ? dataset.current.european_aqi : dataset.current.us_aqi;
    const cat = interpretAqiCategory(val, preferredScale);
    const scaleLabel = preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
    const scaleMislabelled =
      Boolean(draftAnswer) &&
      (/\bCPCB\b/i.test(draftAnswer ?? '') && !/not\s+(?:an\s+)?official\s+(?:indian\s+)?CPCB/i.test(draftAnswer ?? '') && !/cannot\s+be\s+equated\s+to\s+CPCB/i.test(draftAnswer ?? ''));

    checks.push({
      check: 'AQI Scale Consistency',
      passed: !scaleMislabelled,
      detail: scaleMislabelled
        ? `Detected potential CPCB mislabelling while active dataset uses ${scaleLabel}.`
        : `Verified scale ${scaleLabel} (${cat.value ?? 'N/A'} — ${cat.shortLabel}).`,
    });
    if (scaleMislabelled) {
      rejectedClaims.push('Rejected implicit equating of Open-Meteo US/EU AQI with official Indian CPCB AQI.');
    }

    // 4. Safety guarantee & contradiction check across agents
    const routineAgent = agentResults.find((a) => a.agent_name === 'Smart Routine Agent');
    const familyAgent = agentResults.find((a) => a.agent_name === 'Family Protection Agent');
    const hasAbsoluteSafetyGuarantee = Boolean(
      draftAnswer && /\b(100%\s*safe|completely\s*safe|guaranteed\s*safe|zero\s*risk)\b/i.test(draftAnswer),
    );
    if (hasAbsoluteSafetyGuarantee) {
      rejectedClaims.push('Rejected absolute safety guarantee ("completely safe" / "zero risk") because modelled data cannot guarantee zero exposure.');
    }

    const routinePositive = routineAgent?.recommendation.toLowerCase().includes('favorable') ?? false;
    const highPollution = cat.level === 'unhealthy' || cat.level === 'very_unhealthy' || cat.level === 'hazardous';
    const contradictory = highPollution && routinePositive;

    checks.push({
      check: 'Cross-Agent Consistency & Safety Guard',
      passed: !contradictory && !hasAbsoluteSafetyGuarantee,
      detail: contradictory
        ? 'Contradiction detected: Routine recommendation sounded favorable despite Unhealthy AQI.'
        : hasAbsoluteSafetyGuarantee
          ? 'Blocked unsupported absolute safety guarantee.'
          : `No contradictions across ${agentResults.length} specialist agent outputs.`,
    });
    if (contradictory) {
      warnings.push(
        `Caution override: Current ${cat.label} is ${cat.shortLabel}; indoor alternatives take precedence over outdoor routine suggestions.`,
      );
    }

    // 5. Medical diagnosis guard
    const medicalClaim = Boolean(
      draftAnswer && /\b(diagnos|prescrib|cure|take\s+\d+\s*mg)\b/i.test(draftAnswer),
    );
    if (medicalClaim) {
      rejectedClaims.push('Rejected potential medical diagnosis or dosage language.');
    }
    checks.push({
      check: 'Non-Medical Boundary',
      passed: !medicalClaim && (!familyAgent || familyAgent.limitations.some((l) => l.toLowerCase().includes('diagnosis'))),
      detail: medicalClaim ? 'Detected disallowed clinical claim.' : 'Verified guidance stays strictly environmental.',
    });
  }

  const allPassed = checks.every((c) => c.passed) && rejectedClaims.length === 0;
  const report: VerificationReport = {
    passed: allPassed,
    checks,
    warnings,
    rejectedClaims,
  };

  const agentResult: AgentResult = {
    agent_name: 'Verification Agent',
    status: dataset ? 'completed' : 'partial',
    observations: checks.map((c) => `${c.passed ? 'PASS' : 'FLAG'} — ${c.check}: ${c.detail}`),
    recommendation: allPassed
      ? 'All verification checks passed: timestamps, scale attribution, and cross-agent guidance are consistent.'
      : `Verification flagged ${warnings.length + rejectedClaims.length} item(s): ${[...warnings, ...rejectedClaims].join(' ')}`,
    evidence: checks.map((c) => `${c.check}: ${c.passed ? 'Verified' : 'Flagged'}`),
    data_timestamp: dataset?.currentTimestamp ?? 'Unavailable',
    confidence: dataset && allPassed ? 'high' : 'low',
    limitations: [
      'Deterministic verification validates internal consistency, scale labelling, and freshness; it cannot independently verify physical station readings not present in Open-Meteo.',
    ],
  };

  return { agentResult, report };
}
