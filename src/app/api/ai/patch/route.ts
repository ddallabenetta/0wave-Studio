/**
 * POST /api/ai/patch — AI Sound Connector (text-to-patch).
 *
 * Full server-side flow (docs/BACKLOG-AI-CONNECTOR.md):
 *   validate request -> moderate -> rate limit -> provider (with retries)
 *   -> parse -> group-wise patch validation -> AIPatchResponse.
 *
 * The response is always the shared AIPatchResponse shape from
 * src/lib/ai/types.ts. Error codes map to HTTP statuses:
 *   400 invalid-request | 422 moderation | 429 rate-limited |
 *   401 provider-auth | 503 provider-not-configured/provider-unavailable |
 *   502 response-invalid | 500 internal.
 */
import { AI_PROMPT_VERSION, type AIPatchErrorCode, type AIPatchResponse } from "@/lib/ai/types";
import { getProviderConfig } from "@/lib/ai/config";
import { logAIRequest } from "@/lib/ai/log";
import { moderatePrompt } from "@/lib/ai/moderation";
import { AIProviderError, OpenAICompatibleProvider, type AIProviderResult } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/ai/rateLimit";
import { withRetries } from "@/lib/ai/retry";
import { validatePatch, validateRequest } from "@/lib/ai/validate";
import { getPatchJsonSchema } from "@/lib/ai/jsonSchema";
import { buildSystemPrompt } from "@/lib/ai/prompts/system";

// Route handlers are dynamic by default in this Next version, but be
// explicit: the AI call must never be prerendered or cached.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const fail = (
    status: number,
    code: AIPatchErrorCode,
    message: string,
    retryable: boolean,
    retryAfterMs?: number,
  ): Response => {
    const headers: Record<string, string> = {};
    if (retryAfterMs !== undefined && retryAfterMs > 0) {
      headers["Retry-After"] = String(Math.ceil(retryAfterMs / 1000));
    }
    return Response.json(
      { ok: false, error: { code, message, retryable } } satisfies AIPatchResponse,
      { status, headers },
    );
  };

  // 1. Parse + validate the request body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid-request", "Request body must be valid JSON.", false);
  }
  const validated = validateRequest(body);
  if (!validated.ok) {
    return fail(400, "invalid-request", validated.message, false);
  }
  const { prompt, currentPatch, promptVersion } = validated.data;

  // 2. Input moderation (length cap + basic content filter).
  const moderated = moderatePrompt(prompt);
  if (!moderated.allowed) {
    return fail(422, "moderation", "The prompt was rejected by the content filter.", false);
  }

  // 3. Per-client token bucket. In-memory => per-instance only.
  const rate = checkRateLimit(clientIdentity(request));
  if (!rate.allowed) {
    return fail(429, "rate-limited", "Too many requests — try again shortly.", true, rate.retryAfterMs);
  }

  // 4. Provider configured? (OPENAI_API_KEY present server-side.)
  const config = getProviderConfig();
  if (!config.configured) {
    return fail(503, "provider-not-configured", "AI provider is not configured on this server.", false);
  }

  const provider = new OpenAICompatibleProvider({
    apiKey: process.env.OPENAI_API_KEY ?? "",
    baseUrl: config.baseUrl,
    model: config.model,
    maxTokens: config.maxTokens,
  });

  const messages = [
    { role: "system" as const, content: buildSystemPrompt(getPatchJsonSchema(), currentPatch) },
    { role: "user" as const, content: prompt },
  ];

  // 5. Provider call (retryable failures only), then parse + validate.
  const latencyStart = Date.now();
  try {
    const result: AIProviderResult = await withRetries(() => provider.complete(messages));
    const latencyMs = Date.now() - latencyStart;
    const usage = { ...result.usage, latencyMs };

    // Unparseable output is a model failure, not a server failure.
    let parsed: unknown;
    try {
      parsed = parseModelJson(result.text);
    } catch {
      logAIRequest({
        status: "error",
        code: "response-invalid",
        latencyMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        promptVersion,
      });
      return fail(502, "response-invalid", "The model did not return valid JSON.", false);
    }
    const raw = isRecord(parsed) ? parsed : {};
    const hasPatchKey = "patch" in raw;
    const rationale = typeof raw.rationale === "string" ? raw.rationale : "";
    const { patch, appliedGroups, rejectedGroups } = validatePatch(raw.patch);

    // 6. Nothing usable came back (no patch key, no rationale, nothing
    // applied): a model failure — the client should offer manual creation.
    if (!hasPatchKey && rationale.trim().length === 0 && appliedGroups.length === 0) {
      logAIRequest({
        status: "error",
        code: "response-invalid",
        latencyMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        promptVersion,
      });
      return fail(502, "response-invalid", "The model did not return a usable patch.", false);
    }

    // 7. Success.
    logAIRequest({
      status: "ok",
      latencyMs,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      promptVersion,
    });
    return Response.json(
      {
        ok: true,
        proposal: { patch, rationale },
        appliedGroups,
        rejectedGroups,
        usage,
        // The server is the authority on the prompt it actually used.
        promptVersion: AI_PROMPT_VERSION,
      } satisfies AIPatchResponse,
      { status: 200 },
    );
  } catch (error) {
    const latencyMs = Date.now() - latencyStart;
    if (error instanceof AIProviderError) {
      const status = error.code === "provider-auth" ? 401 : 503;
      const message =
        error.code === "provider-auth"
          ? "The AI provider rejected the server's API key."
          : "The AI provider is temporarily unavailable — try again shortly.";
      logAIRequest({ status: "error", code: error.code, latencyMs, promptVersion });
      return fail(status, error.code, message, error.retryable);
    }
    // 8. Unexpected failure.
    logAIRequest({ status: "error", code: "internal", latencyMs, promptVersion });
    return fail(500, "internal", "An unexpected error occurred.", false);
  }
}

/**
 * Parse the model's text as JSON, tolerating markdown code fences the model
 * may wrap the payload in despite the instructions.
 */
function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

/** Client identity for rate limiting: first x-forwarded-for value. */
function clientIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "local";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
