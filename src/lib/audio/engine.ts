/**
 * AudioEngine: the IAudioEngine implementation and the only place the rest
 * of the app talks to. Owns the single AudioContext (created lazily in
 * initialize(), which must run from a user gesture), the master bus, the
 * studio preview engines, the track registry, and the transport.
 *
 * Graph:
 *   studio synth/sampler -> master
 *   track sound engine -> TrackBus (gain/pan/fx) -> master
 *   master -> limiter -> destination, with analyser taps
 */
import type { AnalyzerFrame, EngineEvents, IAudioEngine, ParameterPath } from "./api";
import type { AudioEngineStatus, Beats, EffectState, ID, LoopRange, NoteEvent, SoundDefinition } from "../schema/types";
import { Analyzer } from "./analyzer";
import { AudioClipPlayer } from "./audioClips";
import type { AudioClipPlayback } from "./audioClips";
import { InputMonitor } from "./input";
import { MasterBus } from "./master";
import { PreviewScheduler } from "./preview";
import type { PreviewNote } from "./preview";
import { SamplerEngine } from "./sampler";
import { SynthEngine } from "./synth";
import { TrackBus, TransportEngine } from "./transport";
import type { TrackVoice } from "./transport";

interface TrackEngine {
  bus: TrackBus;
  sound: SynthEngine | SamplerEngine | null;
  mute: boolean;
  solo: boolean;
}

export function createAudioEngine(events?: EngineEvents): IAudioEngine {
  return new AudioEngine(events);
}

class AudioEngine implements IAudioEngine {
  private events: EngineEvents;
  private ctx: AudioContext | null = null;
  private master: MasterBus | null = null;
  private analyzer: Analyzer | null = null;
  private transport: TransportEngine | null = null;
  private clipPlayer: AudioClipPlayer | null = null;
  private preview: PreviewScheduler | null = null;
  private studioSynth: SynthEngine | null = null;
  private studioSampler: SamplerEngine | null = null;
  private activeSound: SoundDefinition | null = null;
  private tracks = new Map<ID, TrackEngine>();
  /** Decoded sample buffers keyed by sound id (primed via playSample). */
  private sampleBuffers = new Map<ID, AudioBuffer>();
  private inputMonitor: InputMonitor | null = null;
  private _status: AudioEngineStatus = "uninitialized";
  private tempo = 120;
  private disposed = false;
  private statechangeHandler: (() => void) | null = null;

  constructor(events: EngineEvents = {}) {
    this.events = events;
  }

  /**
   * Replace the event sinks after construction. The singleton may be created
   * by whichever component asks for it first, so the app shell wires its
   * callbacks here instead of relying on creation order.
   */
  setEvents(events: EngineEvents): void {
    this.events = events;
  }

  get status(): AudioEngineStatus {
    return this._status;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  async initialize(): Promise<void> {
    this.disposed = false;
    if (typeof window === "undefined" || typeof AudioContext === "undefined") {
      this.setStatus("unsupported");
      return;
    }
    if (this.ctx) {
      // Already initialized: calling again resumes (user gesture requirement).
      await this.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = new MasterBus(ctx, { onClip: () => this.events.onClip?.() });
      this.analyzer = new Analyzer(this.master.scopeAnalyser, this.master.freqAnalyser);
      this.studioSynth = new SynthEngine(ctx, this.master.input);
      this.studioSampler = new SamplerEngine(ctx, this.master.input, {
        getBuffer: (id) => this.sampleBuffers.get(id) ?? null,
      });
      this.studioSynth.setTempo(this.tempo);
      this.studioSampler.setTempo(this.tempo);
      this.transport = new TransportEngine(
        ctx,
        this.master.input,
        {
          onPosition: (position) => this.events.onPosition?.(position),
          onLoop: () => this.events.onLoop?.(),
        },
        (trackId) => this.resolveTrackVoice(trackId),
      );
      this.clipPlayer = new AudioClipPlayer(ctx);
      this.preview = new PreviewScheduler(ctx, (trackId) => this.resolveTrackVoice(trackId));
      this.statechangeHandler = () => this.onContextStateChange();
      ctx.addEventListener("statechange", this.statechangeHandler);
      await ctx.resume();
      this.setStatus(ctx.state === "suspended" ? "suspended" : "running");
      // A sound loaded before initialize() (e.g. during project load) takes effect now.
      if (this.activeSound) this.applyActiveSound();
    } catch (error) {
      this.cleanupContext();
      this.setStatus("error");
      throw error;
    }
  }

  async resume(): Promise<void> {
    if (!this.ctx || this.ctx.state === "closed") return;
    try {
      await this.ctx.resume();
      this.setStatus(this.ctx.state === "suspended" ? "suspended" : "running");
    } catch {
      this.setStatus("error");
    }
  }

  async suspend(): Promise<void> {
    if (!this.ctx) return;
    try {
      await this.ctx.suspend();
      this.setStatus("suspended");
    } catch {
      this.setStatus("error");
    }
  }

  noteOn(note: number, velocity: number, time?: number): void {
    if (this.disposed || !this.activeSound) return;
    if (this.activeSound.type === "synth") this.studioSynth?.noteOn(note, velocity, time);
    else this.studioSampler?.noteOn(note, velocity, time);
  }

  noteOff(note: number, time?: number): void {
    if (this.disposed || !this.activeSound) return;
    if (this.activeSound.type === "synth") this.studioSynth?.noteOff(note, time);
    else this.studioSampler?.noteOff(note, time);
  }

  allNotesOff(): void {
    if (this.disposed) return;
    this.studioSynth?.allNotesOff();
    this.studioSampler?.stopAll();
  }

  loadSound(sound: SoundDefinition): void {
    if (this.disposed) return;
    this.activeSound = sound;
    if (!this.studioSynth || !this.studioSampler) return; // applied on initialize()
    this.applyActiveSound();
  }

  private applyActiveSound(): void {
    if (!this.activeSound) return;
    this.allNotesOff();
    if (this.activeSound.type === "synth" && this.activeSound.synthState) {
      this.studioSynth?.loadPatch(this.activeSound.synthState);
    } else if (this.activeSound.type === "sample" && this.activeSound.sampleState) {
      this.studioSampler?.loadSound(this.activeSound);
    }
  }

  setParameter(path: ParameterPath, value: number | string | boolean, time?: number): void {
    if (this.disposed) return;
    if (this.activeSound?.type === "synth") {
      this.studioSynth?.setParameter(path, value, time);
    } else if (this.activeSound?.type === "sample") {
      this.studioSampler?.setParameter(path, value, time);
    }
  }

  /* ------------------------------ Tracks ------------------------------ */

  createTrackNode(trackId: ID): void {
    if (this.disposed || !this.ctx || !this.master || this.tracks.has(trackId)) return;
    const bus = new TrackBus(this.ctx);
    bus.connectOutput(this.master.input);
    bus.setMix(0.8, 0);
    this.tracks.set(trackId, { bus, sound: null, mute: false, solo: false });
    this.applySoloContext();
  }

  removeTrackNode(trackId: ID): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    this.transport?.removeTrack(trackId);
    this.preview?.stop(trackId);
    track.sound?.dispose();
    track.bus.dispose();
    this.tracks.delete(trackId);
    this.applySoloContext();
  }

  assignSoundToTrack(trackId: ID, sound: SoundDefinition | null): void {
    const track = this.tracks.get(trackId);
    if (!track || !this.ctx) return;
    // The engine about to be disposed is the one any running audition is
    // playing through, so the audition goes with it.
    this.preview?.stop(trackId);
    track.sound?.dispose();
    track.sound = null;
    if (!sound) return;
    if (sound.type === "synth" && sound.synthState) {
      const engine = new SynthEngine(this.ctx, track.bus.input);
      engine.loadPatch(sound.synthState);
      engine.setTempo(this.tempo);
      track.sound = engine;
    } else if (sound.type === "sample" && sound.sampleState) {
      const engine = new SamplerEngine(this.ctx, track.bus.input, {
        getBuffer: (id) => this.sampleBuffers.get(id) ?? null,
      });
      engine.loadSound(sound);
      engine.setTempo(this.tempo);
      track.sound = engine;
    }
  }

  setTrackMix(trackId: ID, volume: number, pan: number): void {
    this.tracks.get(trackId)?.bus.setMix(volume, pan);
  }

  setTrackMuteSolo(trackId: ID, mute: boolean, solo: boolean): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    track.mute = mute;
    track.solo = solo;
    track.bus.setMuteSolo(mute, solo);
    this.applySoloContext();
  }

  /** Per-track effects (same deterministic order); not on the frozen interface. */
  setTrackEffects(trackId: ID, effects: EffectState[]): void {
    this.tracks.get(trackId)?.bus.setEffects(effects);
  }

  trackHasSound(trackId: ID): boolean {
    return Boolean(this.tracks.get(trackId)?.sound);
  }

  /* ------------------------------ Preview ------------------------------ */

  /**
   * Audition notes on a track's own instrument. It goes through that track's
   * bus, so its volume, pan, mute, solo and effects all apply, and it layers
   * over a running transport instead of interrupting it.
   */
  previewTrackNotes(trackId: ID, notes: PreviewNote[], tempo?: number): number | null {
    if (this.disposed || !this.preview) return null;
    return this.preview.start(trackId, notes, tempo ?? this.tempo);
  }

  stopTrackPreview(trackId?: ID): void {
    this.preview?.stop(trackId);
  }

  private applySoloContext(): void {
    let anySolo = false;
    for (const track of this.tracks.values()) if (track.solo) anySolo = true;
    for (const track of this.tracks.values()) track.bus.setSoloContext(anySolo);
  }

  private resolveTrackVoice(trackId: ID): TrackVoice | null {
    const sound = this.tracks.get(trackId)?.sound ?? null;
    if (!sound) return null;
    return {
      noteOn: (note, velocity, time) => sound.noteOn(note, velocity, time),
      noteOff: (note, time) => sound.noteOff(note, time),
      allNotesOff: () => sound.allNotesOff(),
    };
  }

  /* ----------------------------- Scheduling ---------------------------- */

  schedulePattern(
    trackId: ID,
    notes: NoteEvent[],
    startBeat: Beats,
    options?: { transpose?: number; velocityMultiplier?: number; untilBeat?: Beats },
  ): void {
    this.transport?.schedulePattern(trackId, notes, startBeat, options ?? {});
  }

  /**
   * Schedule an arrangement audio clip on a track bus. Called by the
   * Playground when playback starts and whenever clips change mid-play.
   * Clips whose start is already in the past are skipped by the caller.
   */
  scheduleAudioClip(trackId: ID, clip: AudioClipPlayback): void {
    const track = this.tracks.get(trackId);
    if (!track || !this.transport || !this.clipPlayer) return;
    const when = this.transport.contextTimeForBeat(clip.startBeat);
    if (when === null) return;
    this.clipPlayer.schedule(track.bus.input, clip, when, this.tempo);
  }

  cancelAudioClips(): void {
    this.clipPlayer?.cancelAll();
  }

  cancelScheduled(): void {
    this.transport?.cancelScheduled();
    this.preview?.stop();
    this.clipPlayer?.cancelAll();
    for (const track of this.tracks.values()) track.sound?.allNotesOff();
  }

  /* ----------------------------- Transport ----------------------------- */

  startTransport(fromBeat?: Beats): void {
    this.transport?.start(fromBeat ?? this.transport.positionBeats);
  }

  pauseTransport(): void {
    this.transport?.pause();
    this.clipPlayer?.cancelAll();
  }

  stopTransport(): void {
    this.transport?.stop();
    this.preview?.stop();
    this.clipPlayer?.cancelAll();
    for (const track of this.tracks.values()) track.sound?.allNotesOff();
  }

  setTempo(bpm: number): void {
    this.tempo = Math.min(300, Math.max(30, bpm));
    this.transport?.setTempo(this.tempo);
    this.studioSynth?.setTempo(this.tempo);
    this.studioSampler?.setTempo(this.tempo);
    for (const track of this.tracks.values()) track.sound?.setTempo?.(this.tempo);
  }

  setSwing(swing: number): void {
    this.transport?.setSwing(Math.min(1, Math.max(0, swing)));
  }

  setLoopRange(range: LoopRange): void {
    this.transport?.setLoopRange(range);
  }

  setMetronome(enabled: boolean): void {
    this.transport?.setMetronome(enabled);
  }

  seek(beat: Beats): void {
    this.transport?.seek(beat);
  }

  get positionBeats(): Beats {
    return this.transport?.positionBeats ?? 0;
  }

  get isPlaying(): boolean {
    return this.transport?.isPlaying ?? false;
  }

  /* ------------------------------ Analysis ----------------------------- */

  getMasterFrame(): AnalyzerFrame | null {
    return this.analyzer?.getFrame() ?? null;
  }

  getInputLevel(): number | null {
    return this.inputMonitor?.getLevel() ?? null;
  }

  /* ------------------------------ Samples ------------------------------ */

  decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.ctx) return Promise.reject(new Error("Audio engine not initialized"));
    return this.ctx.decodeAudioData(data);
  }

  playSample(sound: SoundDefinition, buffer: AudioBuffer, note: number, velocity: number, when?: number): void {
    if (this.disposed) return;
    this.sampleBuffers.set(sound.id, buffer);
    this.studioSampler?.playSample(sound, buffer, note, velocity, when);
  }

  /* ------------------------------ Input -------------------------------- */

  async createInputMonitor(deviceId?: string): Promise<MediaStream> {
    if (!this.ctx) throw new Error("Audio engine not initialized");
    this.destroyInputMonitor();
    const monitor = new InputMonitor(this.ctx);
    // Propagates the DOMException on permission denial; the UI maps it.
    const stream = await monitor.open(deviceId);
    this.inputMonitor = monitor;
    return stream;
  }

  destroyInputMonitor(): void {
    this.inputMonitor?.close();
    this.inputMonitor = null;
  }

  /* ------------------------------ Teardown ----------------------------- */

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.preview?.dispose();
    this.transport?.dispose();
    for (const track of this.tracks.values()) {
      track.sound?.dispose();
      track.bus.dispose();
    }
    this.tracks.clear();
    this.studioSynth?.dispose();
    this.studioSampler?.dispose();
    this.inputMonitor?.close();
    this.inputMonitor = null;
    this.master?.dispose();
    this.cleanupContext();
  }

  private cleanupContext(): void {
    if (this.statechangeHandler && this.ctx) {
      this.ctx.removeEventListener("statechange", this.statechangeHandler);
    }
    this.statechangeHandler = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.analyzer = null;
    this.clipPlayer?.dispose();
    this.clipPlayer = null;
    this.preview?.dispose();
    this.preview = null;
    this.transport = null;
    this.studioSynth = null;
    this.studioSampler = null;
    this.activeSound = null;
    this.sampleBuffers.clear();
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }

  private onContextStateChange(): void {
    if (!this.ctx) return;
    if (this.ctx.state === "running") this.setStatus("running");
    else if (this.ctx.state === "suspended") this.setStatus("suspended");
    else if (this.ctx.state === "closed") this.setStatus("error");
  }

  private setStatus(status: AudioEngineStatus): void {
    if (status === this._status) return;
    this._status = status;
    this.events.onStatusChange?.(status);
  }
}
