# Architectural Decisions - 0wave Studio

Format: one ADR per section. Newest at the bottom. Decisions are project-wide unless scoped.

## ADR-001: Single Next.js application, no monorepo

**Status:** accepted (2026-08-12)

One Next.js App Router app with strict internal boundaries (`lib/audio`, `lib/state`, `lib/schema`, `lib/persistence`, `components/*`). A monorepo buys nothing at this size and slows iteration. Package manager: pnpm.

## ADR-002: Custom transport scheduler instead of Tone.js

**Status:** accepted (2026-08-12)

The brief allows Tone.js "if the spike confirms suitability". Spike conclusion: not used.

Reasons:

- Tone wraps its own `AudioContext` (`Tone.getContext()`); running it against our shared context requires `Tone.setContext()` glue that has historically been version-fragile, and we would own the fallback anyway.
- The scheduling model we need (patterns, clips, loop range, swing, count-in) is small: a lookahead scheduler ticking every 25 ms, scheduling events against `AudioContext.currentTime` up to 120 ms ahead. `setInterval` only wakes the scheduler; the musical clock is the audio clock, so there is no audible jitter and no drift.
- Deterministic: the scheduler is pure enough to unit-test against a fake clock. Tone's Transport is not.
- Zero dependency risk for the most stability-critical code in the product (P0).

Consequences: we implement and test the scheduler ourselves (`lib/audio/transport.ts`). AudioWorklet stays an extension point (`lib/audio/worklet/`) for future custom DSP; the MVP does not need it.

## ADR-003: Framework-independent audio engine behind `IAudioEngine`

**Status:** accepted (2026-08-12)

`lib/audio` imports no React, no zustand, no Next APIs. UI talks to the engine through `IAudioEngine` (`lib/audio/api.ts`) only. The engine is a browser singleton created lazily via dynamic `import()` (so no Web Audio code runs during SSR) and initialized only from a user gesture. React subscribes to engine events (status, position, clip) at display rate (~30 Hz), never at audio rate.

## ADR-004: One canonical `NoteEvent` model

**Status:** accepted (2026-08-12)

Pattern Editor and Piano Roll are two views over `Pattern.notes: NoteEvent[]`. Both write through the same store actions. The step grid is a quantized projection: notes that fall off the grid remain valid in the model and keep their exact timing; the grid shows them at their nearest step without destroying data.

## ADR-005: Live-update shared sounds, undo locally, explicit duplicate

**Status:** accepted (2026-08-12)

When a sound used in the Playground is edited in the Studio, the change is live (tracks reference `soundId`, not a copy). Local undo covers mistakes. `Duplicate before editing` is offered when the sound is in use by ≥1 track. This is the simplest strategy that keeps Studio→Playground iteration immediate, and it is documented in `docs/STUDIO.md`.

## ADR-006: Snapshot undo/redo with structural sharing

**Status:** accepted (2026-08-12)

Undo stores previous immutable `Project` snapshots (immer produces structural sharing, so memory stays bounded), capped at 100 entries. High-frequency non-destructive updates (knob drags) mark mutations `undoable:false` and coalesce. Trade-off: coarse granularity, but zero per-action command boilerplate and no chance of undo drifting from the actual state.

## ADR-007: Tailwind v4 utility layer + CSS custom property tokens

**Status:** accepted (2026-08-12)

Design tokens (colors, radii, materials) live as CSS custom properties in `globals.css`, bridged into Tailwind v4 via `@theme inline`. No shadcn default theme. Icons: Phosphor only, `weight="bold"`, one family. Fonts: Geist + Geist Mono via `next/font/google` (self-hosted by Next at build time; no runtime font CDN).

## ADR-008: Local-first persistence, Supabase behind an adapter

**Status:** accepted (2026-08-12)

IndexedDB (via `idb`) is the system of record by default: projects as validated JSON, audio blobs in a separate store keyed by `AudioAsset.localBlobKey`. `ProjectRepository` is the seam; the Supabase implementation sits behind it. Access mode is one validated env var (`NEXT_PUBLIC_ZEROWAVE_ACCESS_MODE`): `PUBLIC_LOCAL` (default), `ANONYMOUS_CLOUD`, `ACCOUNT_REQUIRED`. Conflict strategy: last-write-wins on `updated_at`, declared.

## ADR-009: zod validation at every persistence boundary

**Status:** accepted (2026-08-12)

`lib/schema/schemas.ts` validates on IndexedDB load, project import, and Supabase sync. `migrations.ts` upgrades older payloads before validation; schema changes require bumping `SCHEMA_VERSION` plus a migration. This is also the validation layer for the future AI connector output (see `docs/BACKLOG-AI-CONNECTOR.md`).

## ADR-010: Desktop-first, honest below 1024px

**Status:** accepted (2026-08-12)

Minimum usable width is 1024px. Below that the body scrolls horizontally (`min-width: 1024px`) instead of faking a mobile experience the product does not have.

## ADR-011: A pattern's instrument is its placement

**Status:** accepted (2026-08-16)

A `Pattern` holds notes and nothing else. The instrument it is heard through is
derived from the arrangement — the clip that plays it, that clip's track, that
track's `soundId` — and never stored on the pattern or chosen in a note editor.
`components/playground/patternTarget.ts` is the single resolver (selected clip →
selected track → first placement); the editors display the answer and audition
with it, and dragging a clip to another lane is the whole gesture for changing
instrument.

Consequences: a pattern created from the Playground is placed as it is created,
so it always has an instrument; an unplaced pattern is honestly reported as
silent rather than being auditioned with an arbitrary sound; and the same
pattern placed on two tracks is two voices of one idea, with the editors
following whichever placement is selected.

## ADR-012: Auditions play on the track's engine, not the preview engine

**Status:** accepted (2026-08-16)

Playground previews (a step, a note, a pattern card) go through
`previewTrackNotes` on the track's own sound engine and bus, not through the
Studio preview pair. Scheduling reuses the transport's model — a 25 ms tick
handing notes to the voice with exact context times inside a 120 ms lookahead —
so auditions layer over a running arrangement, obey the track's mix, and can be
cancelled by dropping their queued notes without silencing anything already
sounding.

Consequences: an audition is silent when the track has no sound, which the UI
states rather than hides; and the synth voice pool grows on demand (8 → 32 per
engine) so layering an audition over playback adds voices instead of stealing
them.
