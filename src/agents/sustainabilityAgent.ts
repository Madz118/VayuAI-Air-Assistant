import { interpretAqiCategory } from '../utils/aqi.ts';
import { calculateTransparentCommuteComparison } from '../utils/sustainabilityCalc.ts';
import type { AgentResult, AqiScale, EnvironmentalDataset } from '../types/airQuality.ts';

export function runSustainabilityAgent(
  dataset: EnvironmentalDataset | null,
  preferredScale: AqiScale = 'us_aqi',
): AgentResult {
  const sampleCalc = calculateTransparentCommuteComparison({
    distanceKm: 8,
    currentMode: 'solo_car',
    alternativeMode: 'metro_rail',
    tripsPerWeek: 4,
  });

  if (!dataset) {
    return {
      agent_name: 'Sustainability Agent',
      status: 'partial',
      observations: [
        'Local air-quality conditions could not be loaded, so active-travel timing advice is withheld.',
        `Example transparent shift (8 km × 4 trips/week solo car → urban metro/rail): ~${sampleCalc.weeklyDeltaKgCo2e} kg CO2e/week difference under standard DEFRA-aligned averages.`,
      ],
      recommendation: 'Prioritize public transit, avoid open waste burning, and wait for live forecast data before planning outdoor cycling commutes.',
      evidence: sampleCalc.assumptions,
      data_timestamp: 'Unavailable',
      confidence: 'moderate',
      limitations: ['Emission comparisons rely on average passenger-km factors and vary by local grid and vehicle efficiency.'],
    };
  }

  const primaryAqi = preferredScale === 'european_aqi' ? dataset.current.european_aqi : dataset.current.us_aqi;
  const cat = interpretAqiCategory(primaryAqi, preferredScale);
  const activeTravelSafe = cat.level === 'good' || cat.level === 'moderate';

  const observations: string[] = [
    activeTravelSafe
      ? `Current ${cat.label} (${cat.value}) permits low-emission walking or cycling on low-traffic side streets.`
      : `Current ${cat.label} (${cat.value}) is elevated; enclosed public transit (metro/rail/filtered bus) is preferable over high-exertion roadside cycling today.`,
    `Transparent reference calculation: shifting 4 weekly 8 km solo-car trips to urban metro/rail reduces estimated emissions by ~${sampleCalc.weeklyDeltaKgCo2e} kg CO2e/week (~${sampleCalc.annualDeltaKgCo2e} kg/year).`,
  ];

  const recommendations: string[] = [
    activeTravelSafe
      ? 'Walk or cycle for short errands (<3 km) away from heavy traffic arteries, or choose metro/bus for longer commutes.'
      : 'Choose metro, suburban rail, or enclosed public transit instead of solo driving to reduce urban NO₂ without increasing personal exertion exposure.',
    'Avoid open burning of garden debris or household waste, which causes acute local PM2.5 spikes.',
    'Use natural cross-ventilation only during lower-AQI forecast hours to reduce continuous mechanical cooling energy.',
  ];

  return {
    agent_name: 'Sustainability Agent',
    status: 'completed',
    observations,
    recommendation: recommendations.join(' '),
    evidence: [
      `Ambient gating check: ${cat.label} = ${cat.value ?? 'N/A'}`,
      ...sampleCalc.assumptions.slice(0, 3),
    ],
    data_timestamp: dataset.currentTimestamp,
    confidence: 'high',
    limitations: [
      'Emission estimates are illustrative averages based on DEFRA-aligned factors, not metered telemetry from your specific vehicle or local transit grid.',
    ],
  };
}
