export interface LocalDateTimeContext {
  localDate: string; // YYYY-MM-DD
  localHour: number; // 0..23
  localMinute: number; // 0..59
  localMinutesOfDay: number; // 0..1439
  localTimeLabel: string; // HH:MM
  timezone: string;
}

/**
 * Resolves the exact current local date & time in a location's IANA timezone
 * (falling back cleanly to UTC offset seconds or ISO clock if timezone is unavailable).
 */
export function getLocalDateTimeContext(params?: {
  timezone?: string;
  utcOffsetSeconds?: number;
  referenceNowMs?: number;
}): LocalDateTimeContext {
  const referenceNowMs = params?.referenceNowMs ?? Date.now();
  const tz = params?.timezone?.trim();

  if (tz && tz.toUpperCase() !== 'GMT' && tz.toUpperCase() !== 'UTC') {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(referenceNowMs));

      const map: Record<string, string> = {};
      for (const p of parts) {
        if (p.type !== 'literal') map[p.type] = p.value;
      }

      const year = map.year;
      const month = map.month;
      const day = map.day;
      const hour = Number(map.hour === '24' ? '0' : map.hour);
      const minute = Number(map.minute);

      if (year && month && day && Number.isFinite(hour) && Number.isFinite(minute)) {
        const hh = String(hour).padStart(2, '0');
        const mm = String(minute).padStart(2, '0');
        return {
          localDate: `${year}-${month}-${day}`,
          localHour: hour,
          localMinute: minute,
          localMinutesOfDay: hour * 60 + minute,
          localTimeLabel: `${hh}:${mm}`,
          timezone: tz,
        };
      }
    } catch {
      // Fall through to offset-based calculation below
    }
  }

  const offsetMs = (params?.utcOffsetSeconds ?? 0) * 1000;
  const shifted = new Date(referenceNowMs + offsetMs);
  const iso = shifted.toISOString();
  const localHour = shifted.getUTCHours();
  const localMinute = shifted.getUTCMinutes();
  return {
    localDate: iso.slice(0, 10),
    localHour,
    localMinute,
    localMinutesOfDay: localHour * 60 + localMinute,
    localTimeLabel: `${String(localHour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')}`,
    timezone: tz || 'UTC',
  };
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Checks whether a forecast window [startTime, endTime) is still valid for scheduling
 * given the location's current local date and time.
 *
 * Rules:
 * - Future calendar dates are valid.
 * - Past calendar dates are excluded.
 * - On the current local date:
 *   - Completely elapsed windows (end <= localMinutesOfDay) are strictly excluded.
 *   - In-progress windows require at least `minRemainingMinutes` remaining (default 90m for 3h blocks).
 */
export function evaluateWindowTimeValidity(
  startTime: string,
  endTime: string,
  localNow: LocalDateTimeContext,
  minRemainingMinutes = 90,
): {
  isValid: boolean;
  status: 'future' | 'in_progress' | 'elapsed';
  remainingMinutes: number;
} {
  const windowDate = startTime.slice(0, 10);
  if (windowDate > localNow.localDate) {
    return { isValid: true, status: 'future', remainingMinutes: 180 };
  }
  if (windowDate < localNow.localDate) {
    return { isValid: false, status: 'elapsed', remainingMinutes: 0 };
  }

  const startHr = Number(startTime.slice(11, 13));
  const startMin = Number(startTime.slice(14, 16) || '0');
  const endHr = Number(endTime.slice(11, 13));
  const endMin = Number(endTime.slice(14, 16) || '0');

  const startTotal = startHr * 60 + startMin;
  const endTotal = (endHr === 0 && endTime.slice(11, 13) === '00' ? 24 : endHr) * 60 + endMin;

  if (endTotal <= localNow.localMinutesOfDay) {
    return { isValid: false, status: 'elapsed', remainingMinutes: 0 };
  }

  if (startTotal <= localNow.localMinutesOfDay) {
    const remaining = endTotal - localNow.localMinutesOfDay;
    if (remaining < minRemainingMinutes) {
      return { isValid: false, status: 'elapsed', remainingMinutes: remaining };
    }
    return { isValid: true, status: 'in_progress', remainingMinutes: remaining };
  }

  return {
    isValid: true,
    status: 'future',
    remainingMinutes: endTotal - startTotal,
  };
}
