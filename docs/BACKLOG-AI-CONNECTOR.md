# Backlog: AI Sound Connector (post-MVP)

Not implemented in the MVP. This is the technical spec for the first iteration,
which targets **text-to-patch**: the model returns a structured patch, never
audio and never code.

## Flow

1. User opens the connector in Studio.
2. They describe the desired sound ("a short round bass, slightly acid, fast attack, slow filter movement").
3. A provider-agnostic adapter sends the prompt to a model.
4. The model returns ONLY a structured object: `{ patch: Partial<SynthState>, rationale: string }`.
5. The result is validated against `synthStateSchema` (partial application: validate per field group).
6. Every value is clamped to the schema's admitted ranges.
7. The UI shows a diff of the current patch vs the proposal.
8. User previews the proposal on the keyboard.
9. Apply / revert / compare A-B, with undo covering "Apply".
10. The resulting sound is saved to the library and can be used in the Playground.

## Requirements

| Area | Rule |
|---|---|
| Output schema | Strict JSON Schema derived from `SynthState` (zod → JSON Schema via `zod-to-json-schema` at build time). No freeform JSON. |
| No code | The model never returns executable code; only patch data. No function calling into the engine. |
| No engine access | The model cannot invoke `noteOn`/`setParameter` directly. |
| Provider adapter | One adapter interface; at least one provider implemented (e.g. Anthropic messages API via a Next.js route handler). Server-side keys only. |
| Prompt versioning | Prompts stored in `src/lib/ai/prompts/` with version constants; the request carries the version. |
| Diff | Proposal vs current patch shown as parameter-level diff before apply. |
| Undo | Apply is one undoable store mutation. |
| Retry / fallback | Two retries with exponential backoff; on final failure show the original prompt and offer manual creation. |
| Rate limiting | Per-user token bucket in the route handler (or Supabase edge) before any model call. |
| Cost control | Model selection fixed per environment; max tokens capped; request logging with token counts. |
| Moderation | Input length cap + basic content filter server-side; reject with a user-facing message. |
| Telemetry | Optional, opt-in only: aggregate success rate and latency, never prompt content. |

## Validation boundary

Reuse `lib/schema/schemas.ts`: parse the model output group by group
(`osc1`, `filter`, `lfo`, …); discard invalid groups rather than failing the
whole proposal, and mark them as "not applied" in the diff view. This keeps the
same contract that guards persisted projects and Supabase sync.

## Out of scope for v1

- text-to-audio (generating waveforms/samples),
- multi-turn patch conversations beyond apply/revert,
- model-driven sample editing.
