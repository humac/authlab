import { NextResponse } from "next/server";

interface SlidingWindowEntry {
  timestamps: number[];
}

const stores = new Map<string, Map<string, SlidingWindowEntry>>();

function getStore(namespace: string): Map<string, SlidingWindowEntry> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  return store;
}

/** Prune stale entries every 5 minutes per namespace. */
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const pruneTimers = new Map<string, NodeJS.Timeout>();

function ensurePruner(namespace: string, windowMs: number) {
  if (pruneTimers.has(namespace)) return;
  const timer = setInterval(() => {
    const store = stores.get(namespace);
    if (!store) return;
    const cutoff = Date.now() - windowMs;
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, PRUNE_INTERVAL_MS);
  timer.unref();
  pruneTimers.set(namespace, timer);
}

export interface RateLimitConfig {
  /** Unique namespace for this limiter (e.g. "login", "register"). */
  namespace: string;
  /** Maximum number of requests allowed within the window. */
  maxAttempts: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check and consume a rate limit token for the given key.
 * Returns whether the request is allowed plus remaining capacity.
 */
export function checkRateLimit(
  config: RateLimitConfig,
  key: string,
): RateLimitResult {
  const store = getStore(config.namespace);
  ensurePruner(config.namespace, config.windowMs);

  const now = Date.now();
  const cutoff = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Slide the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.maxAttempts) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxAttempts - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

/**
 * Extract the client IP from the request headers.
 * Prefers x-forwarded-for (first hop), falls back to x-real-ip,
 * then to a generic fallback.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Return a 429 Too Many Requests response.
 */
export function rateLimitExceededResponse(retryAfterMs: number): NextResponse {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

/** Exported for testing — clears all rate limit state. */
export function _resetAllStores() {
  stores.clear();
  for (const timer of pruneTimers.values()) {
    clearInterval(timer);
  }
  pruneTimers.clear();
}
