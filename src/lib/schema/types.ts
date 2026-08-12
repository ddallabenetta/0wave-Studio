/**
 * 0wave Studio - canonical project schema types.
 *
 * These types are the frozen contract between:
 *   audio engine (lib/audio), React UI, persistence (IndexedDB / Supabase).
 *
 * Rules:
 * - Everything here is JSON-serializable. No AudioNode, AudioBuffer, Blob.
 * - Audio blobs live in a separate store keyed by AudioAsset.localBlobKey.
 * - Any breaking change requires bumping SCHEMA_VERSION and a migration
 *   in lib/schema/migrations.ts.
 */

export const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

export type ID = string;

/** Musical time is always expressed in beats (quarter notes). */
export type Beats = number;

export type ISODate = string;

export type Waveform = "sine" | "triangle" | "sawtooth" | "square";

export type FilterMode = "lowpass" | "highpass" | "bandpass";

export type LfoDestination = "pitch" | "filter" | "amplitude";

export type EffectKind = "distortion" | "chorus" | "delay" | "reverb";

/** Deterministic effect order in every chain. */
export const EFFECT_ORDER: readonly EffectKind[] = [
  "distortion",
  "chorus",
  "delay",
  "reverb",
] as const;

/* ------------------------------------------------------------------ */
/* NoteEvent - the single canonical note model                         */
/* Pattern Editor and Piano Roll both read/write these.                */
/* ------------------------------------------------------------------ */

export interface NoteEvent {
  id: ID;
  /** MIDI note number 0-127. 60 = C4. */
  pitch: number;
  /** Position within the pattern, in beats. */
  startBeat: Beats;
  durationBeats: Beats;
  /** 0-127. */
  velocity: number;
  muted: boolean;
}

/* ------------------------------------------------------------------ */
/* SynthState                                                          */
/* ------------------------------------------------------------------ */

export interface OscillatorState {
  enabled: boolean;
  waveform: Waveform;
  /** -4..+4 octaves. */
  octave: number;
  /** -12..+12 semitones. */
  semitone: number;
  /** -100..+100 cents. */
  detuneCents: number;
  /** 0..1 initial phase, where supported. */
  phase: number;
  /** Advanced: unison voice count 1-8. */
  unison: number;
  /** Advanced: unison spread in cents 0-100. */
  unisonSpreadCents: number;
}

export interface NoiseState {
  enabled: boolean;
  /** 0 = white, 1 = pink. */
  color: number;
}

export interface MixerState {
  /** 0..1 linear gains. */
  osc1: number;
  osc2: number;
  noise: number;
}

export interface FilterState {
  mode: FilterMode;
  /** Hz, 20-20000. */
  cutoff: number;
  /** Q, 0.1-24. */
  resonance: number;
}

export interface AdsrState {
  /** seconds. */
  attack: number;
  decay: number;
  /** 0..1 */
  sustain: number;
  /** seconds. */
  release: number;
}

export interface LfoState {
  waveform: Waveform;
  destination: LfoDestination;
  /** Hz when sync=false. 0.01-40. */
  rate: number;
  /** 0..1 modulation depth. */
  depth: number;
  /** When true, rate is derived from transport tempo. */
  sync: boolean;
  /** Beats per LFO cycle when sync=true. e.g. 1 = quarter note. */
  syncBeats: Beats;
}

export interface DistortionParams {
  drive: number;
  tone: number;
}

export interface ChorusParams {
  rate: number;
  depth: number;
  mix: number;
}

export interface DelayParams {
  timeBeats: Beats;
  feedback: number;
  mix: number;
  sync: boolean;
  timeSeconds: number;
}

export interface ReverbParams {
  decay: number;
  mix: number;
}

/**
 * Discriminated on `kind` so narrowing gives the right parameter shape in
 * both the engine and the editors.
 */
export type EffectState =
  | { kind: "distortion"; bypass: boolean; params: DistortionParams }
  | { kind: "chorus"; bypass: boolean; params: ChorusParams }
  | { kind: "delay"; bypass: boolean; params: DelayParams }
  | { kind: "reverb"; bypass: boolean; params: ReverbParams };

export interface OutputState {
  /** 0..1 master gain for the sound. */
  gain: number;
  /** 0..127 → 0..1, how strongly velocity scales amplitude. */
  velocitySensitivity: number;
}

export interface SynthState {
  osc1: OscillatorState;
  osc2: OscillatorState;
  noise: NoiseState;
  mixer: MixerState;
  filter: FilterState;
  ampEnvelope: AdsrState;
  filterEnvelope: AdsrState;
  /** -1..+1 bipolar amount of filter envelope on cutoff. */
  filterEnvAmount: number;
  lfo: LfoState;
  /** One entry per EFFECT_ORDER element. */
  effects: EffectState[];
  output: OutputState;
}

/* ------------------------------------------------------------------ */
/* SampleState                                                         */
/* ------------------------------------------------------------------ */

export type SamplePlaybackMode = "one-shot" | "loop" | "instrument";

export interface SampleState {
  assetId: ID;
  /** seconds, offsets into the decoded buffer. */
  trimStart: number;
  trimEnd: number;
  /** seconds. */
  fadeIn: number;
  fadeOut: number;
  /** linear 0..2. */
  gain: number;
  reversed: boolean;
  loopEnabled: boolean;
  /** seconds, loop region within trimmed range. */
  loopStart: number;
  loopEnd: number;
  playbackMode: SamplePlaybackMode;
  /** MIDI note that plays the sample at original speed. */
  rootNote: number;
  /** cents, -1200..+1200 fine tuning. */
  tuningCents: number;
  ampEnvelope: AdsrState;
  filter: FilterState;
  effects: EffectState[];
}

/* ------------------------------------------------------------------ */
/* SoundDefinition - unified sound model                               */
/* ------------------------------------------------------------------ */

export type SoundType = "synth" | "sample";

export interface SoundMetadata {
  /** e.g. "system-preset" | "user" | "recording" | "import". */
  origin: "system-preset" | "user" | "recording" | "import";
  tags: string[];
  /** "local" | "cloud" - persistence status badge. */
  syncState: "local" | "cloud";
}

export interface SoundDefinition {
  id: ID;
  type: SoundType;
  name: string;
  metadata: SoundMetadata;
  createdAt: ISODate;
  updatedAt: ISODate;
  synthState?: SynthState;
  sampleState?: SampleState;
}

/* ------------------------------------------------------------------ */
/* Pattern / clips / tracks                                            */
/* ------------------------------------------------------------------ */

export interface Pattern {
  id: ID;
  name: string;
  /** 1-4 bars * beatsPerBar. */
  lengthBeats: Beats;
  /** Steps per beat used by the Pattern Editor grid (4 = 16th notes). */
  resolution: number;
  notes: NoteEvent[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface PatternClip {
  kind: "pattern";
  id: ID;
  patternId: ID;
  startBeat: Beats;
  lengthBeats: Beats;
  loopEnabled: boolean;
  /** semitones, -48..+48. */
  transpose: number;
  /** 0..2 multiplier on note velocities. */
  velocityMultiplier: number;
}

export interface AudioClip {
  kind: "audio";
  id: ID;
  assetId: ID;
  startBeat: Beats;
  lengthBeats: Beats;
  /** seconds into the source asset. */
  offsetSeconds: number;
  /** linear 0..2. */
  gain: number;
  /** seconds. */
  fadeIn: number;
  fadeOut: number;
  loopEnabled: boolean;
  /** seconds, source loop region. */
  loopStart: number;
  loopEnd: number;
}

export type Clip = PatternClip | AudioClip;

export type TrackType = "instrument" | "audio";

export interface Track {
  id: ID;
  type: TrackType;
  name: string;
  /** Reference into Project.sounds for instrument tracks. */
  soundId?: ID;
  /** 0..1 */
  volume: number;
  /** -1..+1 */
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Token name, not a raw color. See design tokens track-color-*. */
  colorToken: string;
  clips: Clip[];
  /** Per-track effect chain (same deterministic order). */
  effects: EffectState[];
}

/* ------------------------------------------------------------------ */
/* AudioAsset - metadata only; blob stored separately                  */
/* ------------------------------------------------------------------ */

export type AssetSource = "recording" | "import";

export interface AudioAsset {
  id: ID;
  source: AssetSource;
  originalFilename: string;
  mimeType: string;
  /** seconds. */
  duration: number;
  sampleRate: number;
  channels: number;
  /** Key into the IndexedDB blob store. */
  localBlobKey: string;
  /** Supabase Storage path, when synced. */
  remoteStoragePath?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

export interface TimeSignature {
  beatsPerBar: number;
  /** Note value of one beat: 4 = quarter. MVP: always 4. */
  beatUnit: 4;
}

export interface LoopRange {
  enabled: boolean;
  startBeat: Beats;
  endBeat: Beats;
}

export interface Project {
  id: ID;
  schemaVersion: number;
  name: string;
  /** 30-300 BPM. */
  tempo: number;
  timeSignature: TimeSignature;
  loopRange: LoopRange;
  /** 0..1, timing offset applied to even subdivisions. */
  swing: number;
  sounds: SoundDefinition[];
  tracks: Track[];
  patterns: Pattern[];
  assets: AudioAsset[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Transport runtime state (NOT persisted with the project document)   */
/* ------------------------------------------------------------------ */

export type TransportStatus = "stopped" | "playing" | "paused";

export interface TransportState {
  status: TransportStatus;
  /** Current playhead position in beats. */
  positionBeats: Beats;
  metronome: boolean;
  countIn: boolean;
}

/* ------------------------------------------------------------------ */
/* Audio engine runtime status                                         */
/* ------------------------------------------------------------------ */

export type AudioEngineStatus =
  | "uninitialized"
  | "running"
  | "suspended"
  | "error"
  | "unsupported";
