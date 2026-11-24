import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_CITY } from '../config/constants.ts';
import type {
  CityLocation,
  EnvironmentalDataset,
  HouseholdProfile,
  UserPreferences,
} from '../types/airQuality.ts';
import { interpretAqiCategory } from '../utils/aqi.ts';

export interface VayuNotification {
  id: string;
  severity: 'info' | 'warning' | 'alert';
  title: string;
  detail: string;
  timestamp: string;
}

interface VayuContextValue {
  location: CityLocation;
  setLocation: (loc: CityLocation) => void;
  dataset: EnvironmentalDataset | null;
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  preferences: UserPreferences;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
  profiles: HouseholdProfile[];
  addProfile: (profile: Omit<HouseholdProfile, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProfile: (id: string, patch: Partial<Omit<HouseholdProfile, 'id' | 'createdAt'>>) => void;
  deleteProfile: (id: string) => void;
  notifications: VayuNotification[];
  dismissedNotificationIds: string[];
  dismissNotification: (id: string) => void;
  completedChecklistIds: string[];
  toggleChecklistItem: (id: string) => void;
}

const VayuContext = createContext<VayuContextValue | null>(null);

const STORAGE_KEYS = {
  location: 'vayu_active_location_v1',
  preferences: 'vayu_preferences_v1',
  profiles: 'vayu_household_profiles_v1',
  checklist: 'vayu_sustainability_checklist_v1',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function VayuProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<CityLocation>(() =>
    readStorage<CityLocation>(STORAGE_KEYS.location, DEFAULT_CITY),
  );
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return readStorage<UserPreferences>(STORAGE_KEYS.preferences, {
      preferredScale: 'us_aqi',
      temperatureUnit: 'celsius',
      reducedMotion: Boolean(prefersReduced),
    });
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('vayu-reduced-motion', preferences.reducedMotion);
    }
  }, [preferences.reducedMotion]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => {
      const stored = readStorage<UserPreferences | null>(STORAGE_KEYS.preferences, null);
      if (stored === null) {
        setPreferences((prev) => ({ ...prev, reducedMotion: e.matches }));
      }
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  const [profiles, setProfiles] = useState<HouseholdProfile[]>(() =>
    readStorage<HouseholdProfile[]>(STORAGE_KEYS.profiles, []),
  );
  const [completedChecklistIds, setCompletedChecklistIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.checklist, []),
  );

  const [dataset, setDataset] = useState<EnvironmentalDataset | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);

  const fetchForLocation = useCallback(async (loc: CityLocation) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/air-quality', window.location.origin);
      url.searchParams.set('lat', String(loc.latitude));
      url.searchParams.set('lon', String(loc.longitude));
      url.searchParams.set('name', loc.name);
      if (loc.country) url.searchParams.set('country', loc.country);
      if (loc.region) url.searchParams.set('region', loc.region);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Request failed with status ${res.status}`);
      }
      setDataset(json as EnvironmentalDataset);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reach environmental data service.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForLocation(location);
  }, [location, fetchForLocation]);

  const setLocation = useCallback((loc: CityLocation) => {
    setLocationState(loc);
    try {
      localStorage.setItem(STORAGE_KEYS.location, JSON.stringify(loc));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const addProfile = useCallback((input: Omit<HouseholdProfile, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const created: HouseholdProfile = {
      ...input,
      id: `hh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      createdAt: now,
      updatedAt: now,
    };
    setProfiles((prev) => {
      const next = [created, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const updateProfile = useCallback(
    (id: string, patch: Partial<Omit<HouseholdProfile, 'id' | 'createdAt'>>) => {
      setProfiles((prev) => {
        const next = prev.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
        );
        try {
          localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(next));
        } catch {
          // Ignore
        }
        return next;
      });
    },
    [],
  );

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try {
        localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const toggleChecklistItem = useCallback((id: string) => {
    setCompletedChecklistIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEYS.checklist, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setDismissedNotificationIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const notifications = useMemo<VayuNotification[]>(() => {
    if (!dataset) return [];
    const items: VayuNotification[] = [];
    const val =
      preferences.preferredScale === 'european_aqi'
        ? dataset.current.european_aqi
        : dataset.current.us_aqi;
    const cat = interpretAqiCategory(val, preferences.preferredScale);

    if (cat.level === 'sensitive' || cat.level === 'unhealthy' || cat.level === 'very_unhealthy' || cat.level === 'hazardous') {
      items.push({
        id: `aqi-elevated-${dataset.currentTimestamp}`,
        severity: cat.level === 'sensitive' ? 'warning' : 'alert',
        title: `${cat.shortLabel} Conditions in ${dataset.location.name}`,
        detail: `${cat.label} is ${cat.value}. Dominant pollutant: ${dataset.dominantPollutant.symbol}. Consider lower-exertion indoor alternatives.`,
        timestamp: dataset.currentTimestamp,
      });
    }

    if (dataset.isStale) {
      items.push({
        id: `stale-${dataset.currentTimestamp}`,
        severity: 'warning',
        title: 'Environmental Timestamp Is Aged',
        detail: `Latest modelled timestamp is ${dataset.dataAgeMinutes}m old. Refresh to check for newer forecast updates.`,
        timestamp: dataset.currentTimestamp,
      });
    }

    if (dataset.missingFields.length > 0) {
      items.push({
        id: `missing-${dataset.currentTimestamp}`,
        severity: 'info',
        title: 'Partial Pollutant Coverage',
        detail: `Missing modelled metrics for current hour: ${dataset.missingFields.join(', ')}.`,
        timestamp: dataset.currentTimestamp,
      });
    }

    if (profiles.some((p) => p.hasRespiratorySensitivity || p.group === 'child' || p.group === 'older_adult') && cat.level === 'moderate') {
      items.push({
        id: `hh-mod-${dataset.currentTimestamp}`,
        severity: 'info',
        title: 'Household Exposure Reminder',
        detail: `With ${cat.label} at ${cat.value}, pace prolonged outdoor exertion for sensitive household members.`,
        timestamp: dataset.currentTimestamp,
      });
    }

    return items.filter((n) => !dismissedNotificationIds.includes(n.id));
  }, [dataset, preferences.preferredScale, profiles, dismissedNotificationIds]);

  const value = useMemo<VayuContextValue>(
    () => ({
      location,
      setLocation,
      dataset,
      loading,
      error,
      refreshData: () => fetchForLocation(location),
      preferences,
      updatePreferences,
      profiles,
      addProfile,
      updateProfile,
      deleteProfile,
      notifications,
      dismissedNotificationIds,
      dismissNotification,
      completedChecklistIds,
      toggleChecklistItem,
    }),
    [
      location,
      setLocation,
      dataset,
      loading,
      error,
      fetchForLocation,
      preferences,
      updatePreferences,
      profiles,
      addProfile,
      updateProfile,
      deleteProfile,
      notifications,
      dismissedNotificationIds,
      dismissNotification,
      completedChecklistIds,
      toggleChecklistItem,
    ],
  );

  return <VayuContext.Provider value={value}>{children}</VayuContext.Provider>;
}

export function useVayu(): VayuContextValue {
  const ctx = useContext(VayuContext);
  if (!ctx) {
    throw new Error('useVayu must be used inside VayuProvider.');
  }
  return ctx;
}
