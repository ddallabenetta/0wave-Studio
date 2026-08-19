/**
 * Preview scheduler: auditions notes through a track's own sound engine.
 *
 * Every audition in the Playground — one step toggled in the grid, one note
 * dropped in the Piano Roll, a whole pattern played from its card — sounds
 * through the instrument of the track the pattern is placed on, never
 * through the Studio's preview engine. That is what makes "which instrument
 * does this pattern play?" a property of the arrangement instead of a
 * separate, invisible selection.
 *
 * Timing follows the transport's model (ADR-002): a 25 ms interval only
 * wakes the scheduler; every note is handed to the voice with an exact
 * AudioContext time inside a 120 ms lookahead. Notes still waiting in the
 * queue can therefore be dropped on stop, while notes already handed to the
 * engine release themselves on their own scheduled note-off — cancelling an
 * audition never silences the arrangement playing underneath it.
 */
import { beatsToSeconds } from "../music/theory";
import type { TrackVoice } from "./transport";

/** A note to audition, positioned in beats relative to the audition start. */
export interface PreviewNote {
  pitch: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
}

interface PendingNote {
  pitch: number;
  velocity: number;
  onTime: number;
  offTime: number;
}

/** Scheduler wakeup period (ms). */
const TICK_MS = 25;
/** How far ahead (seconds) notes are handed to the voice. */
const LOOKAHEAD_SECONDS = 0.12;
/** Delay before the first note, so a click never lands behind the clock. */
const START_OFFSET_SECONDS = 0.02;
/** Upper bound on one audition; a pathological pattern cannot flood the graph. */
const MAX_PREVIEW_NOTES = 512;
/** Shortest audible note-off gap. */
const MIN_DURATION_SECONDS = 0.02;

export class PreviewScheduler {
  private pending = new Map<string, PendingNote[]>();
  private interval: number | null = null;
  private disposed = false;

  constructor(
    private ctx: AudioContext,
    private resolveVoice: (trackId: string) => TrackVoice | null,
  ) {}

  /**
   * Audition `notes` on `trackId`. Replaces any audition already running on
   * that track. Returns the audition length in seconds, or null when the
   * track has no sound assigned (nothing to hear, and the caller says so).
   */
  start(trackId: string, notes: PreviewNote[], tempo: number): number | null {
    if (this.disposed) return null;
    if (!this.resolveVoice(trackId)) return null;

    const origin = this.ctx.currentTime + START_OFFSET_SECONDS;
    const queue: PendingNote[] = [];
    for (const note of notes.slice(0, MAX_PREVIEW_NOTES)) {
      const onTime = origin + beatsToSeconds(Math.max(0, note.startBeat), tempo);
      const length = Math.max(
        MIN_DURATION_SECONDS,
        beatsToSeconds(Math.max(0.01, note.durationBeats), tempo),
      );
      queue.push({
        pitch: Math.round(note.pitch),
        velocity: Math.max(1, Math.round(note.velocity)),
        onTime,
        offTime: onTime + length,
      });
    }
    if (queue.length === 0) return null;
    queue.sort((a, b) => a.onTime - b.onTime);
    // Measured before flushing: flush() consumes the queue it is handed, and
    // a short audition can be fully scheduled by the time it returns.
    const length = queue[queue.length - 1].offTime - origin;
    this.pending.set(trackId, queue);

    // Hand over whatever already falls inside the lookahead window, so a
    // single short note sounds without waiting for the first tick.
    this.flush();
    this.ensureInterval();
    return length;
  }

  /** Drop notes not yet handed to the engine. Sounding notes ring out. */
  stop(trackId?: string): void {
    if (trackId === undefined) this.pending.clear();
    else this.pending.delete(trackId);
    if (this.pending.size === 0) this.stopInterval();
  }

  /** True while notes are still queued for that track. */
  isActive(trackId: string): boolean {
    return (this.pending.get(trackId)?.length ?? 0) > 0;
  }

  dispose(): void {
    this.disposed = true;
    this.pending.clear();
    this.stopInterval();
  }

  private flush(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD_SECONDS;
    for (const [trackId, queue] of this.pending) {
      const voice = this.resolveVoice(trackId);
      if (!voice) {
        // The track lost its sound mid-audition: nothing left to play on.
        this.pending.delete(trackId);
        continue;
      }
      let index = 0;
      while (index < queue.length && queue[index].onTime <= horizon) {
        const note = queue[index];
        voice.noteOn(note.pitch, note.velocity, note.onTime);
        voice.noteOff(note.pitch, note.offTime);
        index += 1;
      }
      if (index > 0) queue.splice(0, index);
      if (queue.length === 0) this.pending.delete(trackId);
    }
    if (this.pending.size === 0) this.stopInterval();
  }

  private ensureInterval(): void {
    if (this.interval !== null || this.pending.size === 0) return;
    this.interval = window.setInterval(() => this.flush(), TICK_MS);
  }

  private stopInterval(): void {
    if (this.interval === null) return;
    window.clearInterval(this.interval);
    this.interval = null;
  }
}
