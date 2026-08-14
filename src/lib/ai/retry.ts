/**
 * Retry helper for the AI connector provider call.
 *
 * Spec (docs/BACKLOG-AI-CONNECTOR.md): two retries with exponential backoff,
 * only for retryable failures (network, 5xx, provider 429). Auth and
 * validation failures fail fast.
 *
 * Delays are injectable via opts so tests can avoid real waiting.
 */
import { AIProviderError } from "./provider";

export interface RetryOptions {
  /** Total attempts including the first (default 3 = 1 attempt + 2 retries). */
  attempts?: number;
  /** Delay before retry N (0-based) in ms; falls back to the last entry. */
  backoffMs?: readonly number[];
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS: readonly number[] = [500, 2000];

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AIProviderError) return error.retryable;
  // Duck-typed fallback so any module can opt a failure into retrying.
  if (typeof error === "object" && error !== null) {
    return (error as { retryable?: unknown }).retryable === true;
  }
  return false;
}

export async function withRetries<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? DEFAULT_ATTEMPTS);
  const backoff = opts?.backoffMs ?? DEFAULT_BACKOFF_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === attempts - 1;
      if (isLastAttempt || !isRetryableError(error)) throw error;
      const delayMs = backoff[attempt] ?? backoff[backoff.length - 1] ?? DEFAULT_BACKOFF_MS[0];
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Unreachable: the last attempt always throws.
  throw lastError;
}
