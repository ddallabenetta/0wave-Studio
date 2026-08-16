/**
 * Audio engine public contract.
 *
 * The engine is framework-independent: no React imports, no zustand.
 * UI talks to the engine exclusively through this API. The engine never
 * exposes AudioNodes to serializable state.
 *
 * Musical positions are in beats; scheduling times are AudioContext seconds.
 */
import type {
  AudioEngineStatus,
  Beats,
  EffectState,
  ID,
  LoopRange,
  NoteEvent,
  SoundDefinition,
  SynthState,
} from "../schema/types";
import type { AudioClipPlayback } from "./audioClips";
import type { PreviewNote } from "./preview";

/** Dot path into SynthState, e.g. "filter.cutoff", "osc1.waveform". */
export type ParameterPath = string;

export interface EngineEvents {
  /** Playhead moved; fired at display rate (~30 Hz), not audio rate. */
  onPosition?: (positionBeats: Beats) => void;
  onStatusChange?: (status: AudioEngineStatus) => void;
  /** Master bus clipping detected by the analyser. */
  onClip?: () => void;
  /** Transport reached the end of the loop range. */
  onLoop?: () => void;
}

export interface AnalyzerFrame {
  /** Float time-domain samples, length = fftSize. */
  timeDomain: Float32Array;
  /** dB frequency bins, length = fftSize/2. */
  frequency: Uint8Array;
}

export interface IAudioEngine {
  /** Create the AudioContext. Must be called from a user gesture. */
  initialize(): Promise<void>;
  /** Replace event sinks after creation (order-independent wiring). */
  setEvents(events: EngineEvents): void;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  readonly status: AudioEngineStatus;
  readonly context: AudioContext | null;

  /** Studio preview: monophonic/polyphonic keyboard input. */
  noteOn(note: number, velocity: number, time?: number): void;
  noteOff(note: number, time?: number): void;
  allNotesOff(): void;

  /** Load the sound currently being edited/previewed in the Studio. */
  loadSound(sound: SoundDefinition): void;
  /** Live parameter update with smoothing (no zipper noise). */
  setParameter(path: ParameterPath, value: number | string | boolean, time?: number): void;

  /** Playground: per-track sound assignment and mixing. */
  createTrackNode(trackId: ID): void;
  removeTrackNode(trackId: ID): void;
  assignSoundToTrack(trackId: ID, sound: SoundDefinition | null): void;
  setTrackMix(trackId: ID, volume: number, pan: number): void;
  setTrackMuteSolo(trackId: ID, mute: boolean, solo: boolean): void;
  /** True when the track has an assigned sound able to play a note. */
  trackHasSound(trackId: ID): boolean;

  /**
   * Audition notes through a track's own instrument, layered over whatever
   * the transport is already playing. `notes` are positioned in beats from
   * the start of the audition. Returns its length in seconds, or null when
   * the track has no sound to play it with.
   */
  previewTrackNotes(trackId: ID, notes: PreviewNote[], tempo?: number): number | null;
  /** Drop an audition's queued notes (sounding ones ring out). */
  stopTrackPreview(trackId?: ID): void;

  /** Scheduling. Times are beats relative to transport position 0. */
  schedulePattern(trackId: ID, notes: NoteEvent[], startBeat: Beats, options?: {
    transpose?: number;
    velocityMultiplier?: number;
    untilBeat?: Beats;
  }): void;
  /** Cancel every scheduled event (stop, seek, pattern edit). */
  cancelScheduled(): void;

  /** Per-track effect chain, deterministic EFFECT_ORDER. */
  setTrackEffects(trackId: ID, effects: EffectState[]): void;
  /** Arrangement audio clip, routed through the track bus. */
  scheduleAudioClip(trackId: ID, clip: AudioClipPlayback): void;
  cancelAudioClips(): void;

  /** Transport. */
  startTransport(fromBeat?: Beats): void;
  pauseTransport(): void;
  stopTransport(): void;
  setTempo(bpm: number): void;
  setSwing(swing: number): void;
  setLoopRange(range: LoopRange): void;
  setMetronome(enabled: boolean): void;
  seek(beat: Beats): void;
  readonly positionBeats: Beats;
  readonly isPlaying: boolean;

  /** Analysis. Returns null before initialize(). */
  getMasterFrame(): AnalyzerFrame | null;
  /** Input (microphone) monitoring level 0..1, null when no input. */
  getInputLevel(): number | null;

  /** Audio assets. */
  decodeAudio(data: ArrayBuffer): Promise<AudioBuffer>;
  /** Sample playback for SampleSounds and audio clips. */
  playSample(sound: SoundDefinition, buffer: AudioBuffer, note: number, velocity: number, when?: number): void;

  /** Recording input graph. */
  createInputMonitor(deviceId?: string): Promise<MediaStream>;
  destroyInputMonitor(): void;

  /** Full cleanup. */
  dispose(): void;
}

/** Convenience: full patch replace on the loaded Studio sound. */
export type SynthPatchUpdate = Partial<SynthState>;
