import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimiter } from "@/lib/ai/rateLimit";

beforeEach(() => {
  vi.stubEnv("AI_RATE_LIMIT_PER_MINUTE", "3");
  resetRateLimiter();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimiter();
});

describe("checkRateLimit", () => {
  it("allows the full bucket, then rejects with retryAfterMs", () => {
    expect(checkRateLimit("client-a").allowed).toBe(true);
    expect(checkRateLimit("client-a").allowed).toBe(true);
    expect(checkRateLimit("client-a").allowed).toBe(true);

    const denied = checkRateLimit("client-a");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps buckets independent per client", () => {
    for (let i = 0; i < 3; i += 1) expect(checkRateLimit("client-a").allowed).toBe(true);
    expect(checkRateLimit("client-b").allowed).toBe(true);
  });

  it("refills over time", () => {
    for (let i = 0; i < 3; i += 1) expect(checkRateLimit("client-c").allowed).toBe(true);
    expect(checkRateLimit("client-c").allowed).toBe(false);

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(20_000); // 1/3 of the refill window -> 1 token
      expect(checkRateLimit("client-c").allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the default capacity when the env var is unset", () => {
    vi.stubEnv("AI_RATE_LIMIT_PER_MINUTE", "");
    resetRateLimiter();
    for (let i = 0; i < 10; i += 1) expect(checkRateLimit("client-d").allowed).toBe(true);
    expect(checkRateLimit("client-d").allowed).toBe(false);
  });

  it("ignores a malformed env var value", () => {
    vi.stubEnv("AI_RATE_LIMIT_PER_MINUTE", "abc");
    resetRateLimiter();
    expect(checkRateLimit("client-e").allowed).toBe(true);
  });
});
