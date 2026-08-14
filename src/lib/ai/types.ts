/**
 * Shared contract for the AI Sound Connector (text-to-patch).
 *
 * Imported from the server (route handler, lib/ai) and the client (types
 * only, erased at compile time). The server is the single authority over
 * validation; the client renders whatever shape comes back.
 *
 * Spec: docs/BACKLOG-AI-CONNECTOR.md
 */
import type { SynthState } from "../schema/types";

/** Version of the prompt templates in src/lib/ai/prompts/. Bump on change. */
export const AI_PROMPT_VERSION = 1;

/** One field group of SynthState; validated atomically. */
export type PatchGroupName = keyof SynthState;

/** What the model may return: patch data only, never code. */
export interface PatchProposal {
  patch: Partial<SynthState>;
  rationale: string;
}

export interface AIPatchRequest {
  /** The user's description of the desired sound. */
  prompt: string;
  /** Current patch snapshot, sent so the model can make relative edits. */
  currentPatch?: SynthState;
  /** Prompt version used by the client; server falls back to its own. */
  promptVersion?: number;
}

export interface AIPatchUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface AIPatchSuccess {
  ok: true;
  proposal: PatchProposal;
  /** Groups accepted from the model output and clamped. */
  appliedGroups: PatchGroupName[];
  /** Groups the model returned but were rejected (or missing). */
  rejectedGroups: PatchGroupName[];
  usage: AIPatchUsage;
  promptVersion: number;
}

export type AIPatchErrorCode =
  | "invalid-request"
  | "moderation"
  | "rate-limited"
  | "provider-not-configured"
  | "provider-auth"
  | "provider-unavailable"
  | "response-invalid"
  | "internal";

export interface AIPatchFailure {
  ok: false;
  error: {
    code: AIPatchErrorCode;
    /** English fallback; the client localizes by code. */
    message: string;
    retryable: boolean;
  };
}

export type AIPatchResponse = AIPatchSuccess | AIPatchFailure;
