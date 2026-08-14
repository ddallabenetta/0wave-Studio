/**
 * Environment configuration for the AI Sound Connector.
 *
 * Config is read at request time (never cached at module top level) so
 * process.env mutations apply immediately and tests can stub variables
 * freely. Server-only: never reference these from client code.
 */

export interface AIProviderConfig {
  /** False when OPENAI_API_KEY is missing/blank; the route answers 503. */
  configured: boolean;
  /** OpenAI-compatible API base URL, e.g. https://api.openai.com/v1. */
  baseUrl: string;
  /** Model id used for completions. */
  model: string;
  /** Completion token cap (cost control). */
  maxTokens: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 10;

/** Parse a positive-int env var; invalid or missing values fall back. */
function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getProviderConfig(): AIProviderConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    configured: typeof apiKey === "string" && apiKey.trim().length > 0,
    baseUrl: (process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, ""),
    model: (process.env.OPENAI_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    maxTokens: positiveInt(process.env.AI_MAX_TOKENS, DEFAULT_MAX_TOKENS),
  };
}

/**
 * Per-instance request budget (token bucket capacity, per minute).
 * Deliberately not part of AIProviderConfig: it belongs to the rate limiter.
 */
export function getRateLimitPerMinute(): number {
  return positiveInt(process.env.AI_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE);
}
