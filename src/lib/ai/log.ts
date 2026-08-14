/**
 * Structured request logging for the AI connector.
 *
 * Cost control / telemetry per docs/BACKLOG-AI-CONNECTOR.md: log one JSON
 * line per request with token counts and latency — NEVER the prompt or the
 * model output content.
 */

export interface AIRequestLogEntry {
  status: "ok" | "error";
  /** AIPatchErrorCode for failures; undefined on success. */
  code?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptVersion?: number;
}

export function logAIRequest(entry: AIRequestLogEntry): void {
  console.log(JSON.stringify({ event: "ai-request", ...entry }));
}
