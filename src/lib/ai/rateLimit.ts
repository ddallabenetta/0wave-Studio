/**
 * In-memory token bucket rate limiter for the AI connector.
 *
 * Keyed by client identity (first x-forwarded-for value, "local" fallback).
 * Capacity = AI_RATE_LIMIT_PER_MINUTE tokens, refilled continuously over
 * 60 s. Documented limitation: the bucket lives in process memory, so it is
 * per-instance only (a single dyno / serverless instance). Multi-instance
 * deployments need a shared store (e.g. Redis) before this is safe to
 * scale; the route comment repeats this.
 */
import { getRateLimitPerMinute } from "./config";

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  /** When denied: milliseconds until the next token is available. */
  retryAfterMs: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const capacity = getRateLimitPerMinute();
  const now = Date.now();

  const bucket = buckets.get(key) ?? { tokens: capacity, lastRefillMs: now };
  // Refill proportionally to elapsed time since the last check.
  const elapsedMs = Math.max(0, now - bucket.lastRefillMs);
  bucket.tokens = Math.min(capacity, bucket.tokens + (elapsedMs / 60_000) * capacity);
  bucket.lastRefillMs = now;
  buckets.set(key, bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }
  const retryAfterMs = Math.ceil(((1 - bucket.tokens) / capacity) * 60_000);
  return { allowed: false, retryAfterMs };
}

/** Test seam: drop every bucket. */
export function resetRateLimiter(): void {
  buckets.clear();
}
