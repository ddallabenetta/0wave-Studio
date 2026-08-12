# Handoff

Written at the end of the first build pass. It records what is done, what is
**not** done, and what the next person should do first. Nothing here is
roadmap phrasing: every gap below is a real gap in the code as it stands.

Companion docs: `docs/ARCHITECTURE.md` (layers), `docs/DECISIONS.md` (why),
`docs/DEPLOYMENT.md` (production checklist), `README.md` (limitations,
browser matrix).

## 1. State at handoff

Runnable: `pnpm install && pnpm dev`, then `/studio`. Production path
(`pnpm build && pnpm start`) was smoke tested and serves `/`, `/studio`,
`/playground`, `/login` with zero console errors.

Gate checks at handoff:

| Command | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm test` | 59 passed, 5 files |
| `pnpm build` | 5 routes, static, proxy compiled |

Verified in a real browser (Chromium), by measurement rather than by
inspection: audible synth output on the oscilloscope, cutoff driven from the
keyboard collapsing the waveform, Pattern Editor and Piano Roll editing one
shared `NoteEvent` list, `Use in Playground` creating exactly one track, no
second `AudioContext` on route change, transport advancing and resetting,
audio clips audible with instrument tracks muted, WAV import decoded to a real
waveform, project surviving a full reload, and export/import round-tripping a
131 KB project file including the audio blob.

## 2. Not done in this pass

### 2.1 Implemented but never verified against real infrastructure

These paths are written, typed and reviewed, but they have never executed
against the real service. Treat them as unproven.

- **Supabase, entirely.** `supabase/migrations/0001_init.sql`,
  `supabase/storage.md`, `src/lib/persistence/supabase/*`, `src/proxy.ts`,
  `src/app/login`. No project, no credentials, so no migration was applied, no
  RLS policy was exercised, no magic link was sent, no signed URL was fetched.
  The local-first path does not depend on any of it, which is why the app runs.
- **Microphone capture.** `src/components/studio/RecordPanel.tsx` and
  `src/lib/audio/input.ts`. Headless Chrome has no audio input, so permission
  granted, permission denied, no device, device disconnected mid-take and
  codec fallback were all exercised only through code review.
- **Safari and Firefox.** The browser matrix in the README is derived from
  documented API support, not from a run. Safari is the risk: `MediaRecorder`
  mime types, `AudioContext` resume rules, and `<input type=file>` accept
  behaviour all differ.
- **Vercel deploy.** Build passes locally; nothing was pushed. HTTPS is a hard
  requirement for the microphone, so recording cannot be validated until it is
  deployed.

### 2.2 Not implemented, deferred deliberately

- **End to end tests.** `@playwright/test` is installed as a devDependency but
  there is not a single spec and no `test:e2e` script. The browser verification
  described above was done by driving Chromium interactively, which is not
  reproducible in CI. This is the single largest testing gap.
- **Load and stress testing.** The brief asks for fluid interaction with 8
  concurrent voices and with a pattern of at least 200 notes. Eight voices were
  exercised; 200 notes were not. Piano roll rendering is one absolutely
  positioned element per note with no virtualisation, so this is exactly where
  it will hurt first.
- **AI connector** (`docs/BACKLOG-AI-CONNECTOR.md`). Specified, not built. No
  provider adapter, no JSON Schema wiring, no cost control.
- **Landing page and accounts.** `/` redirects to `/studio` by design. There is
  no marketing page, no signup funnel, no anonymous to permanent account
  migration. The Taste Skill work for a landing page is untouched on purpose;
  see the scope note in `docs/TASTE-PREFLIGHT.md`.
- **Time-stretch, independent pitch shifting, warp.** Not attempted. Clip
  length does not change the material.
- **Rubber-band selection in the piano roll.** Multi-select is shift-click only.
- **Per-track effect chain UI.** The engine (`TrackBus`, `setTrackEffects`) and
  the schema both carry per-track effects; the Playground inspector exposes
  only volume, pan, mute and solo. Effects are edited on the sound in the
  Studio.
- **Bounce, render and WAV export.** Sample edits stay non-destructive forever;
  there is no way to flatten them into a new asset.
- **Web MIDI, automation lanes, modulation matrix, MPE, microtuning, PWA and
  offline mode.** All listed as post-MVP in the brief, none started.
- **Locale switching.** Both dictionaries are complete: 206 keys each, and
  `Strings = typeof en` makes a missing Italian key a compile error. 54 values
  are identical by design because the term does not translate (Solo, Pan, BPM,
  Reverb, Init Patch). What is missing is only the switcher and the routing:
  `src/i18n/index.ts` resolves `strings` once at import time to
  `DEFAULT_LOCALE`. Making it reactive means moving that resolution into a
  context provider, which touches every component that imports `strings`.

### 2.3 Loose ends in the repository

- **Nothing is committed.** `git log` shows only the initial LICENSE commit and
  21 untracked paths, including all source. Commit before anything else.
- **`.claude/` and `.agents/` are untracked.** `.agents/skills/` holds the
  installed Taste Skill pinned by `skills-lock.json`; decide whether to commit
  it or ignore it. `.claude/` is local agent config and should probably be
  ignored.
- **No CI.** No workflow runs typecheck, lint, test or build on push.
- **Playwright is a dependency with no user.** Either write the specs in section
  3 or remove the package.
- **Undo is snapshot-based** with a 100 entry limit
  (`src/lib/state/project-store.ts`). Continuous knob drags coalesce into the
  surrounding edit instead of producing one entry per pixel. Acceptable, but it
  is a decision the next person should know about rather than discover.
- **Audio clips are rescheduled for a bounded 16 transport loop passes**
  (`LOOP_PASSES` in `src/components/playground/usePlaybackSync.ts`). Long
  unattended loops will eventually stop retriggering clips. The correct fix is
  rescheduling on the loop callback rather than pre-scheduling a fixed count.

## 3. Next steps, in order

The ordering is deliberate: prove what is unproven before adding surface.

1. **Commit the tree and add CI.** One commit, then a GitHub Actions workflow
   running `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
   Done when a pull request shows four green checks.

2. **Write the Playwright specs.** Minimum set, all of which mirror checks
   already performed by hand:
   - start audio, hold a key, assert the oscilloscope canvas has lit pixels;
   - create a sound, `Use in Playground`, assert exactly one track appears;
   - add four steps, switch to the Piano Roll, assert four notes with matching
     labels, move one, switch back, assert the step grid followed;
   - press play, sample `positionBeats` twice, assert it advanced, stop, assert
     it reset;
   - reload the page, assert track, pattern and notes survive.
   Add a `test:e2e` script and run it in CI against `next start`.
   Done when the suite passes twice in a row with no fixed sleeps beyond
   readiness waits.

3. **Stand up Supabase for real.** Create the project, apply
   `supabase/migrations/0001_init.sql`, create the private `audio-assets`
   bucket with the policies in `supabase/storage.md`, fill `.env.local` from
   `.env.example`, then exercise each access mode: `PUBLIC_LOCAL`,
   `ANONYMOUS_CLOUD`, `ACCOUNT_REQUIRED`. Verify with two accounts that neither
   can read the other's rows or objects.
   Done when a project created in one browser profile loads in another after
   login, and cross-account reads return empty rather than data.

4. **Deploy to Vercel and validate the microphone over HTTPS.** Run through
   `docs/DEPLOYMENT.md`. On the deployed URL, test permission granted,
   permission denied, no input device, and disconnecting the device mid-take.
   Safari is part of this step, not a later one.
   Done when a take recorded on the deployed site opens in the Sample Editor
   and can be saved and used in the Playground.

5. **Stress the piano roll.** Generate a 200 note pattern, measure drag latency
   and frame time. If it degrades, virtualise by rendering only the notes
   inside the scrolled window; the grid already knows `pixelsPerBeat`,
   `scrollTop` and `clientHeight`, so the change is local to
   `src/components/playground/PianoRoll.tsx`.
   Done when dragging a note in a 200 note pattern holds 60fps.

6. **Fix audio clip loop scheduling properly.** Replace the 16 pass
   pre-schedule with rescheduling driven by the transport `onLoop` event.
   Done when a clip still retriggers after five minutes of looping.

7. **Then, and only then, add surface.** In brief order: per-track effect chain
   UI, rubber-band selection, locale switcher, bounce to asset, and the AI
   connector from `docs/BACKLOG-AI-CONNECTOR.md`.

## 4. Landmines, read before editing

Each of these caused a real bug during this pass and will cause it again.

- **React StrictMode double-invokes effects in development.** Preset seeding and
  the `Use in Playground` handoff both create duplicates unless guarded by a
  module-scoped ref and unless they read fresh state via
  `useProjectStore.getState()` rather than a captured render value.
- **The audio engine is a singleton created lazily by whichever component asks
  first.** Never rely on creation order to wire callbacks; use
  `engine.setEvents()`, which replaces the sinks after construction.
- **CSS layering is load-bearing.** The `.material-*` classes live in
  `@layer components` in `src/app/globals.css`. Unlayered CSS beats every
  Tailwind utility in v4, which is how a white-on-white primary button shipped
  through several review passes.
- **Audio node graph must never leak into serializable state.** Anything stored
  in the project store must survive `structuredClone`. The engine holds nodes;
  the store holds numbers.
- **`ConvolverNode` can reject an impulse response** when the context sample
  rate does not match the buffer, which happens in headless Chrome. The reverb
  now degrades to dry instead of throwing; keep that shape when touching
  `src/lib/audio/effects.ts`.
- **Next 16 renamed `middleware` to `proxy`.** The file is `src/proxy.ts`. Do
  not recreate `src/middleware.ts`.
- **The product name is `0wave Studio`.** The wordmark is set in Geist Mono
  specifically so the zero is slashed and cannot be read as `Owave`.

## 5. Picking this up cold

```bash
pnpm install
pnpm dev            # http://localhost:3000 -> /studio
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Read in this order: `docs/ARCHITECTURE.md` for the layer boundaries,
`docs/AUDIO-ENGINE.md` for the clock and scheduling model, then
`docs/PROJECT-SCHEMA.md` because every feature eventually touches the schema.
`docs/DECISIONS.md` explains the ten choices that constrain everything else.
