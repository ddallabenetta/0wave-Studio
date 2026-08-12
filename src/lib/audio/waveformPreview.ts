/**
 * Deterministic waveform preview for a SynthState.
 *
 * Pure module: no AudioContext, no randomness. It mixes the two oscillators
 * and the noise source into a representative waveform and renders it at the
 * amplitude the amp envelope reaches at the burst moment (end of attack), so
 * a kick reads as a fat low sine, a pad as a full-width tonal wave. A
 * separate ADSR curve is drawn for the whole envelope.
 *
 * Rendering choices:
 * - The display window shows `CYCLES` periods of the *lowest enabled
 *   oscillator*, so low patches stay readable.
 * - A visibility floor keeps very slow patches from rendering flat.
 */
import { clamp } from "@/lib/music/theory";
import type { SynthState, Waveform } from "@/lib/schema/types";

const CYCLES = 3;
const SAMPLES = 128;
const NOISE_MIX_FLOOR = 1e-4;
/** Minimum relative amplitude so slow patches stay visible. */
const AMPLITUDE_FLOOR = 0.35;

export interface WaveformPreview {
  wavePath: string;
  envelopePath: string;
  /** Window length in seconds covered by the wave path. */
  windowSeconds: number;
  /** True when no enabled source has level (the patch is silent). */
  silent: boolean;
}

export function renderWaveformPreview(state: SynthState): WaveformPreview {
  const baseFreq = fundamentalFrequency(state);

  // One period of the fundamental at the lowest enabled oscillator.
  const period = 1 / Math.max(baseFreq, 1);
  const window = Math.max(period * CYCLES, 0.03);

  const maxAmp =
    (state.osc1.enabled ? state.mixer.osc1 : 0) +
    (state.osc2.enabled ? state.mixer.osc2 : 0) +
    (state.noise.enabled ? state.mixer.noise : 0);

  const wavePath = renderWave(window, baseFreq, state, Math.max(maxAmp, NOISE_MIX_FLOOR));
  const envelopePath = renderEnvelope(window, state);
  return {
    wavePath,
    envelopePath,
    windowSeconds: window,
    silent: maxAmp <= NOISE_MIX_FLOOR,
  };
}

/* --------------------------- wave path ------------------------------ */

function renderWave(window: number, baseFreq: number, state: SynthState, maxAmp: number): string {
  // Amplitude at the burst moment: right after the attack completes (or the
  // window end for very slow patches), floored for visibility.
  const t0 = Math.min(state.ampEnvelope.attack + state.ampEnvelope.decay * 0.3, window);
  const amplitude = clamp(ampEnvelopeAt(state, t0), AMPLITUDE_FLOOR, 1);

  const points: [number, number][] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = (i / SAMPLES) * window;
    const value = (sampleMix(t, baseFreq, state) / maxAmp) * amplitude;
    points.push([i / SAMPLES, clamp(value, -1, 1)]);
  }
  return pathFromPoints(points);
}

function sampleMix(t: number, baseFreq: number, state: SynthState): number {
  let sum = 0;
  if (state.osc1.enabled) {
    const f = freqFor(state.osc1, baseFreq);
    sum += state.mixer.osc1 * waveAt(state.osc1.waveform, phaseAt(t, f, state.osc1.phase));
  }
  if (state.osc2.enabled) {
    const f = freqFor(state.osc2, baseFreq);
    sum += state.mixer.osc2 * waveAt(state.osc2.waveform, phaseAt(t, f, state.osc2.phase));
  }
  if (state.noise.enabled) {
    sum += state.mixer.noise * pseudoNoise(t * baseFreq * 2 + state.noise.color * 7);
  }
  return sum;
}

function freqFor(osc: SynthState["osc1"], base: number): number {
  return base * Math.pow(2, osc.octave + osc.semitone / 12);
}

function phaseAt(t: number, freq: number, phase: number): number {
  const p = (t * freq + phase) % 1;
  return p < 0 ? p + 1 : p;
}

/** The lowest enabled oscillator's frequency (or a default when all off). */
function fundamentalFrequency(state: SynthState): number {
  const candidates: number[] = [];
  const base = 130.8128; // C3
  if (state.osc1.enabled) candidates.push(freqFor(state.osc1, base));
  if (state.osc2.enabled) candidates.push(freqFor(state.osc2, base));
  return candidates.length > 0 ? Math.min(...candidates) : base;
}

function waveAt(waveform: Waveform, p: number): number {
  switch (waveform) {
    case "sine":
      return Math.sin(2 * Math.PI * p);
    case "sawtooth":
      return 2 * p - 1;
    case "square":
      return p < 0.5 ? 1 : -1;
    case "triangle": {
      const t = p * 4;
      return t < 1 ? t : t < 3 ? 2 - t : t - 4;
    }
  }
}

/** Deterministic cheap pseudo-noise (stable across renders). */
function pseudoNoise(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/* -------------------------- envelope path --------------------------- */

function renderEnvelope(window: number, state: SynthState): string {
  const a = state.ampEnvelope.attack;
  const d = state.ampEnvelope.decay;
  const s = state.ampEnvelope.sustain;
  const r = state.ampEnvelope.release;
  const hold = clamp(window * 0.35, 0.02, 0.15);

  const times = [0, a, a + d, a + d + hold, a + d + hold + r];
  const values = [0, 1, s, s, 0];

  const x = (t: number) => clamp(t / Math.max(window, 1e-6), 0, 1);
  const y = (v: number) => 1 - v;

  const parts: string[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const px = x(times[i]);
    const py = y(values[i]);
    parts.push(`${i === 0 ? "M" : "L"} ${px.toFixed(4)} ${py.toFixed(4)}`);
  }
  return parts.join(" ");
}

/* ------------------------------ ADSR -------------------------------- */

/** Linear amp envelope at time t (seconds). */
function ampEnvelopeAt(state: SynthState, t: number): number {
  const { attack, decay, sustain, release } = state.ampEnvelope;
  if (t < attack) return t / Math.max(attack, 1e-4);
  if (t < attack + decay) {
    const d = Math.max(decay, 1e-4);
    return 1 - (1 - sustain) * ((t - attack) / d);
  }
  const tail = t - attack - decay;
  if (tail < release) return Math.max(0, sustain * (1 - tail / Math.max(release, 1e-4)));
  return 0;
}

/* --------------------------- path helpers --------------------------- */

function pathFromPoints(points: [number, number][]): string {
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(4)} ${y.toFixed(4)}`);
  }
  return parts.join(" ");
}
