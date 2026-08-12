/**
 * Transport: lookahead scheduler over the audio clock.
 *
 * A 25 ms setInterval only wakes the scheduler; every musical time is
 * computed from AudioContext.currentTime (ADR-002). Pattern events are
 * generated from the raw note registry per tick, so tempo, swing and loop
 * changes apply live, and pause/resume needs no re-scheduling. Position is
 * tracked unwrapped internally; the public position wraps inside the loop
 * range, and crossing the loop end fires onLoop.
 */
import { beatsToSeconds, clamp, secondsPerBeat, secondsToBeats, swingOffsetBeats } from "../music/theory";
import { defaultEffects } from "../schema/factories";
import type { Beats, EffectState, LoopRange, NoteEvent } from "../schema/types";
import { EffectsChain } from "./effects";

/** Scheduler wakeup period (ms). */
const TICK_MS = 25;
/** How far ahead (seconds) events are scheduled against the audio clock. */
const LOOKAHEAD_SECONDS = 0.12;

export interface TransportEvents {
  onPosition?: (positionBeats: Beats) => void;
  onLoop?: () => void;
}

/** Note voice a track's assigned engine exposes (shared by synth and sampler). */
export interface TrackVoice {
  noteOn(note: number, velocity: number, time: number): void;
  noteOff(note: number, time: number): void;
  allNotesOff(): void;
}

export type TrackResolver = (trackId: string) => TrackVoice | null;

export interface ScheduleOptions {
  transpose?: number;
  velocityMultiplier?: number;
  untilBeat?: Beats;
}

interface ScheduledPattern {
  trackId: string;
  notes: NoteEvent[];
  startBeat: Beats;
  transpose: number;
  velocityMultiplier: number;
  untilBeat: Beats | null;
  stepsPerBeat: number;
}

export interface ScheduledEvent {
  type: "on" | "off";
  trackId: string;
  note: number;
  velocity: number;
  /** Unwrapped beat position of the event. */
  beat: Beats;
}

/**
 * Pure pattern registry + window generator. Holds no timers and no audio
 * nodes, so it is unit-testable with a fake clock.
 */
export class PatternScheduler {
  private patterns = new Map<string, ScheduledPattern>();

  /** Replace the schedule for a track with a fresh one. */
  schedule(trackId: string, notes: NoteEvent[], startBeat: Beats, options: ScheduleOptions = {}): void {
    this.patterns.set(trackId, {
      trackId,
      notes,
      startBeat,
      transpose: options.transpose ?? 0,
      velocityMultiplier: options.velocityMultiplier ?? 1,
      untilBeat: options.untilBeat ?? null,
      stepsPerBeat: this.stepsPerBeatFor(notes),
    });
  }

  remove(trackId: string): void {
    this.patterns.delete(trackId);
  }

  clear(): void {
    this.patterns.clear();
  }

  trackIds(): string[] {
    return [...this.patterns.keys()];
  }

  /**
   * Infer the pattern's subdivision for swing: the coarsest power-of-two
   * grid (2..32 steps per beat) that every note start lands on AND where at
   * least one note occupies an odd (swingable) step. Pure even grids fall
   * back to 2; nothing swings for them either way.
   */
  stepsPerBeatFor(notes: NoteEvent[]): number {
    for (const steps of [2, 4, 8, 16, 32]) {
      let allOnGrid = true;
      let hasOddStep = false;
      for (const note of notes) {
        const step = note.startBeat * steps;
        const rounded = Math.round(step);
        if (Math.abs(step - rounded) > 1e-6) {
          allOnGrid = false;
          break;
        }
        if (rounded % 2 === 1) hasOddStep = true;
      }
      if (allOnGrid && hasOddStep) return steps;
    }
    return 2;
  }

  /** Generate on/off events whose (unwrapped) beat falls in [windowStart, windowEnd]. */
  eventsFor(windowStart: Beats, windowEnd: Beats, swing: number, loop: LoopRange): ScheduledEvent[] {
    const out: ScheduledEvent[] = [];
    const loopEnabled = loop.enabled && loop.endBeat > loop.startBeat;
    const loopLen = loop.endBeat - loop.startBeat;

    for (const pattern of this.patterns.values()) {
      for (const note of pattern.notes) {
        if (note.muted) continue;
        const swingOff = swingOffsetBeats(note.startBeat, pattern.stepsPerBeat, swing);
        const base = pattern.startBeat + note.startBeat + swingOff;
        const pitch = Math.round(clamp(note.pitch + pattern.transpose, 0, 127));
        const velocity = Math.round(clamp(note.velocity * pattern.velocityMultiplier, 0, 127));
        const duration = Math.max(note.durationBeats, 0.005);

        if (loopEnabled) {
          // The note repeats every loop length while its start is inside the
          // scheduled region (unwrapped), cutting at loop/until boundaries.
          const firstK = Math.max(0, Math.ceil((windowStart - base) / loopLen));
          for (let k = firstK, guard = 0; guard < 256; guard++, k++) {
            const onBeat = base + k * loopLen;
            if (pattern.untilBeat !== null && onBeat >= pattern.untilBeat) break;
            if (onBeat > windowEnd) break;
            let offBeat = onBeat + duration;
            const nextOn = onBeat + loopLen;
            if (pattern.untilBeat === null || nextOn < pattern.untilBeat) offBeat = Math.min(offBeat, nextOn);
            if (pattern.untilBeat !== null) offBeat = Math.min(offBeat, pattern.untilBeat);
            out.push({ type: "on", trackId: pattern.trackId, note: pitch, velocity, beat: onBeat });
            out.push({ type: "off", trackId: pattern.trackId, note: pitch, velocity: 0, beat: offBeat });
          }
        } else {
          if (pattern.untilBeat !== null && base >= pattern.untilBeat) continue;
          if (base < windowStart || base > windowEnd) continue;
          let offBeat = base + duration;
          if (pattern.untilBeat !== null) offBeat = Math.min(offBeat, pattern.untilBeat);
          out.push({ type: "on", trackId: pattern.trackId, note: pitch, velocity, beat: base });
          out.push({ type: "off", trackId: pattern.trackId, note: pitch, velocity: 0, beat: offBeat });
        }
      }
    }
    return out;
  }
}

/**
 * Per-track bus: sound engine -> track gain (volume/mute/solo) -> stereo
 * panner -> per-track effects chain -> master.
 */
export class TrackBus {
  /** Sound engine outputs connect here. */
  readonly input: GainNode;
  /** Connect to the master bus input. */
  readonly output: GainNode;

  private gain: GainNode;
  private panner: StereoPannerNode;
  private fx: EffectsChain;
  private volume = 0.8;
  private mute = false;
  private solo = false;
  private anySolo = false;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.gain = ctx.createGain();
    this.gain.gain.value = this.volume;
    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = 0;
    this.fx = new EffectsChain(ctx, defaultEffects());
    this.output = ctx.createGain();
    this.input.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(this.fx.input);
    this.fx.output.connect(this.output);
  }

  setMix(volume: number, pan: number): void {
    this.volume = clamp(volume, 0, 1);
    const t = this.ctx.currentTime;
    this.applyLevel(t);
    this.panner.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.01);
  }

  setMuteSolo(mute: boolean, solo: boolean): void {
    this.mute = mute;
    this.solo = solo;
    this.applyLevel(this.ctx.currentTime);
  }

  /** Engine-wide solo state: when any track is soloed, non-soloed tracks mute. */
  setSoloContext(anySolo: boolean): void {
    this.anySolo = anySolo;
    this.applyLevel(this.ctx.currentTime);
  }

  setEffects(effects: EffectState[]): void {
    this.fx.update(effects);
  }

  setTempo(bpm: number): void {
    this.fx.setTempo(bpm);
  }

  connectOutput(destination: AudioNode): void {
    this.output.connect(destination);
  }

  dispose(): void {
    this.input.disconnect();
    this.gain.disconnect();
    this.panner.disconnect();
    this.output.disconnect();
    this.fx.dispose();
  }

  private applyLevel(time: number): void {
    const target = this.volume * (this.mute ? 0 : 1) * (this.solo || !this.anySolo ? 1 : 0);
    this.gain.gain.setTargetAtTime(target, time, 0.01);
  }
}

/**
 * Musical clock + scheduler. All beats are quarter-note beats; times are
 * AudioContext seconds.
 */
export class TransportEngine {
  readonly scheduler = new PatternScheduler();

  private interval: number | null = null;
  private _status: "stopped" | "playing" | "paused" = "stopped";
  /** Unwrapped beat position (monotonic while playing). */
  private position = 0;
  /** Window floor: the last tick's position; events below it are dropped. */
  private cursor = 0;
  private startBeat = 0;
  private startCtxTime = 0;
  private tempo = 120;
  private swing = 0;
  private loop: LoopRange = { enabled: false, startBeat: 0, endBeat: 8 };
  private metronome = false;
  private beatsPerBar = 4;
  private lastClickBeat = -1;
  private disposed = false;

  constructor(
    private ctx: AudioContext,
    private clickOut: AudioNode,
    private events: TransportEvents = {},
    private resolveTrack: TrackResolver = () => null,
  ) {}

  get positionBeats(): Beats {
    return this.displayPosition(this.position);
  }

  get isPlaying(): boolean {
    return this._status === "playing";
  }

  get status(): "stopped" | "playing" | "paused" {
    return this._status;
  }

  /**
   * AudioContext time at which an (unwrapped) beat will be reached.
   * Returns null when stopped, since there is no running timeline to map to.
   */
  contextTimeForBeat(beat: Beats): number | null {
    if (this._status !== "playing") return null;
    return this.startCtxTime + beatsToSeconds(beat - this.startBeat, this.tempo);
  }

  /** Current loop range, used to repeat audio clips across loop passes. */
  get loopRange(): LoopRange {
    return this.loop;
  }

  start(fromBeat?: Beats): void {
    if (this.disposed) return;
    const beat = Math.max(0, fromBeat ?? this.position);
    this._status = "playing";
    this.position = beat;
    this.cursor = beat;
    this.startBeat = beat;
    this.startCtxTime = this.ctx.currentTime;
    this.lastClickBeat = Math.floor(beat);
    this.startInterval();
    this.events.onPosition?.(this.displayPosition(beat));
  }

  pause(): void {
    if (this._status !== "playing") return;
    this.stopInterval();
    this._status = "paused";
    this.position = this.computePosition();
    this.releaseAllNotes();
    this.events.onPosition?.(this.displayPosition(this.position));
  }

  stop(): void {
    if (this._status === "stopped" && this.position === 0) return;
    this.stopInterval();
    this._status = "stopped";
    this.position = 0;
    this.cursor = 0;
    this.releaseAllNotes();
    this.events.onPosition?.(0);
  }

  seek(beat: Beats): void {
    this.position = Math.max(0, beat);
    this.cursor = this.position;
    this.lastClickBeat = Math.floor(this.position);
    if (this.status === "playing") {
      this.startBeat = this.position;
      this.startCtxTime = this.ctx.currentTime;
      this.releaseAllNotes();
    }
    this.events.onPosition?.(this.displayPosition(this.position));
  }

  setTempo(bpm: number): void {
    this.tempo = clamp(bpm, 30, 300);
  }

  setSwing(swing: number): void {
    this.swing = clamp(swing, 0, 1);
  }

  setLoopRange(range: LoopRange): void {
    this.loop = range;
  }

  setMetronome(enabled: boolean): void {
    this.metronome = enabled;
  }

  setBeatsPerBar(beatsPerBar: number): void {
    this.beatsPerBar = clamp(Math.round(beatsPerBar), 1, 16);
  }

  schedulePattern(trackId: string, notes: NoteEvent[], startBeat: Beats, options: ScheduleOptions = {}): void {
    this.scheduler.schedule(trackId, notes, startBeat, options);
  }

  removeTrack(trackId: string): void {
    this.scheduler.remove(trackId);
  }

  /** Drop every scheduled event and release ringing pattern notes. */
  cancelScheduled(): void {
    this.scheduler.clear();
    this.releaseAllNotes();
  }

  /** Wrap a beat position into the loop range for display. */
  private displayPosition(beat: Beats): Beats {
    if (this.loop.enabled && this.loop.endBeat > this.loop.startBeat) {
      const len = this.loop.endBeat - this.loop.startBeat;
      if (beat >= this.loop.endBeat) return this.loop.startBeat + ((beat - this.loop.startBeat) % len);
    }
    return beat;
  }

  private computePosition(): Beats {
    const elapsed = Math.max(0, this.ctx.currentTime - this.startCtxTime);
    return this.startBeat + secondsToBeats(elapsed, this.tempo);
  }

  private startInterval(): void {
    this.stopInterval();
    this.interval = window.setInterval(() => this.tick(), TICK_MS);
  }

  private stopInterval(): void {
    if (this.interval !== null) {
      window.clearInterval(this.interval);
      this.interval = null;
    }
  }

  private tick(): void {
    if (this._status !== "playing") return;
    const now = this.ctx.currentTime;
    const prevPosition = this.position;
    const position = this.computePosition();
    this.position = position;

    // Loop wrap detection (in unwrapped space): fire onLoop per crossed boundary.
    if (this.loop.enabled && this.loop.endBeat > this.loop.startBeat) {
      const len = this.loop.endBeat - this.loop.startBeat;
      const prevK = Math.floor((Math.max(prevPosition, this.loop.startBeat) - this.loop.startBeat) / len);
      const curK = Math.floor((Math.max(position, this.loop.startBeat) - this.loop.startBeat) / len);
      for (let k = prevK; k < curK; k++) this.events.onLoop?.();
    }

    // Pattern events in [cursor, position + lookahead].
    const spb = secondsPerBeat(this.tempo);
    const windowEnd = position + LOOKAHEAD_SECONDS / spb;
    const events = this.scheduler.eventsFor(this.cursor, windowEnd, this.swing, this.loop);
    for (const event of events) {
      const track = this.resolveTrack(event.trackId);
      if (!track) continue;
      const time = now + Math.max(0, (event.beat - position) * spb);
      if (event.type === "on") track.noteOn(event.note, event.velocity, time);
      else track.noteOff(event.note, time);
    }
    this.cursor = position;

    if (this.metronome) this.scheduleClicks(position, now, spb);

    // Display-rate position event (~40 Hz tick; the UI only renders at rAF).
    this.events.onPosition?.(this.displayPosition(position));
  }

  private scheduleClicks(position: Beats, now: number, spb: number): void {
    const lastBeat = Math.floor(position + LOOKAHEAD_SECONDS / spb);
    for (let b = this.lastClickBeat + 1; b <= lastBeat; b++) {
      const time = now + Math.max(0, (b - position) * spb);
      const wrapped = this.displayPosition(b);
      this.click(time, wrapped % this.beatsPerBar === 0);
    }
    this.lastClickBeat = Math.max(this.lastClickBeat, lastBeat);
  }

  /** Short oscillator burst into the master bus; accent on beat 1. */
  private click(time: number, accent: boolean): void {
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = accent ? 1600 : 800;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(accent ? 0.4 : 0.18, time);
    gain.gain.setTargetAtTime(0.0001, time + 0.002, 0.012);
    osc.connect(gain);
    gain.connect(this.clickOut);
    osc.start(time);
    osc.stop(time + 0.08);
  }

  private releaseAllNotes(): void {
    for (const trackId of this.scheduler.trackIds()) {
      this.resolveTrack(trackId)?.allNotesOff();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopInterval();
    this.scheduler.clear();
    this.releaseAllNotes();
  }
}
