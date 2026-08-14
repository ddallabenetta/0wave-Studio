"use client";

/**
 * usePatchRequest: client side of the AI Sound Connector request lifecycle.
 *
 * POSTs the user prompt + a snapshot of the current patch to /api/ai/patch
 * (implemented by the server workstream) and narrows the response on `ok`.
 * The client renders whatever shape comes back — the server is the single
 * authority over validation (docs/BACKLOG-AI-CONNECTOR.md).
 *
 * StrictMode safety: React development double-invokes effects and can remount
 * components; a new submit aborts any in-flight request and a request-id
 * guard ensures a superseded response can never clobber a newer one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AI_PROMPT_VERSION } from "@/lib/ai/types";
import type {
  AIPatchRequest,
  AIPatchResponse,
  AIPatchSuccess,
  AIPatchErrorCode,
} from "@/lib/ai/types";
import type { SynthState } from "@/lib/schema/types";

/** Error shape normalized for the UI; mirrors the contract's failure type. */
export interface PatchRequestError {
  code: AIPatchErrorCode;
  /** English fallback, shown only when the code has no localized message. */
  message: string;
  retryable: boolean;
}

export type PatchRequestState =
  | { status: "idle" }
  | { status: "loading"; prompt: string }
  | { status: "success"; prompt: string; response: AIPatchSuccess }
  | { status: "error"; prompt: string; error: PatchRequestError };

export interface PatchRequest {
  state: PatchRequestState;
  /** Send a new request; aborts and supersedes any in-flight one. */
  submit(prompt: string, currentPatch: SynthState): void;
  /** Forget the current result and return to idle. */
  reset(): void;
}

const NETWORK_FAILURE: PatchRequestError = {
  code: "internal",
  message: "Network error — check your connection.",
  retryable: true,
};

export function usePatchRequest(): PatchRequest {
  const [state, setState] = useState<PatchRequestState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic request id: only the most recent submit may write state, which
  // makes the hook safe under StrictMode remounts and double-submits.
  const requestIdRef = useRef(0);

  /* Abort any in-flight request when the owning component unmounts. */
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const submit = useCallback((prompt: string, currentPatch: SynthState) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    setState({ status: "loading", prompt });

    const body: AIPatchRequest = {
      prompt,
      currentPatch,
      promptVersion: AI_PROMPT_VERSION,
    };

    void (async () => {
      try {
        const res = await fetch("/api/ai/patch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (requestId !== requestIdRef.current) return; // superseded

        let parsed: AIPatchResponse;
        try {
          parsed = (await res.json()) as AIPatchResponse;
        } catch {
          // Non-JSON body (proxy error page, offline cache): nothing usable.
          setState({ status: "error", prompt, error: NETWORK_FAILURE });
          return;
        }
        if (parsed.ok) {
          setState({ status: "success", prompt, response: parsed });
        } else {
          setState({ status: "error", prompt, error: parsed.error });
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return; // superseded
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error", prompt, error: NETWORK_FAILURE });
      }
    })();
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, submit, reset };
}
