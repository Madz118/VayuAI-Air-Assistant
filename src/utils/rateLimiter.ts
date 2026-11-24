export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

interface RateEntry {
  count: number;
  resetAt: number;
}

export class SlidingWindowRateLimiter {
  private readonly store = new Map<string, RateEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(options?: { maxRequests?: number; windowMs?: number; maxEntries?: number }) {
    this.maxRequests = options?.maxRequests ?? 120;
    this.windowMs = options?.windowMs ?? 60_000;
    this.maxEntries = options?.maxEntries ?? 5000;
  }

  check(key: string, nowMs: number = Date.now()): RateLimitDecision {
    const existing = this.store.get(key);
    if (!existing || existing.resetAt <= nowMs) {
      if (!existing && this.store.size >= this.maxEntries) {
        this.cleanup(nowMs);
        if (this.store.size >= this.maxEntries) {
          const oldestKey = this.store.keys().next().value;
          if (oldestKey !== undefined) {
            this.store.delete(oldestKey);
          }
        }
      }
      const resetAt = nowMs + this.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: Math.max(0, this.maxRequests - 1),
        resetAt,
        retryAfterSeconds: Math.ceil(this.windowMs / 1000),
      };
    }

    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - existing.count),
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
    };
  }

  cleanup(nowMs: number = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= nowMs) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.store.size;
  }
}
