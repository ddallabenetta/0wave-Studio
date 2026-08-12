/**
 * Runtime validation for the 0wave Studio project schema (zod).
 * Used at persistence boundaries: IndexedDB load, project import,
 * Supabase sync, and the future AI connector output validation.
 */
import { z } from "zod";
import { EFFECT_ORDER, SCHEMA_VERSION } from "./types";
import type {
  AdsrState,
  AudioAsset,
  Clip,
  EffectState,
  NoteEvent,
  Pattern,
  Project,
  SoundDefinition,
  Track,
} from "./types";

const id = z.string().min(1);
const iso = z.string().min(1);
const beats = z.number().finite().min(0);
const unit = z.number().min(0).max(1);

const waveform = z.enum(["sine", "triangle", "sawtooth", "square"]);
const filterMode = z.enum(["lowpass", "highpass", "bandpass"]);

export const adsrSchema: z.ZodType<AdsrState> = z.object({
  attack: z.number().min(0).max(10),
  decay: z.number().min(0).max(10),
  sustain: unit,
  release: z.number().min(0).max(30),
});

const oscillatorSchema = z.object({
  enabled: z.boolean(),
  waveform,
  octave: z.number().int().min(-4).max(4),
  semitone: z.number().int().min(-12).max(12),
  detuneCents: z.number().min(-100).max(100),
  phase: unit,
  unison: z.number().int().min(1).max(8),
  unisonSpreadCents: z.number().min(0).max(100),
});

const filterSchema = z.object({
  mode: filterMode,
  cutoff: z.number().min(20).max(20000),
  resonance: z.number().min(0.1).max(24),
});

export const effectSchema: z.ZodType<EffectState> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("distortion"),
    bypass: z.boolean(),
    params: z.object({ drive: unit, tone: unit }),
  }),
  z.object({
    kind: z.literal("chorus"),
    bypass: z.boolean(),
    params: z.object({ rate: z.number().min(0.01).max(20), depth: unit, mix: unit }),
  }),
  z.object({
    kind: z.literal("delay"),
    bypass: z.boolean(),
    params: z.object({
      timeBeats: z.number().min(0.0625).max(8),
      feedback: z.number().min(0).max(0.95),
      mix: unit,
      sync: z.boolean(),
      timeSeconds: z.number().min(0.01).max(2),
    }),
  }),
  z.object({
    kind: z.literal("reverb"),
    bypass: z.boolean(),
    params: z.object({ decay: z.number().min(0.1).max(20), mix: unit }),
  }),
]);

export const effectsSchema = z
  .array(effectSchema)
  .length(EFFECT_ORDER.length)
  .refine(
    (fx) => EFFECT_ORDER.every((kind, i) => fx[i]?.kind === kind),
    "effects must follow EFFECT_ORDER",
  );

const synthStateSchema = z.object({
  osc1: oscillatorSchema,
  osc2: oscillatorSchema,
  noise: z.object({ enabled: z.boolean(), color: unit }),
  mixer: z.object({ osc1: unit, osc2: unit, noise: unit }),
  filter: filterSchema,
  ampEnvelope: adsrSchema,
  filterEnvelope: adsrSchema,
  filterEnvAmount: z.number().min(-1).max(1),
  lfo: z.object({
    waveform,
    destination: z.enum(["pitch", "filter", "amplitude"]),
    rate: z.number().min(0.01).max(40),
    depth: unit,
    sync: z.boolean(),
    syncBeats: z.number().min(0.0625).max(16),
  }),
  effects: effectsSchema,
  output: z.object({ gain: unit, velocitySensitivity: unit }),
});

const sampleStateSchema = z.object({
  assetId: id,
  trimStart: z.number().min(0),
  trimEnd: z.number().min(0),
  fadeIn: z.number().min(0),
  fadeOut: z.number().min(0),
  gain: z.number().min(0).max(2),
  reversed: z.boolean(),
  loopEnabled: z.boolean(),
  loopStart: z.number().min(0),
  loopEnd: z.number().min(0),
  playbackMode: z.enum(["one-shot", "loop", "instrument"]),
  rootNote: z.number().int().min(0).max(127),
  tuningCents: z.number().min(-1200).max(1200),
  ampEnvelope: adsrSchema,
  filter: filterSchema,
  effects: effectsSchema,
});

const soundSchema: z.ZodType<SoundDefinition> = z.object({
  id,
  type: z.enum(["synth", "sample"]),
  name: z.string().min(1).max(80),
  metadata: z.object({
    origin: z.enum(["system-preset", "user", "recording", "import"]),
    tags: z.array(z.string()),
    syncState: z.enum(["local", "cloud"]),
  }),
  createdAt: iso,
  updatedAt: iso,
  synthState: synthStateSchema.optional(),
  sampleState: sampleStateSchema.optional(),
});

export const noteEventSchema: z.ZodType<NoteEvent> = z.object({
  id,
  pitch: z.number().int().min(0).max(127),
  startBeat: beats,
  durationBeats: z.number().gt(0),
  velocity: z.number().int().min(0).max(127),
  muted: z.boolean(),
});

const patternSchema: z.ZodType<Pattern> = z.object({
  id,
  name: z.string().min(1).max(80),
  lengthBeats: z.number().gt(0).max(64),
  resolution: z.number().int().min(1).max(16),
  notes: z.array(noteEventSchema),
  createdAt: iso,
  updatedAt: iso,
});

const clipSchema: z.ZodType<Clip> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pattern"),
    id,
    patternId: id,
    startBeat: beats,
    lengthBeats: z.number().gt(0),
    loopEnabled: z.boolean(),
    transpose: z.number().int().min(-48).max(48),
    velocityMultiplier: z.number().min(0).max(2),
  }),
  z.object({
    kind: z.literal("audio"),
    id,
    assetId: id,
    startBeat: beats,
    lengthBeats: z.number().gt(0),
    offsetSeconds: z.number().min(0),
    gain: z.number().min(0).max(2),
    fadeIn: z.number().min(0),
    fadeOut: z.number().min(0),
    loopEnabled: z.boolean(),
    loopStart: z.number().min(0),
    loopEnd: z.number().min(0),
  }),
]);

const trackSchema: z.ZodType<Track> = z.object({
  id,
  type: z.enum(["instrument", "audio"]),
  name: z.string().min(1).max(80),
  soundId: id.optional(),
  volume: unit,
  pan: z.number().min(-1).max(1),
  mute: z.boolean(),
  solo: z.boolean(),
  colorToken: z.string(),
  clips: z.array(clipSchema),
  effects: effectsSchema,
});

const assetSchema: z.ZodType<AudioAsset> = z.object({
  id,
  source: z.enum(["recording", "import"]),
  originalFilename: z.string(),
  mimeType: z.string(),
  duration: z.number().min(0),
  sampleRate: z.number().gt(0),
  channels: z.number().int().min(1).max(2),
  localBlobKey: z.string(),
  remoteStoragePath: z.string().optional(),
  createdAt: iso,
  updatedAt: iso,
});

export const projectSchema: z.ZodType<Project> = z.object({
  id,
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  name: z.string().min(1).max(120),
  tempo: z.number().min(30).max(300),
  timeSignature: z.object({
    beatsPerBar: z.number().int().min(1).max(12),
    beatUnit: z.literal(4),
  }),
  loopRange: z.object({ enabled: z.boolean(), startBeat: beats, endBeat: beats }),
  swing: unit,
  sounds: z.array(soundSchema),
  tracks: z.array(trackSchema),
  patterns: z.array(patternSchema),
  assets: z.array(assetSchema),
  createdAt: iso,
  updatedAt: iso,
});
