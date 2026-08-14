import { describe, expect, it, vi } from "vitest";
import { withRetries, isRetryableError } from "@/lib/ai/retry";
import { AIProviderError } from "@/lib/ai/provider";

const TINY_BACKOFF: readonly number[] = [1, 1];

describe("withRetries", () => {
  it("retries retryable failures and returns the successful result", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AIProviderError("provider-unavailable", "503", true))
      .mockRejectedValueOnce(new AIProviderError("provider-unavailable", "429", true))
      .mockResolvedValueOnce("ok");

    await expect(withRetries(fn, { backoffMs: TINY_BACKOFF })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("fails fast on a non-retryable provider error", async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new AIProviderError("provider-auth", "401", false));
    await expect(withRetries(fn)).rejects.toBeInstanceOf(AIProviderError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fails fast on an unknown (non-provider) error", async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("boom"));
    await expect(withRetries(fn)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after attempts even when failures stay retryable", async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new AIProviderError("provider-unavailable", "503", true));
    await expect(withRetries(fn, { attempts: 2, backoffMs: TINY_BACKOFF })).rejects.toBeInstanceOf(AIProviderError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("applies the configured delays between attempts", async () => {
    const sleepSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AIProviderError("provider-unavailable", "503", true))
      .mockResolvedValueOnce("ok");

    await withRetries(fn, { backoffMs: [17, 23] });
    // Node's setTimeout signature is (handler, delay); delay is arg index 1.
    const delays = sleepSpy.mock.calls.map((call) => call[1]);
    expect(delays).toEqual([17]);
    sleepSpy.mockRestore();
  });
});

describe("isRetryableError", () => {
  it("reads the retryable flag from AIProviderError", () => {
    expect(isRetryableError(new AIProviderError("provider-unavailable", "x", true))).toBe(true);
    expect(isRetryableError(new AIProviderError("provider-auth", "x", false))).toBe(false);
  });

  it("accepts duck-typed retryable errors and rejects everything else", () => {
    expect(isRetryableError({ retryable: true })).toBe(true);
    expect(isRetryableError({ retryable: false })).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError("nope")).toBe(false);
  });
});
