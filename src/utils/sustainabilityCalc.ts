export type TransportMode = 'solo_car' | 'motorbike' | 'bus' | 'metro_rail' | 'cycling' | 'walking';

// Transparent UK DESNZ / DEFRA-aligned average urban passenger emission factors (kg CO2e per passenger-km).
// Explicitly exposed in UI so users understand the exact assumptions behind any estimate.
export const EMISSION_FACTORS_KG_PER_KM: Record<
  TransportMode,
  { label: string; factorKgPerKm: number; assumption: string }
> = {
  solo_car: {
    label: 'Average Petrol/Diesel Car (Single Occupant)',
    factorKgPerKm: 0.171,
    assumption: 'Assumes average medium passenger car (~171 g CO2e/km tailpipe+well-to-tank).',
  },
  motorbike: {
    label: 'Two-Wheeler / Scooter',
    factorKgPerKm: 0.083,
    assumption: 'Assumes average small-displacement urban motorcycle (~83 g CO2e/km).',
  },
  bus: {
    label: 'City Bus',
    factorKgPerKm: 0.097,
    assumption: 'Assumes average urban bus occupancy (~97 g CO2e/passenger-km).',
  },
  metro_rail: {
    label: 'Urban Metro / Suburban Rail',
    factorKgPerKm: 0.035,
    assumption: 'Assumes electric urban rail grid mix (~35 g CO2e/passenger-km).',
  },
  cycling: {
    label: 'Bicycle',
    factorKgPerKm: 0,
    assumption: '0 kg operational tailpipe emissions.',
  },
  walking: {
    label: 'Walking',
    factorKgPerKm: 0,
    assumption: '0 kg operational tailpipe emissions.',
  },
};

export function calculateTransparentCommuteComparison(params: {
  distanceKm: number;
  currentMode: TransportMode;
  alternativeMode: TransportMode;
  tripsPerWeek: number;
}): {
  weeklyDeltaKgCo2e: number;
  annualDeltaKgCo2e: number;
  assumptions: string[];
} {
  const safeDistance = Math.max(0, Math.min(250, Number.isFinite(params.distanceKm) ? params.distanceKm : 0));
  const safeTrips = Math.max(0, Math.min(30, Number.isFinite(params.tripsPerWeek) ? params.tripsPerWeek : 0));

  const currentMeta = EMISSION_FACTORS_KG_PER_KM[params.currentMode];
  const altMeta = EMISSION_FACTORS_KG_PER_KM[params.alternativeMode];

  const weeklyCurrent = safeDistance * safeTrips * currentMeta.factorKgPerKm;
  const weeklyAlt = safeDistance * safeTrips * altMeta.factorKgPerKm;
  const weeklyDeltaKgCo2e = Math.round((weeklyCurrent - weeklyAlt) * 100) / 100;
  const annualDeltaKgCo2e = Math.round(weeklyDeltaKgCo2e * 52 * 10) / 10;

  return {
    weeklyDeltaKgCo2e,
    annualDeltaKgCo2e,
    assumptions: [
      `Distance: ${safeDistance} km per trip × ${safeTrips} trips/week (52 weeks/year).`,
      `${currentMeta.label}: ${currentMeta.factorKgPerKm} kg CO2e/km (${currentMeta.assumption})`,
      `${altMeta.label}: ${altMeta.factorKgPerKm} kg CO2e/km (${altMeta.assumption})`,
      'Real-world savings vary with vehicle fuel type, local electricity grid mix, and bus/train occupancy.',
    ],
  };
}
