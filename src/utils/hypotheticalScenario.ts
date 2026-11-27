import { interpretAqiCategory } from './aqi.ts';
import type { AqiCategoryInfo, AqiScale } from '../types/airQuality.ts';

export interface HypotheticalScenario {
  isHypothetical: true;
  assumedAqi: number;
  scale: AqiScale;
  scaleLabel: string;
  category: AqiCategoryInfo;
  sourcePhrase: string;
}

const HYPOTHETICAL_PATTERNS: RegExp[] = [
  // "Assume the US AQI is 250", "Assume EU EAQI is 45", "Assume Chennai AQI reaches 300"
  /\b(?:assume|suppose|imagine|pretend|say)\b[^.!?\n]{0,48}?\b(?:(?:us\s*(?:epa\s*)?aqi|eu(?:ropean)?\s*(?:e?aqi)?|air\s*quality(?:\s*index)?|aqi|pollution(?:\s*level)?))\s*(?:is|were|was|becomes?|reaches?|hits?|rises?\s+to|drops?\s+to|equals?|=|:|at|of)?\s*(-?\d+(?:\.\d+)?)\b/i,
  // "What if AQI is 250", "What if pollution reaches 300", "What should children do if AQI is 250"
  /\b(?:what\s+if|even\s+if|if)\b[^.!?\n]{0,48}?\b(?:(?:us\s*(?:epa\s*)?aqi|eu(?:ropean)?\s*(?:e?aqi)?|air\s*quality(?:\s*index)?|aqi|pollution(?:\s*level)?))\s*(?:is|were|was|becomes?|reaches?|hits?|rises?\s+to|drops?\s+to|exceeds?|goes\s+above|=|:|at|of)?\s*(-?\d+(?:\.\d+)?)\b/i,
  // "Assume 250 AQI" / "If 250 US AQI"
  /\b(?:assume|suppose|what\s+if|if)\b[^.!?\n]{0,24}?\b(-?\d+(?:\.\d+)?)\s*(?:us\s*aqi|eu\s*e?aqi|aqi)\b/i,
];

function detectHypotheticalScale(text: string, fallbackScale: AqiScale): AqiScale {
  if (/\b(?:eu(?:ropean)?\s*(?:e?aqi|air\s*quality\s*index)|eaqi)\b/i.test(text)) {
    return 'european_aqi';
  }
  if (/\b(?:us\s*(?:epa\s*)?aqi|epa\s*aqi)\b/i.test(text)) {
    return 'us_aqi';
  }
  return fallbackScale;
}

export function parseHypotheticalScenario(
  query: string,
  preferredScale: AqiScale = 'us_aqi',
): HypotheticalScenario | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  for (const pattern of HYPOTHETICAL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    const rawNum = Number(match[1]);
    if (!Number.isFinite(rawNum) || rawNum < 0 || rawNum > 1000) {
      continue;
    }

    const assumedAqi = Math.round(rawNum);
    const scale = detectHypotheticalScale(match[0], detectHypotheticalScale(trimmed, preferredScale));
    const scaleLabel =
      scale === 'european_aqi'
        ? 'European Air Quality Index (EU EAQI)'
        : 'US EPA Air Quality Index (US AQI)';
    const category = interpretAqiCategory(assumedAqi, scale);

    return {
      isHypothetical: true,
      assumedAqi,
      scale,
      scaleLabel,
      category,
      sourcePhrase: match[0].trim(),
    };
  }

  return null;
}
