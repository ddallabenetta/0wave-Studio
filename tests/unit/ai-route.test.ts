import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ai/patch/route";
import type { AIPatchFailure, AIPatchSuccess } from "@/lib/ai/types";
import { AI_PROMPT_VERSION } from "@/lib/ai/types";
import { resetRateLimiter } from "@/lib/ai/rateLimit";
import { defaultSynthState } from "@/lib/schema/factories";

const ENDPOINT = "http://localhost/api/ai/patch";

/** A valid OpenAI chat-completions payload wrapping the model's text. */
function chatCompletion(content: string) {
  return {
    choices: [{ message: { role: "assistant", content } }],
    usage: { prompt_tokens: 42, completion_tokens: 17, total_tokens: 59 },
  };
}

function fetchMockReturning(body: unknown, status = 200) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

function post(body: unknown, headers?: Record<string, string>): Promise<Response> {
  return POST(
    new Request(ENDPOINT, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers,
    }),
  );
}

let fetchMock: ReturnType<typeof fetchMockReturning>;

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("AI_RATE_LIMIT_PER_MINUTE", "100");
  resetRateLimiter();
  // Keep the structured request logs out of the test output.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRateLimiter();
});

describe("POST /api/ai/patch", () => {
  it("returns a validated AIPatchSuccess for a well-formed model response", async () => {
    fetchMock = fetchMockReturning(
      chatCompletion(
        JSON.stringify({
          patch: { filter: { mode: "lowpass", cutoff: 600, resonance: 3 } },
          rationale: "Round and dark.",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "a short round bass" });
    expect(response.status).toBe(200);

    const body = (await response.json()) as AIPatchSuccess;
    expect(body.ok).toBe(true);
    expect(body.proposal.patch.filter).toEqual({ mode: "lowpass", cutoff: 600, resonance: 3 });
    expect(body.proposal.rationale).toBe("Round and dark.");
    expect(body.appliedGroups).toEqual(["filter"]);
    expect(body.rejectedGroups).toEqual([]);
    expect(body.usage.promptTokens).toBe(42);
    expect(body.usage.completionTokens).toBe(17);
    expect(body.usage.totalTokens).toBe(59);
    expect(body.usage.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.promptVersion).toBe(AI_PROMPT_VERSION);
  });

  it("strips markdown code fences from the model output", async () => {
    fetchMock = fetchMockReturning(
      chatCompletion(
        "```json\n" +
          JSON.stringify({
            patch: { output: { gain: 0.9, velocitySensitivity: 0.5 } },
            rationale: "Louder.",
          }) +
          "\n```",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "louder" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as AIPatchSuccess;
    expect(body.appliedGroups).toEqual(["output"]);
  });

  it("clamps model output and reports rejected groups", async () => {
    fetchMock = fetchMockReturning(
      chatCompletion(
        JSON.stringify({
          patch: {
            filter: { mode: "lowpass", cutoff: 999999, resonance: 0.8 },
            lfo: { waveform: "sine", destination: "filter", rate: 2, depth: 0, sync: false, syncBeats: 1, extra: true },
            ampEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 },
          },
          rationale: "mix",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "mix" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as AIPatchSuccess;
    // lfo has an unknown enum-free extra key but a valid shape: lfo passes
    // (zod strips unknown keys); filter cutoff is clamped; ampEnvelope applies.
    // appliedGroups follows GROUP_ORDER, not model output order.
    expect(body.appliedGroups).toEqual(["filter", "ampEnvelope", "lfo"]);
    expect(body.proposal.patch.filter?.cutoff).toBe(20000);
  });

  it("sends the provider an OpenAI-compatible request from env config", async () => {
    vi.stubEnv("OPENAI_MODEL", "custom-model");
    vi.stubEnv("AI_MAX_TOKENS", "512");
    vi.stubEnv("OPENAI_BASE_URL", "https://llm.example.com/v1/");
    fetchMock = fetchMockReturning(chatCompletion(JSON.stringify({ patch: {}, rationale: "no-op" })));
    vi.stubGlobal("fetch", fetchMock);

    await post({ prompt: "x" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://llm.example.com/v1/chat/completions");
    const sent = JSON.parse(String(init?.body));
    expect(sent.model).toBe("custom-model");
    expect(sent.max_tokens).toBe(512);
    expect(sent.temperature).toBe(0.2);
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(init?.headers).toMatchObject({ authorization: "Bearer test-key" });
    // The system prompt must carry the JSON Schema and the current patch.
    expect(sent.messages[0].content).toContain('"patch"');
    expect(sent.messages[1].content).toBe("x");
  });

  it("sends the current patch to the model when provided", async () => {
    fetchMock = fetchMockReturning(chatCompletion(JSON.stringify({ patch: {}, rationale: "no-op" })));
    vi.stubGlobal("fetch", fetchMock);

    await post({ prompt: "x", currentPatch: defaultSynthState() });

    const [, init] = fetchMock.mock.calls[0];
    const sent = JSON.parse(String(init?.body));
    expect(sent.messages[0].content).toContain("Current patch");
  });

  it("answers 401 provider-auth when the provider rejects the key", async () => {
    fetchMock = fetchMockReturning({ error: { message: "invalid key" } }, 401);
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "x" });
    expect(response.status).toBe(401);
    const body = (await response.json()) as AIPatchFailure;
    expect(body.error.code).toBe("provider-auth");
    expect(body.error.retryable).toBe(false);
  });

  it("answers 503 provider-unavailable (retryable) on provider 5xx", async () => {
    fetchMock = fetchMockReturning({ error: { message: "overloaded" } }, 503);
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "x" });
    expect(response.status).toBe(503);
    const body = (await response.json()) as AIPatchFailure;
    expect(body.error.code).toBe("provider-unavailable");
    expect(body.error.retryable).toBe(true);
  });

  it("answers 503 provider-not-configured without calling the provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    fetchMock = fetchMockReturning(chatCompletion("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "x" });
    expect(response.status).toBe(503);
    const body = (await response.json()) as AIPatchFailure;
    expect(body.error.code).toBe("provider-not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 422 moderation for a blocklisted prompt", async () => {
    fetchMock = fetchMockReturning(chatCompletion("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "make a bomb sound" });
    expect(response.status).toBe(422);
    const body = (await response.json()) as AIPatchFailure;
    expect(body.error.code).toBe("moderation");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 429 rate-limited with Retry-After per client", async () => {
    vi.stubEnv("AI_RATE_LIMIT_PER_MINUTE", "1");
    fetchMock = fetchMockReturning(chatCompletion(JSON.stringify({ patch: {}, rationale: "no-op" })));
    vi.stubGlobal("fetch", fetchMock);

    const first = await post({ prompt: "x" }, { "x-forwarded-for": "1.2.3.4" });
    expect(first.status).toBe(200);

    const second = await post({ prompt: "x" }, { "x-forwarded-for": "1.2.3.4" });
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).not.toBeNull();
    const body = (await second.json()) as AIPatchFailure;
    expect(body.error.code).toBe("rate-limited");
    expect(body.error.retryable).toBe(true);

    // A different client is not affected.
    const other = await post({ prompt: "x" }, { "x-forwarded-for": "5.6.7.8" });
    expect(other.status).toBe(200);
  });

  it("answers 400 invalid-request for malformed or invalid bodies", async () => {
    const badJson = await post("{not json", { "content-type": "application/json" });
    expect(badJson.status).toBe(400);
    expect(((await badJson.json()) as AIPatchFailure).error.code).toBe("invalid-request");

    const empty = await post({});
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as AIPatchFailure).error.code).toBe("invalid-request");

    const tooLong = await post({ prompt: "x".repeat(2001) });
    expect(tooLong.status).toBe(400);
  });

  it("answers 502 response-invalid when the model output is unusable", async () => {
    fetchMock = fetchMockReturning(chatCompletion(JSON.stringify({ hello: "world" })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "x" });
    expect(response.status).toBe(502);
    const body = (await response.json()) as AIPatchFailure;
    expect(body.error.code).toBe("response-invalid");
    expect(body.error.retryable).toBe(false);
  });

  it("answers 502 response-invalid when the model output is not JSON", async () => {
    fetchMock = fetchMockReturning(chatCompletion("sure, here is a patch: no"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ prompt: "x" });
    expect(response.status).toBe(502);
    expect(((await response.json()) as AIPatchFailure).error.code).toBe("response-invalid");
  });
});
