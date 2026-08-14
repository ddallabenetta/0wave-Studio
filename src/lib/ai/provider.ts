/**
 * Provider adapter for the AI Sound Connector (text-to-patch).
 *
 * One adapter interface; the OpenAI-compatible implementation talks to
 * `${baseUrl}/chat/completions` with plain fetch — no SDK dependency, so any
 * OpenAI-compatible endpoint (OpenAI, Together, local vLLM, ...) works.
 *
 * Error taxonomy: failures are thrown as AIProviderError with a code and a
 * retryable flag so the route can map them to HTTP responses and
 * withRetries() can decide what to retry.
 */

export type AIProviderErrorCode = "provider-auth" | "provider-unavailable";

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  /** True when the failure is transient (network, 5xx, provider 429). */
  readonly retryable: boolean;

  constructor(code: AIProviderErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface AIChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AIProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIProviderResult {
  text: string;
  usage: AIProviderUsage;
}

export interface AIProvider {
  /** Send the conversation and return the model's text plus token usage. */
  complete(messages: AIChatMessage[]): Promise<AIProviderResult>;
}

export interface OpenAICompatibleProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
}

export class OpenAICompatibleProvider implements AIProvider {
  private readonly url: string;
  private readonly options: OpenAICompatibleProviderOptions;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.options = options;
    this.url = `${options.baseUrl}/chat/completions`;
  }

  async complete(messages: AIChatMessage[]): Promise<AIProviderResult> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          // Low temperature: we want a deterministic patch, not creativity.
          temperature: 0.2,
          // Hard cap on completion tokens (cost control, see backlog spec).
          max_tokens: this.options.maxTokens,
          // Ask for a JSON object; the JSON Schema guidance lives in the
          // system prompt (this endpoint does not do structured outputs).
          response_format: { type: "json_object" },
        }),
      });
    } catch (error) {
      // fetch threw: DNS / connection / TLS failure — transient by nature.
      throw new AIProviderError("provider-unavailable", `network error: ${messageOf(error)}`, true);
    }

    if (response.status === 401 || response.status === 403) {
      throw new AIProviderError("provider-auth", `provider rejected credentials (${response.status})`, false);
    }
    if (response.status === 429) {
      throw new AIProviderError("provider-unavailable", "provider rate limited (429)", true);
    }
    if (response.status >= 500) {
      throw new AIProviderError("provider-unavailable", `provider error (${response.status})`, true);
    }
    if (!response.ok) {
      // Unexpected 4xx: our request was malformed — retrying won't help.
      throw new AIProviderError("provider-unavailable", `provider error (${response.status})`, false);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AIProviderError("provider-unavailable", "provider returned malformed JSON", false);
    }

    const content = readNested(payload, ["choices", 0, "message", "content"]);
    if (typeof content !== "string" || content.length === 0) {
      throw new AIProviderError("provider-unavailable", "provider response missing message content", false);
    }

    return {
      text: content,
      usage: {
        promptTokens: tokenCount(readNested(payload, ["usage", "prompt_tokens"])),
        completionTokens: tokenCount(readNested(payload, ["usage", "completion_tokens"])),
        totalTokens: tokenCount(readNested(payload, ["usage", "total_tokens"])),
      },
    };
  }
}

/** Read a path (["a", 0, "b"]) inside an unknown JSON value; undefined if absent. */
function readNested(value: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
