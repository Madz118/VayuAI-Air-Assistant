import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { CommunityReport, ObservationCategory } from '../types/airQuality.ts';

interface StoredCommunityReport extends CommunityReport {
  authorTokenHash?: string;
  flaggedByActorHashes: string[];
}

export type CommunityStorageMode = 'local_json_file' | 'ephemeral_demo';

export type DeleteReportResult = 'deleted' | 'not_found' | 'unauthorized' | 'forbidden';

export type FlagReportResult =
  | { status: 'updated'; report: CommunityReport }
  | { status: 'not_found' }
  | { status: 'already_flagged' };

const MAX_REPORTS = 100;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function constantTimeTokenMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createDemoSeed(): StoredCommunityReport[] {
  return [
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
      flaggedByActorHashes: [],
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
      flaggedByActorHashes: [],
    },
  ];
}

function toPublicReport(stored: StoredCommunityReport): CommunityReport {
  return {
    id: stored.id,
    cityName: stored.cityName,
    latitude: stored.latitude,
    longitude: stored.longitude,
    category: stored.category,
    description: stored.description,
    submittedAt: stored.submittedAt,
    isDemonstration: stored.isDemonstration,
    flagCount: stored.flagCount,
    flaggedReasons: [...stored.flaggedReasons],
    status: stored.status,
  };
}

export class CommunityStore {
  private reports: StoredCommunityReport[];
  private storageMode: CommunityStorageMode;
  private readonly filePath: string | null;

  constructor(options?: { persistPath?: string | null }) {
    if (options?.persistPath === null) {
      this.filePath = null;
      this.storageMode = 'ephemeral_demo';
      this.reports = createDemoSeed();
      return;
    }

    const baseDir = path.resolve(process.cwd(), 'data');
    const resolvedTarget = path.resolve(
      options?.persistPath ?? path.join(baseDir, 'community-reports.json'),
    );

    // Path traversal guard: persist strictly inside baseDir unless explicitly disabled
    if (resolvedTarget !== baseDir && !resolvedTarget.startsWith(baseDir + path.sep)) {
      this.filePath = null;
      this.storageMode = 'ephemeral_demo';
      this.reports = createDemoSeed();
      return;
    }

    this.filePath = resolvedTarget;
    this.storageMode = 'local_json_file';
    this.reports = this.loadFromDisk();
  }

  private loadFromDisk(): StoredCommunityReport[] {
    if (!this.filePath) return createDemoSeed();
    try {
      if (!fs.existsSync(this.filePath)) {
        const seed = createDemoSeed();
        this.persistToDisk(seed);
        return seed;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return createDemoSeed();
      }
      return parsed.slice(0, MAX_REPORTS).map((item) => ({
        ...item,
        flaggedReasons: Array.isArray(item.flaggedReasons) ? item.flaggedReasons : [],
        flaggedByActorHashes: Array.isArray(item.flaggedByActorHashes)
          ? item.flaggedByActorHashes
          : [],
      }));
    } catch {
      this.storageMode = 'ephemeral_demo';
      return createDemoSeed();
    }
  }

  private persistToDisk(records: StoredCommunityReport[] = this.reports): void {
    if (!this.filePath || this.storageMode === 'ephemeral_demo') return;
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(records, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch {
      this.storageMode = 'ephemeral_demo';
    }
  }

  getStorageInfo(): {
    storageMode: CommunityStorageMode;
    persistenceNote: string;
    maxReports: number;
  } {
    return {
      storageMode: this.storageMode,
      maxReports: MAX_REPORTS,
      persistenceNote:
        this.storageMode === 'local_json_file'
          ? 'Demonstration-Only Local Persistence: Observations are saved locally in server JSON storage (capped at 100 reports) without external database sync or user accounts.'
          : 'Demonstration-Only In-Memory Mode: Observations are held in temporary server memory for this session only.',
    };
  }

  list(cityFilter?: string): CommunityReport[] {
    const filtered = cityFilter
      ? this.reports.filter((r) => r.cityName.toLowerCase().includes(cityFilter.toLowerCase()))
      : this.reports;
    return filtered
      .map(toPublicReport)
      .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  }

  add(input: {
    cityName: string;
    latitude: number;
    longitude: number;
    category: ObservationCategory;
    description: string;
  }): { report: CommunityReport; authorToken: string } {
    const authorToken = crypto.randomBytes(24).toString('hex');
    const newReport: StoredCommunityReport = {
      id: `obs-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
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
      authorTokenHash: sha256Hex(authorToken),
      flaggedByActorHashes: [],
    };

    this.reports.unshift(newReport);

    // Bounded capacity eviction: remove oldest non-demonstration reports first if over MAX_REPORTS
    while (this.reports.length > MAX_REPORTS) {
      let removeIdx = -1;
      for (let i = this.reports.length - 1; i >= 0; i--) {
        if (!this.reports[i].isDemonstration) {
          removeIdx = i;
          break;
        }
      }
      if (removeIdx === -1) {
        removeIdx = this.reports.length - 1;
      }
      this.reports.splice(removeIdx, 1);
    }

    this.persistToDisk();
    return { report: toPublicReport(newReport), authorToken };
  }

  flag(id: string, reason: string, actorKey: string, isModerator = false): FlagReportResult {
    const target = this.reports.find((r) => r.id === id);
    if (!target) return { status: 'not_found' };

    const actorHash = sha256Hex(actorKey);
    if (!isModerator && target.flaggedByActorHashes.includes(actorHash)) {
      return { status: 'already_flagged' };
    }

    target.flaggedByActorHashes.push(actorHash);
    target.flagCount += 1;
    target.flaggedReasons.push(reason.trim().slice(0, 120) || 'Flagged for review');
    if (isModerator || target.flagCount >= 2) {
      target.status = 'under_review';
    }
    this.persistToDisk();
    return { status: 'updated', report: toPublicReport(target) };
  }

  delete(
    id: string,
    auth: { authorToken?: string; adminToken?: string; configuredAdminToken?: string },
  ): DeleteReportResult {
    const idx = this.reports.findIndex((r) => r.id === id);
    if (idx === -1) return 'not_found';

    const target = this.reports[idx];

    const hasAdminMatch = Boolean(
      auth.configuredAdminToken &&
        auth.configuredAdminToken.length >= 12 &&
        auth.adminToken &&
        constantTimeTokenMatch(auth.adminToken, auth.configuredAdminToken),
    );

    if (hasAdminMatch) {
      this.reports.splice(idx, 1);
      this.persistToDisk();
      return 'deleted';
    }

    if (target.isDemonstration) {
      return auth.authorToken || auth.adminToken ? 'forbidden' : 'unauthorized';
    }

    if (!auth.authorToken) {
      return 'unauthorized';
    }

    if (!target.authorTokenHash) {
      return 'forbidden';
    }

    const providedHash = sha256Hex(auth.authorToken);
    if (!constantTimeTokenMatch(providedHash, target.authorTokenHash)) {
      return 'forbidden';
    }

    this.reports.splice(idx, 1);
    this.persistToDisk();
    return 'deleted';
  }
}

const defaultStore = new CommunityStore();

export function getCommunityStorageInfo() {
  return defaultStore.getStorageInfo();
}

export function listCommunityReports(cityFilter?: string): CommunityReport[] {
  return defaultStore.list(cityFilter);
}

export function addCommunityReport(input: {
  cityName: string;
  latitude: number;
  longitude: number;
  category: ObservationCategory;
  description: string;
}): { report: CommunityReport; authorToken: string } {
  return defaultStore.add(input);
}

export function flagCommunityReport(
  id: string,
  reason: string,
  actorKey = 'anonymous',
  isModerator = false,
): FlagReportResult {
  return defaultStore.flag(id, reason, actorKey, isModerator);
}

export function deleteCommunityReport(
  id: string,
  auth: { authorToken?: string; adminToken?: string; configuredAdminToken?: string } = {},
): DeleteReportResult {
  return defaultStore.delete(id, auth);
}
