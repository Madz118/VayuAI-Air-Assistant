export type AqiScale = 'us_aqi' | 'european_aqi';

export type AqiSeverityLevel =
  | 'good'
  | 'moderate'
  | 'sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous'
  | 'unknown';

export interface AqiCategoryInfo {
  scale: AqiScale;
  value: number | null;
  level: AqiSeverityLevel;
  label: string;
  shortLabel: string;
  description: string;
  colorHex: string;
  bgTintClass: string;
  borderTintClass: string;
  textTintClass: string;
}

export interface CityLocation {
  id: string;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface HourlyAirQualityPoint {
  time: string;
  us_aqi: number | null;
  european_aqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  nitrogen_dioxide: number | null;
  ozone: number | null;
  sulphur_dioxide: number | null;
  carbon_monoxide: number | null;
}

export interface HourlyWeatherPoint {
  time: string;
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
  weather_code: number | null;
  precipitation_probability?: number | null;
}

export interface PollutantMetric {
  key: 'pm2_5' | 'pm10' | 'nitrogen_dioxide' | 'ozone' | 'sulphur_dioxide' | 'carbon_monoxide';
  symbol: string;
  name: string;
  value: number | null;
  unit: string;
  who24hGuideline: number | null;
  whoRatio: number | null;
  statusLabel: string;
  healthNote: string;
}

export interface EnvironmentalDataset {
  location: CityLocation;
  fetchedAt: string;
  currentTimestamp: string;
  modelSource: string;
  weatherSource: string;
  isModelledForecast: true;
  dataAgeMinutes: number;
  isStale: boolean;
  completenessRatio: number;
  missingFields: string[];
  current: {
    us_aqi: number | null;
    european_aqi: number | null;
    pm2_5: number | null;
    pm10: number | null;
    nitrogen_dioxide: number | null;
    ozone: number | null;
    sulphur_dioxide: number | null;
    carbon_monoxide: number | null;
    temperature_2m: number | null;
    relative_humidity_2m: number | null;
    wind_speed_10m: number | null;
    wind_direction_10m: number | null;
    weather_code: number | null;
    weather_label: string;
  };
  dominantPollutant: {
    key: string;
    symbol: string;
    name: string;
    value: number | null;
    unit: string;
    rationale: string;
  };
  hourly: Array<HourlyAirQualityPoint & Partial<HourlyWeatherPoint>>;
  cached: boolean;
}

export type AgentName =
  | 'Pollution Intelligence Agent'
  | 'Family Protection Agent'
  | 'Smart Routine Agent'
  | 'Sustainability Agent'
  | 'Verification Agent';

export type AgentStatus = 'completed' | 'partial' | 'skipped' | 'failed';

export type ConfidenceLevel = 'high' | 'moderate' | 'low';

export interface AgentResult {
  agent_name: AgentName;
  status: AgentStatus;
  observations: string[];
  recommendation: string;
  evidence: string[];
  data_timestamp: string;
  confidence: ConfidenceLevel;
  limitations: string[];
}

export interface VerificationReport {
  passed: boolean;
  checks: Array<{
    check: string;
    passed: boolean;
    detail: string;
  }>;
  warnings: string[];
  rejectedClaims: string[];
}

export interface OrchestratorResponse {
  requestId: string;
  intent: string;
  query: string;
  directAnswer: string;
  environmentalEvidence: string[];
  explanation: string;
  recommendedActions: string[];
  limitationsAndUncertainty: string[];
  dataSource: string;
  dataTimestamp: string;
  aqiScaleUsed: string;
  agentsInvolved: AgentName[];
  agentResults: AgentResult[];
  verification: VerificationReport;
  aiSynthesized: boolean;
  aiError?: string;
}

export type HouseholdMemberGroup = 'adult' | 'child' | 'older_adult';

export interface HouseholdProfile {
  id: string;
  label: string;
  group: HouseholdMemberGroup;
  hasRespiratorySensitivity: boolean;
  sensitivityNote: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | 'outdoor_exercise'
  | 'walking'
  | 'cycling'
  | 'commuting'
  | 'children_outdoor'
  | 'gardening'
  | 'indoor_ventilation';

export interface RoutineWindow {
  startTime: string;
  endTime: string;
  avgUsAqi: number | null;
  avgEuAqi: number | null;
  avgPm25: number | null;
  avgTempC: number | null;
  avgWindKmh: number | null;
  weatherLabel: string;
  suitability: 'favorable' | 'moderate_caution' | 'limit_exposure' | 'insufficient_data';
  suitabilityLabel: string;
  rationale: string;
  alternativeAction: string;
}

export interface RoutinePlanResult {
  activity: ActivityType;
  activityLabel: string;
  date: string;
  windows: RoutineWindow[];
  bestWindow: RoutineWindow | null;
  summary: string;
  disclaimer: string;
  agentResults: AgentResult[];
  verification: VerificationReport;
  dataTimestamp: string;
  dataSource: string;
}

export type ObservationCategory =
  | 'smoke_burning'
  | 'traffic_exhaust'
  | 'construction_dust'
  | 'industrial_odor'
  | 'clear_visibility';

export interface CommunityReport {
  id: string;
  cityName: string;
  latitude: number;
  longitude: number;
  category: ObservationCategory;
  description: string;
  submittedAt: string;
  isDemonstration: boolean;
  flagCount: number;
  flaggedReasons: string[];
  status: 'visible' | 'under_review';
}

export interface UserPreferences {
  preferredScale: AqiScale;
  temperatureUnit: 'celsius' | 'fahrenheit';
  reducedMotion: boolean;
}
