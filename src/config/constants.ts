import type { ActivityType, CityLocation, ObservationCategory } from '../types/airQuality.ts';

export const DEFAULT_CITY: CityLocation = {
  id: 'chennai-in',
  name: 'Chennai',
  region: 'Tamil Nadu',
  country: 'India',
  latitude: 13.0827,
  longitude: 80.2707,
  timezone: 'Asia/Kolkata',
};

export const PRESET_CITIES: CityLocation[] = [
  DEFAULT_CITY,
  {
    id: 'bengaluru-in',
    name: 'Bengaluru',
    region: 'Karnataka',
    country: 'India',
    latitude: 12.9716,
    longitude: 77.5946,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'mumbai-in',
    name: 'Mumbai',
    region: 'Maharashtra',
    country: 'India',
    latitude: 19.076,
    longitude: 72.8777,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'delhi-in',
    name: 'New Delhi',
    region: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'hyderabad-in',
    name: 'Hyderabad',
    region: 'Telangana',
    country: 'India',
    latitude: 17.385,
    longitude: 78.4867,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'singapore-sg',
    name: 'Singapore',
    region: 'Central',
    country: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
    timezone: 'Asia/Singapore',
  },
  {
    id: 'london-gb',
    name: 'London',
    region: 'England',
    country: 'United Kingdom',
    latitude: 51.5072,
    longitude: -0.1276,
    timezone: 'Europe/London',
  },
  {
    id: 'tokyo-jp',
    name: 'Tokyo',
    region: 'Kanto',
    country: 'Japan',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo',
  },
];

export const POLLUTANT_META = {
  pm2_5: {
    symbol: 'PM2.5',
    name: 'Fine Particulate Matter',
    unit: 'µg/m³',
    who24hGuideline: 15,
    healthNote: 'Inhalable particles ≤2.5 µm capable of reaching deep lung tissue and bloodstream.',
  },
  pm10: {
    symbol: 'PM10',
    name: 'Coarse Particulate Matter',
    unit: 'µg/m³',
    who24hGuideline: 45,
    healthNote: 'Dust, pollen, and road particles ≤10 µm that irritate upper airways.',
  },
  nitrogen_dioxide: {
    symbol: 'NO₂',
    name: 'Nitrogen Dioxide',
    unit: 'µg/m³',
    who24hGuideline: 25,
    healthNote: 'Combustion gas primarily from urban traffic and power generation.',
  },
  ozone: {
    symbol: 'O₃',
    name: 'Ground-Level Ozone',
    unit: 'µg/m³',
    who24hGuideline: 100, // 8-hour WHO guideline reference
    healthNote: 'Photochemical oxidant formed in sunlight from NOx and VOCs; peaks in afternoon.',
  },
  sulphur_dioxide: {
    symbol: 'SO₂',
    name: 'Sulphur Dioxide',
    unit: 'µg/m³',
    who24hGuideline: 40,
    healthNote: 'Industrial and fossil-fuel emission gas affecting bronchial airways.',
  },
  carbon_monoxide: {
    symbol: 'CO',
    name: 'Carbon Monoxide',
    unit: 'µg/m³',
    who24hGuideline: 4000,
    healthNote: 'Colorless gas from incomplete vehicle and biomass combustion.',
  },
} as const;

export const ACTIVITIES_META: Array<{
  id: ActivityType;
  label: string;
  exertion: 'high' | 'moderate' | 'low';
  description: string;
}> = [
  {
    id: 'outdoor_exercise',
    label: 'Outdoor Exercise & Jogging',
    exertion: 'high',
    description: 'High breathing rate increases inhaled particulate dose.',
  },
  {
    id: 'cycling',
    label: 'Urban Cycling',
    exertion: 'high',
    description: 'Elevated respiration near road corridors; prefers lower NO₂ & PM2.5 windows.',
  },
  {
    id: 'children_outdoor',
    label: "Children's Outdoor Play",
    exertion: 'high',
    description: 'Developing lungs breathe more air per kilogram of body weight.',
  },
  {
    id: 'walking',
    label: 'Brisk Walking',
    exertion: 'moderate',
    description: 'Moderate exertion suitable during Good or lower Moderate windows.',
  },
  {
    id: 'commuting',
    label: 'Daily Commuting',
    exertion: 'low',
    description: 'Helps compare morning vs evening transit exposure windows.',
  },
  {
    id: 'gardening',
    label: 'Gardening & Courtyard Care',
    exertion: 'low',
    description: 'Low exertion; still affected by dust and afternoon ozone.',
  },
  {
    id: 'indoor_ventilation',
    label: 'Indoor Natural Ventilation',
    exertion: 'low',
    description: 'Identifies lower-AQI hours to open windows for cross-ventilation.',
  },
];

export const OBSERVATION_CATEGORIES: Array<{
  id: ObservationCategory;
  label: string;
}> = [
  { id: 'traffic_exhaust', label: 'Heavy Traffic Exhaust' },
  { id: 'smoke_burning', label: 'Waste or Biomass Smoke' },
  { id: 'construction_dust', label: 'Construction or Road Dust' },
  { id: 'industrial_odor', label: 'Industrial Plume or Odor' },
  { id: 'clear_visibility', label: 'Clear Sky & Good Visibility' },
];

export const WMO_WEATHER_LABELS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
};

export const SUSTAINABILITY_CHECKLIST_ITEMS = [
  {
    id: 'transit-shift',
    title: 'Replace two short solo car/two-wheeler trips per week with metro, bus, or rail',
    category: 'Mobility',
    rationale: 'Reduces localized NO₂ and brake/exhaust PM2.5 along dense urban corridors.',
  },
  {
    id: 'no-open-burning',
    title: 'Avoid burning garden leaves, plastics, or household waste',
    category: 'Waste',
    rationale: 'Open waste burning emits high spikes of fine PM2.5 and toxic polycyclic compounds.',
  },
  {
    id: 'off-peak-ventilation',
    title: 'Time natural window ventilation to lower-AQI forecast hours',
    category: 'Indoor Air',
    rationale: 'Reduces indoor particle accumulation without unnecessary continuous mechanical cooling.',
  },
  {
    id: 'clean-cooking-vent',
    title: 'Use range hoods or cross-ventilation while frying or high-heat cooking',
    category: 'Indoor Air',
    rationale: 'Cooking aerosols are a primary indoor source of PM2.5 and NO₂.',
  },
  {
    id: 'active-travel-clean',
    title: 'Choose side-street walking or cycling routes during low-AQI windows',
    category: 'Mobility',
    rationale: 'Moving even one block away from arterial traffic measurably lowers personal NO₂ intake.',
  },
  {
    id: 'tire-idling',
    title: 'Switch off vehicle engines during traffic waits exceeding 30 seconds',
    category: 'Mobility',
    rationale: 'Prevents concentrated kerbside exhaust build-up near pedestrians and schools.',
  },
];

export const STALE_DATA_THRESHOLD_MINUTES = 180;
