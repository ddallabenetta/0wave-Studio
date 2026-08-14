/**
 * Input moderation for the AI Sound Connector.
 *
 * A basic, clearly-scoped filter: a length cap (already enforced by the
 * request schema; re-checked here as defense in depth) plus a small
 * case-insensitive blocklist of abusive/unsafe terms. This is NOT a
 * substitute for a real moderation API — it exists to keep a public
 * endpoint from being a free text-to-speech-for-garbage pipe.
 */

export const AI_PROMPT_MAX_LENGTH = 2000;

/** Short, deliberately conservative list; keep it maintainable. */
const BLOCKLIST: readonly string[] = [
  "self-harm",
  "suicide",
  "bomb",
  "explosives",
  "school shooting",
  "nazi",
  "child abuse",
];

/**
 * Word-boundary match (case-insensitive) so ordinary words that merely
 * contain a blocklist substring (e.g. "bombastic") are not false positives.
 */
function buildBlocklistPatterns(): readonly RegExp[] {
  return BLOCKLIST.map((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BLOCKLIST_PATTERNS: readonly RegExp[] = buildBlocklistPatterns();

export interface ModerationResult {
  allowed: boolean;
  /** Short machine-readable reason when disallowed ("too-long" | "blocked-term"). */
  reason?: string;
}

export function moderatePrompt(prompt: string): ModerationResult {
  if (prompt.length > AI_PROMPT_MAX_LENGTH) {
    return { allowed: false, reason: "too-long" };
  }
  for (const pattern of BLOCKLIST_PATTERNS) {
    if (pattern.test(prompt)) {
      return { allowed: false, reason: "blocked-term" };
    }
  }
  return { allowed: true };
}
