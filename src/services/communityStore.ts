import type { CommunityReport, ObservationCategory } from '../types/airQuality.ts';

// Explicit demonstration observations labelled transparently as unverified demo items.
const reports: CommunityReport[] = [
  {
    id: 'demo-obs-1',
    cityName: 'Chennai',
    latitude: 13.0604,
    longitude: 80.2496,
    category: 'traffic_exhaust',
    description:
      'Demonstration Community Observation: Noticeable evening diesel exhaust haze along Anna Salai corridor during peak bus and freight traffic.',
    submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    isDemonstration: true,
    flagCount: 0,
    flaggedReasons: [],
    status: 'visible',
  },
  {
    id: 'demo-obs-2',
    cityName: 'Chennai',
    latitude: 13.0012,
    longitude: 80.2565,
    category: 'clear_visibility',
    description:
      'Demonstration Community Observation: Strong coastal sea breeze near Adyar with crisp visibility and minimal dust.',
    submittedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    isDemonstration: true,
    flagCount: 0,
    flaggedReasons: [],
    status: 'visible',
  },
];

export function listCommunityReports(cityFilter?: string): CommunityReport[] {
  const filtered = cityFilter
    ? reports.filter((r) => r.cityName.toLowerCase().includes(cityFilter.toLowerCase()))
    : reports;
  return [...filtered].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

export function addCommunityReport(input: {
  cityName: string;
  latitude: number;
  longitude: number;
  category: ObservationCategory;
  description: string;
}): CommunityReport {
  const newReport: CommunityReport = {
    id: `obs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    cityName: input.cityName,
    latitude: input.latitude,
    longitude: input.longitude,
    category: input.category,
    description: input.description,
    submittedAt: new Date().toISOString(),
    isDemonstration: false,
    flagCount: 0,
    flaggedReasons: [],
    status: 'visible',
  };
  reports.unshift(newReport);
  return newReport;
}

export function flagCommunityReport(id: string, reason: string): CommunityReport | null {
  const target = reports.find((r) => r.id === id);
  if (!target) return null;
  target.flagCount += 1;
  target.flaggedReasons.push(reason.trim().slice(0, 120) || 'Flagged for review');
  if (target.flagCount >= 2) {
    target.status = 'under_review';
  }
  return target;
}

export function deleteCommunityReport(id: string): boolean {
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  reports.splice(idx, 1);
  return true;
}
