/**
 * Factories and defaults for the 0wave Studio schema.
 * Every object entering the project store is built here so defaults
 * stay in one place.
 */
import {
  EFFECT_ORDER,
  SCHEMA_VERSION,
} from "./types";
import type {
  AdsrState,
  EffectKind,
  EffectState,
  OscillatorState,
  Pattern,
  Project,
  SoundDefinition,
  SynthState,
  Track,
} from "./types";

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

export function defaultAdsr(): AdsrState {
  return { attack: 0.005, decay: 0.15, sustain: 0.7, release: 0.2 };
}

export function defaultOscillator(enabled: boolean): OscillatorState {
  return {
    enabled,
    waveform: "sawtooth",
    octave: 0,
    semitone: 0,
    detuneCents: 0,
    phase: 0,
    unison: 1,
    unisonSpreadCents: 12,
  };
}

export function defaultEffect(kind: EffectKind): EffectState {
  switch (kind) {
    case "distortion":
      return { kind, bypass: true, params: { drive: 0.3, tone: 0.6 } };
    case "chorus":
      return { kind, bypass: true, params: { rate: 1.2, depth: 0.4, mix: 0.35 } };
    case "delay":
      return {
        kind,
        bypass: true,
        params: { timeBeats: 0.75, feedback: 0.35, mix: 0.25, sync: true, timeSeconds: 0.35 },
      };
    case "reverb":
      return { kind, bypass: true, params: { decay: 2.2, mix: 0.25 } };
  }
}

export function defaultEffects(): EffectState[] {
  return EFFECT_ORDER.map(defaultEffect);
}

export function defaultSynthState(): SynthState {
  return {
    osc1: defaultOscillator(true),
    osc2: { ...defaultOscillator(false), waveform: "square", detuneCents: 6 },
    noise: { enabled: false, color: 0 },
    mixer: { osc1: 0.8, osc2: 0.6, noise: 0.5 },
    filter: { mode: "lowpass", cutoff: 8000, resonance: 0.8 },
    ampEnvelope: defaultAdsr(),
    filterEnvelope: { attack: 0.005, decay: 0.25, sustain: 0.3, release: 0.3 },
    filterEnvAmount: 0,
    lfo: {
      waveform: "sine",
      destination: "filter",
      rate: 2,
      depth: 0,
      sync: false,
      syncBeats: 1,
    },
    effects: defaultEffects(),
    output: { gain: 0.8, velocitySensitivity: 0.6 },
  };
}

export function createSynthSound(name: string, origin: SoundDefinition["metadata"]["origin"] = "user"): SoundDefinition {
  return {
    id: createId(),
    type: "synth",
    name,
    metadata: { origin, tags: [], syncState: "local" },
    createdAt: now(),
    updatedAt: now(),
    synthState: defaultSynthState(),
  };
}

export function createPattern(name: string, lengthBeats = 4, resolution = 4): Pattern {
  return {
    id: createId(),
    name,
    lengthBeats,
    resolution,
    notes: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

const TRACK_COLOR_TOKENS = [
  "track-1",
  "track-2",
  "track-3",
  "track-4",
  "track-5",
  "track-6",
  "track-7",
  "track-8",
] as const;

export function trackColorForIndex(index: number): string {
  return TRACK_COLOR_TOKENS[index % TRACK_COLOR_TOKENS.length];
}

export function createTrack(name: string, type: Track["type"] = "instrument", colorIndex = 0): Track {
  return {
    id: createId(),
    type,
    name,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    colorToken: trackColorForIndex(colorIndex),
    clips: [],
    effects: defaultEffects(),
  };
}

export function createEmptyProject(name = "Untitled Project"): Project {
  return {
    id: createId(),
    schemaVersion: SCHEMA_VERSION,
    name,
    tempo: 120,
    timeSignature: { beatsPerBar: 4, beatUnit: 4 },
    loopRange: { enabled: false, startBeat: 0, endBeat: 8 },
    swing: 0,
    sounds: [],
    tracks: [],
    patterns: [],
    assets: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

export const INIT_PATCH_NAME = "Init Patch";
