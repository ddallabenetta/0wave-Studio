# Guidance and motion

Two systems that cut across every screen: the layer that explains the
instrument to people who do not make music, and the motion vocabulary the
whole interface animates with.

## The problem being solved

0wave Studio was built as an instrument for people who already know what an
oscillator is. Every label was a term of art, the first screen was a
synthesizer with a patch already open, and an empty Playground asked for a
track, a sound, a pattern, a clip and a set of notes before it would make a
single sound. Someone curious about making a beat had no way in.

The response is not to hide the instrument or rename its parts. Renaming
strands the people who already have the vocabulary, and hiding controls
makes the app less capable. Instead the real names stay, and an
explanation is always one hover, tap or focus away.

## Guidance layer

State lives in `lib/state/guide-store.ts` and persists to `localStorage`
under `0wave-guide`. It is hydrated in an effect from `AppShell`, never
during render, so server and client markup agree; `hydrated` is false until
then and nothing that depends on stored state renders.

| Piece | File | What it does |
|---|---|---|
| Welcome overlay | `components/guide/WelcomeOverlay.tsx` | First run. Three real starting points: open the sound picker, build a starter loop, or just explore. Waits for the audio gate so two overlays never stack. |
| Guided tour | `components/guide/TourGuide.tsx` | Four stops. A spotlight ring glides between elements carrying `data-tour="<step>"`; a step with no target on the current page centres its card instead of stalling. Never blocks the app — the overlay is pointer-transparent apart from its own card. |
| Hints | `components/guide/HelpTip.tsx` | `HelpTip` (the "?" and its popover), `PlainLabel` (term + tip), `ExplainNote` (a sentence shown only while hints are on). |
| Guide menu | `components/guide/GuideMenu.tsx` | Top bar. Toggles hints, replays the welcome, starts the tour (navigating to the Studio first, where its targets are). |

Hints default to **on**. Switching them off in the Guide menu returns the
interface to exactly what it was before this layer existed: `ExplainNote`
renders nothing, and the "?" affordances drop back to a quiet outline.

### Glossary

`strings.glossary` holds 33 terms, each with the real `term` and a one
sentence `plain` explanation, in English and Italian. `HelpTip` takes a
`TermId` (`keyof typeof strings.glossary`), so a typo is a type error and a
term can never be shown without a translation.

The explanations describe what a control *does to the sound*, not what it is
in signal-processing terms. "Removes part of the sound. Closing it is like
putting a lid on: darker and further away" is useful to a newcomer; "a
resonant low-pass filter" is not.

### Starter loop

`lib/presets/starterLoop.ts` builds four tracks (kick, snare, hats, bass),
one bar each, looping over four bars, using the library's own preset sounds
so editing one in the Studio audibly changes the loop. Everything it creates
is ordinary project state with no special status.

Track volumes are set below the 0.8 default deliberately: four parts at the
default sum past the master's headroom and light the clipping indicator on
the very first play. `tests/unit/starter-loop.test.ts` covers this along with
the loop actually producing notes.

## Motion

Defined once in `app/globals.css`, above the reduced-motion switch.

**Tokens.** Four curves (`--ease-out-expo` for arrivals, `--ease-spring` for
things that should feel physical, `--ease-in-out` for two-way travel, linear
for loops) and a five-step duration scale from `--dur-1` (a state flip) to
`--dur-5` (an ambient loop nobody should consciously notice).

**Rules of the house.**

- Entrances are `--dur-4` or shorter and use `both` fill, so a killed
  animation still leaves the element in its final state.
- Looping animations are ambient only. Nothing is the sole carrier of
  information.
- Only `transform`, `opacity` and `filter` animate. Never layout.
- State that a control communicates through motion is also communicated
  another way (weight, material, an accessible name).

**Reduced motion** is one global block rather than per-rule guards, so a
component added later cannot forget to opt out. Entrances collapse to 1ms
and keep their final state; loops stop after one pass; ambient orbs, halos
and shimmers are switched off entirely.

### Named animations

`owave-fade`, `owave-rise`, `owave-rise-sm`, `owave-slide-in`, `owave-pop`,
`owave-sheen`, `owave-ring`, `owave-breathe`, `owave-bob`,
`owave-spin-slow`, `owave-drift-a`/`-b`, `owave-shimmer`, `owave-trace`,
`owave-flash` — exposed as `.anim-*` utilities, plus `.stagger` for lists,
`.hover-lift` for cards, `.sheen` for filled buttons, `.ambient-orb` and
`.grain` for overlay backdrops.

A sheen's opacity belongs to its keyframes, not to the `:hover` rule. A
static `opacity: 1` on hover or focus leaves the highlight frozen across the
element once the animation ends — which is precisely the thing it must not
do.

## Extending it

- New jargon in the UI: add the term to `strings.glossary` in both
  dictionaries, then attach `<HelpTip term="…" />` next to the label.
- New tour stop: add it to `TOUR_STEPS`, add `guide.tour.<step>` copy to both
  dictionaries, and put `data-tour="<step>"` on the target.
- New animation: add the keyframes and a `.anim-*` utility to `globals.css`
  rather than an inline `@keyframes` in a component, so the reduced-motion
  switch and the shared curves apply for free.
