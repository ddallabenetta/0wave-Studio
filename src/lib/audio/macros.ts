/**
 * Basic-view macros: the few high-level controls the "Base" editor exposes.
 *
 * Every macro maps a normalized 0..1 value onto one or more real SynthState
 * parameters. The mapping is deterministic and invertible on its primary
 * parameter, so a slider always shows the value it produced and the patch
 * stays fully editable in the advanced view afterwards.
 *
 * The XY pad is a two-axis macro: X = brightness (log filter cutoff),
 * Y = movement (LFO depth).
 */
import { clamp } from "@/lib/music/theory";
import type { SynthState } from "@/lib/schema/types";

export type MacroId = "punch" | "vivace" | "body" | "space";

export const PAD_BRIGHTNESS_MIN_HZ = 150;
export const PAD_BRIGHTNESS_MAX_HZ = 16000;
export const PAD_MOVEMENT_MAX_DEPTH = 0.55;

/** A write the engine and store both understand. */
export interface PatchWrite {
  path: string;
  value: number | string | boolean;
}

/**
 * Percussive sounds retrigger on every basic edit; sustained sounds (pads)
 * keep a held preview note and morph linearly.
 */
export function isSustainedSound(state: SynthState): boolean {
  return state.ampEnvelope.attack >= 0.05 && state.ampEnvelope.sustain >= 0.25;
}

/* ------------------------------ XY pad ------------------------------ */

export function readPadX(state: SynthState): number {
  const f = clamp(state.filter.cutoff, PAD_BRIGHTNESS_MIN_HZ, PAD_BRIGHTNESS_MAX_HZ);
  return clamp(
    Math.log(f / PAD_BRIGHTNESS_MIN_HZ) / Math.log(PAD_BRIGHTNESS_MAX_HZ / PAD_BRIGHTNESS_MIN_HZ),
    0,
    1,
  );
}

export function readPadY(state: SynthState): number {
  return clamp(state.lfo.depth / PAD_MOVEMENT_MAX_DEPTH, 0, 1);
}

export function applyPadX(x: number): PatchWrite[] {
  const t = clamp(x, 0, 1);
  return [
    {
      path: "filter.cutoff",
      value: PAD_BRIGHTNESS_MIN_HZ * Math.pow(PAD_BRIGHTNESS_MAX_HZ / PAD_BRIGHTNESS_MIN_HZ, t),
    },
  ];
}

export function applyPadY(y: number): PatchWrite[] {
  return [{ path: "lfo.depth", value: clamp(y, 0, 1) * PAD_MOVEMENT_MAX_DEPTH }];
}

/* ------------------------------ Sliders ----------------------------- */

const MACROS: Record<
  MacroId,
  {
    read: (s: SynthState) => number;
    apply: (v: number) => PatchWrite[];
  }
> = {
  /** Fast attack + tight decay. Primary: ampEnvelope.attack. */
  punch: {
    read: (s) => 1 - valueToLogNormalized(s.ampEnvelope.attack, 0.0015, 0.12),
    apply: (v) => {
      const t = clamp(v, 0, 1);
      return [
        // v=0 → soft (slow attack), v=1 → punchy (fast attack).
        { path: "ampEnvelope.attack", value: logValue(1 - t, 0.0015, 0.12) },
        { path: "ampEnvelope.decay", value: 0.6 - 0.48 * t },
      ];
    },
  },
  /** How lively the sound moves: LFO rate, unsynced so it is always audible. */
  vivace: {
    read: (s) => valueToLogNormalized(s.lfo.rate, 0.4, 10),
    apply: (v) => {
      const t = clamp(v, 0, 1);
      return [
        { path: "lfo.sync", value: false },
        { path: "lfo.rate", value: logValue(t, 0.4, 10) },
      ];
    },
  },
  /** Second oscillator blend: body/thickness. Turns osc2 on when raised. */
  body: {
    read: (s) => valueToLinearNormalized(s.mixer.osc2, 0.04, 0.95),
    apply: (v) => {
      const t = clamp(v, 0, 1);
      const writes: PatchWrite[] = [{ path: "mixer.osc2", value: 0.04 + (0.95 - 0.04) * t }];
      if (t >= 0.05) writes.push({ path: "osc2.enabled", value: true });
      else writes.push({ path: "osc2.enabled", value: false });
      return writes;
    },
  },
  /** Reverb send. Primary: reverb mix. */
  space: {
    read: (s) => {
      const reverb = s.effects[3];
      return clamp(reverb.kind === "reverb" ? reverb.params.mix / 0.6 : 0, 0, 1);
    },
    apply: (v) => {
      const t = clamp(v, 0, 1);
      return [
        { path: "effects.3.params.mix", value: t * 0.6 },
        { path: "effects.3.bypass", value: t < 0.01 },
      ];
    },
  },
};

export function readMacro(state: SynthState, id: MacroId): number {
  return MACROS[id].read(state);
}

export function applyMacro(id: MacroId, value: number): PatchWrite[] {
  return MACROS[id].apply(value);
}

/* --------------------------- value helpers --------------------------- */

function valueToLogNormalized(value: number, min: number, max: number): number {
  const v = clamp(value, min, max);
  return clamp(Math.log(v / min) / Math.log(max / min), 0, 1);
}

function valueToLinearNormalized(value: number, min: number, max: number): number {
  return clamp((value - min) / (max - min), 0, 1);
}

function logValue(t: number, min: number, max: number): number {
  return min * Math.pow(max / min, t);
}
