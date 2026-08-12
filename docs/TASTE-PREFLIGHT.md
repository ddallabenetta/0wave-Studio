# Taste Skill Pre-Flight

Skill: `design-taste-frontend` (`Leonxlnx/taste-skill`), content hash
`6d838b246d0e35d0b53f4f23f98ba7a1dd561937e64f7d0c7553b0928e376c3e`.

**Design Read:** a desktop-first creative audio instrument for musicians and
curious sound designers, divided into two focused environments: Studio for
building sounds and Playground for composing with them. The visual language is
minimal, industrial and tactile, inspired by compact music hardware without
copying any specific product.

**Dials:** `DESIGN_VARIANCE: 5` · `MOTION_INTENSITY: 3` · `VISUAL_DENSITY: 7`.

**Scope note.** The skill is written for landing pages, portfolios and
redesigns, and says so in its own "Out of scope" section. 0wave Studio is dense
product UI. Applied here: brief inference, anti-default discipline, hierarchy,
colour and shape consistency, dependency verification, accessibility, complete
interaction states, and the final pre-flight. Not applied: hero rules, eyebrow
budget, section-layout variety, marquees, scroll choreography, logo walls,
testimonials. Those land on the future landing page (backlog 21.2).

## Checklist

| Check | Result |
|---|---|
| Brief inference declared | Yes, in README and above |
| Dials explicit and reasoned | Yes, 5 / 3 / 7, from the brief |
| Aesthetic labeled honestly | Native CSS + Tailwind v4 tokens; no design-system kit; Radix not used |
| Zero em-dashes in UI copy and docs | Verified by grep across `src/`, `docs/`, `README.md` |
| Page theme lock | One light theme across both sections; no mid-page inversion. Dark "display" material is a component surface (scope, spectrum, piano-roll black keys), not a theme flip |
| Colour consistency lock | One accent hue, three tonal steps (`--accent`, `--accent-ink`, `--accent-glow`). Semantic record/error/warning/success are separate and used only for state |
| Shape consistency lock | Documented scale: panels 12px, controls/displays 6px, clips 3px, knobs circular by function |
| Button contrast | Fixed during verification: primary CTA measured 3.4:1, accent darkened to `#c8420a` for 4.8:1 against `--accent-on`; accent text uses `--accent-ink` at 5.8:1 |
| CTA wrap | No CTA wraps at 1440px; labels are 1-3 words |
| Form contrast | Inputs use `material-sunken` with `--ink` text; placeholders `--ink-faint` on light surfaces |
| Serif discipline | No serif. Geist Sans for UI, Geist Mono for values, note names, BPM, positions |
| Fonts | `next/font/google`, self-hosted at build. No runtime font CDN |
| Icons | Phosphor only, one family, consistent weights. No hand-rolled SVG icons |
| Anti-default discipline | No AI-purple, no glassmorphism, no gradient hero, no three-equal-cards, no generic SaaS dashboard chrome |
| Cards used only for real hierarchy | Panels group signal-flow sections; lists use dividers, not card stacks |
| Shadows tinted to background | Bevels and shadows derive from `--bevel-*` on the base hue; no pure black |
| Interactive states | hover, active (1px physical press), focus-visible ring, selected (sunken + weight, not colour alone), disabled (opacity + no shadow) |
| Loading / empty / error states | Import busy state, library empty state, record permission/device/codec errors, save and quota errors, audio unsupported state |
| Motion motivated | Only 120ms transform/opacity/colour transitions on controls, plus the pressed-state translate. No scroll-driven animation, no marquee, no infinite loops |
| Reduced motion | Transitions gated behind `prefers-reduced-motion: no-preference` |
| No `window.addEventListener('scroll')` | Verified by grep; scroll sync uses element `onScroll` only |
| Z-index restraint | Two layers only: gate overlay `z-50`, timeline ruler `z-10` |
| Real content, no fakes | No fake screenshots, no placeholder data, no invented metrics. Every meter, waveform and analyser reads real audio |
| Dependency verification | Every import checked against `package.json`; no new runtime deps beyond the declared set |
| Accessibility | Knobs and faders are real sliders with `aria-valuenow`/`aria-valuetext`, keyboard driven (arrows, Page Up/Down, Home/End, reset); segmented controls are radiogroups with roving tabindex; icon buttons carry labels; the audio gate is focus-trapped-by-position and Enter-activatable |
| Core Web Vitals plausible | Static shells, no blocking third-party requests, fonts self-hosted, canvases sized to devicePixelRatio |

## Deliberate deviations

1. **No dark mode.** The skill calls dual-mode mandatory for consumer pages.
   The product brief specifies a cold off-white industrial palette; product
   requirements win (brief section 2, rule 10). Tokens are centralised, so a
   dark theme is a token swap when it is actually wanted.
2. **High density.** `VISUAL_DENSITY: 7` means tight padding and mono numerals
   throughout; the skill's airy landing-page spacing does not apply.
3. **Grid lines as structure.** The skill bans decorative hairline grids. Here
   the timeline and piano-roll grids encode musical time, so they stay.

## Failures found and fixed during pre-flight

- Primary CTA rendered near-white on near-white: unlayered `.material-*` CSS
  was overriding Tailwind utilities. Fixed by moving base and component styles
  into `@layer base` / `@layer components`.
- Accent failed WCAG AA as text and as a button fill. Fixed by darkening the
  ramp and adding a dedicated ink shade.
- The wordmark's zero read as a letter O at 14px, risking the exact "Owave"
  misspelling the brief forbids. Fixed by setting the wordmark in Geist Mono,
  whose zero is slashed.
