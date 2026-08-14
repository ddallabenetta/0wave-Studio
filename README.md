# 0wave Studio

A web synthesizer with an essential DAW environment. Build sounds in the **Studio**, compose with them in the **Playground**.

It is meant to be usable without a background in music: the first run offers
three real starting points (design a sound, build a loop, or look around),
every term of art carries a one-sentence explanation you can switch off, and
an empty Playground will build you a four-bar loop to press play on. See
`docs/GUIDANCE.md`.

## Design Read

> Reading this as: a desktop-first creative audio instrument for musicians and curious sound designers, divided into two focused environments: Studio for building sounds and Playground for composing with them. The visual language is minimal, industrial and tactile, inspired by compact music hardware without copying any specific product.

Taste Skill dials: `DESIGN_VARIANCE: 5` · `MOTION_INTENSITY: 3` · `VISUAL_DENSITY: 7`.

Design skill: `design-taste-frontend` from `Leonxlnx/taste-skill`, content hash `6d838b246d0e35d0b53f4f23f98ba7a1dd561937e64f7d0c7553b0928e376c3e` (see `skills-lock.json`). The skill applies fully to the landing page (post-MVP); inside Studio and Playground we apply brief inference, anti-default discipline, hierarchy, color/shape consistency, accessibility, complete interaction states, and the pre-flight check. Product requirements win on conflict.

## Quickstart

```bash
pnpm install
pnpm dev        # http://localhost:3000 → /studio
pnpm typecheck
pnpm lint
pnpm test       # unit + integration (Vitest)
pnpm build      # production build
```

Supabase is optional. Without credentials the app runs in `PUBLIC_LOCAL` mode (IndexedDB only). See `docs/DEPLOYMENT.md` for the three access modes and cloud setup.

## Layout

```
src/
  app/                  Next.js App Router routes (/studio, /playground)
  components/
    shell/              Top bar, Start Audio gate, app shell
    guide/              Onboarding, guided tour, plain-language hints
    controls/           Shared tactile controls (knob, fader, toggle…)
    studio/             Synth, Record, Import, Sample Editor, Library
    playground/         Transport, tracks, timeline, editors, mixer
  lib/
    audio/              Framework-independent audio engine (no React)
    schema/             Versioned project schema + zod validation + migrations
    state/              Zustand stores (serializable project, UI-only state)
    persistence/        IndexedDB repo, autosave, import/export, access modes
    presets/            Curated system presets and the starter loop
    music/              Note/frequency math, quantization, swing
  i18n/                 Centralized UI strings (en, it)
supabase/migrations/    SQL migrations + RLS policies
docs/                   Architecture, decisions, engine, deployment…
```

## Hard rules (enforced by review)

- No fake controls: every UI control drives real engine or store state.
- Every user-facing string lives in `src/i18n`, in both dictionaries.
- Motion is defined in `globals.css` and degrades under `prefers-reduced-motion`.
- No `AudioNode` in serializable state; no React re-render at audio rate.
- One `AudioContext`, created/resumed only from a user gesture.
- Pattern Editor and Piano Roll edit the same `NoteEvent` model.
- Product name is always `0wave Studio` (zero, capital S).

## Documentation

| Doc | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | Layer boundaries, module map, SSR safety |
| `docs/DECISIONS.md` | ADR-001 to ADR-010 |
| `docs/AUDIO-ENGINE.md` | Clock, scheduling, signal path, voice management |
| `docs/STUDIO.md` | Modes, synth editor, recording, import, sample editing |
| `docs/PLAYGROUND.md` | Transport, tracks, timeline, both note editors |
| `docs/GUIDANCE.md` | Onboarding, glossary, hints, tour, motion system |
| `docs/PIANO-ROLL.md` | Interaction contract for the piano roll |
| `docs/PROJECT-SCHEMA.md` | Versioned schema and validation boundaries |
| `docs/DEPLOYMENT.md` | Vercel, Supabase, access modes, production checklist |
| `docs/BACKLOG-AI-CONNECTOR.md` | Post-MVP text-to-patch specification |
| `docs/HANDOFF.md` | State at handoff, what is unverified, next steps, landmines |
| `docs/TASTE-PREFLIGHT.md` | Taste Skill checklist, deviations, failures found |

## Browser support

| Browser | Synth + sequencer | Microphone recording | Audio import |
|---|---|---|---|
| Chrome / Edge (current) | Yes | Yes (`MediaRecorder`, WebM/Opus) | WAV, MP3, OGG, FLAC |
| Firefox (current) | Yes | Yes (WebM/Opus) | WAV, MP3, OGG, FLAC |
| Safari 17+ | Yes | Yes (MP4/AAC; pause may be unavailable) | WAV, MP3, AAC/MP4 |

Decoding is delegated to the browser, so the accepted formats are the
browser's, not a list we guarantee. Unsupported files report a clear error.
Recording requires HTTPS (or localhost). Minimum usable width is 1024px.

## Known limitations

These are real gaps, not roadmap phrasing:

- Desktop-first. Below 1024px the layout scrolls horizontally; there is no
  mobile-specific interface.
- No time-stretch and no pitch-shift with independent duration. Audio clip
  length does not warp the material.
- Multi-select in the piano roll is shift-click based; there is no rubber-band
  selection yet.
- Per-track effect chains exist in the engine and schema, but the Playground UI
  currently exposes only volume, pan, mute and solo; effects are edited on the
  sound in the Studio.
- Audio clips are rescheduled for a bounded number of transport loop passes
  (16), which covers normal sessions but is not infinite.
- Cloud sync (Supabase) is implemented behind the repository adapter but has
  not been executed against a live project; see the report in
  `docs/DEPLOYMENT.md` for exactly what remains unverified.
- Undo granularity is snapshot-based: continuous knob drags coalesce into the
  surrounding edit rather than producing one entry per pixel.

See `docs/DECISIONS.md` for architectural decisions and `docs/` for per-area documentation.
