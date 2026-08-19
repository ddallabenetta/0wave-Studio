import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewScheduler } from "@/lib/audio/preview";
import type { PreviewNote } from "@/lib/audio/preview";
import type { TrackVoice } from "@/lib/audio/transport";

/** A clock we drive by hand, standing in for the AudioContext. */
function fakeContext() {
  return { currentTime: 0 } as unknown as AudioContext & { currentTime: number };
}

function fakeVoice() {
  const on: { note: number; velocity: number; time: number }[] = [];
  const off: { note: number; time: number }[] = [];
  const voice: TrackVoice = {
    noteOn: (note, velocity, time) => void on.push({ note, velocity, time }),
    noteOff: (note, time) => void off.push({ note, time }),
    allNotesOff: () => {},
  };
  return { voice, on, off };
}

const note = (startBeat: number, pitch = 60, durationBeats = 0.25): PreviewNote => ({
  pitch,
  velocity: 100,
  startBeat,
  durationBeats,
});

describe("PreviewScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does nothing when the track has no sound", () => {
    const ctx = fakeContext();
    const scheduler = new PreviewScheduler(ctx, () => null);
    expect(scheduler.start("t1", [note(0)], 120)).toBeNull();
  });

  it("hands notes inside the lookahead straight to the voice", () => {
    const ctx = fakeContext();
    const { voice, on, off } = fakeVoice();
    const scheduler = new PreviewScheduler(ctx, () => voice);

    scheduler.start("t1", [note(0, 64)], 120);

    expect(on).toHaveLength(1);
    expect(on[0].note).toBe(64);
    // Origin is the current time plus the start offset; 0.25 beats at 120 BPM
    // is 0.125 s.
    expect(on[0].time).toBeCloseTo(0.02);
    expect(off[0].time).toBeCloseTo(0.145);
  });

  it("returns the audition length in seconds", () => {
    const ctx = fakeContext();
    const { voice } = fakeVoice();
    const scheduler = new PreviewScheduler(ctx, () => voice);
    // Last note starts on beat 3 and lasts one beat: four beats at 120 BPM.
    expect(scheduler.start("t1", [note(0), note(3, 60, 1)], 120)).toBeCloseTo(2);
  });

  it("keeps later notes queued until the clock reaches them", () => {
    const ctx = fakeContext();
    const { voice, on } = fakeVoice();
    const scheduler = new PreviewScheduler(ctx, () => voice);

    scheduler.start("t1", [note(0), note(1, 67)], 120);
    expect(on).toHaveLength(1);
    expect(scheduler.isActive("t1")).toBe(true);

    ctx.currentTime = 0.45;
    vi.advanceTimersByTime(25);

    expect(on).toHaveLength(2);
    expect(on[1].note).toBe(67);
    expect(on[1].time).toBeCloseTo(0.52);
    expect(scheduler.isActive("t1")).toBe(false);
  });

  it("stops queued notes without touching the ones already scheduled", () => {
    const ctx = fakeContext();
    const { voice, on } = fakeVoice();
    const scheduler = new PreviewScheduler(ctx, () => voice);

    scheduler.start("t1", [note(0), note(2, 67)], 120);
    scheduler.stop("t1");
    expect(scheduler.isActive("t1")).toBe(false);

    ctx.currentTime = 1.2;
    vi.advanceTimersByTime(50);
    expect(on).toHaveLength(1);
  });

  it("replaces an audition already running on the same track", () => {
    const ctx = fakeContext();
    const { voice, on } = fakeVoice();
    const scheduler = new PreviewScheduler(ctx, () => voice);

    scheduler.start("t1", [note(2, 60)], 120);
    scheduler.start("t1", [note(0, 72)], 120);

    ctx.currentTime = 1.5;
    vi.advanceTimersByTime(50);
    expect(on.map((e) => e.note)).toEqual([72]);
  });

  it("keeps auditions on different tracks independent", () => {
    const ctx = fakeContext();
    const first = fakeVoice();
    const second = fakeVoice();
    const scheduler = new PreviewScheduler(ctx, (id) =>
      id === "t1" ? first.voice : second.voice,
    );

    scheduler.start("t1", [note(1, 60)], 120);
    scheduler.start("t2", [note(1, 67)], 120);
    scheduler.stop("t1");

    ctx.currentTime = 0.6;
    vi.advanceTimersByTime(25);

    expect(first.on).toHaveLength(0);
    expect(second.on).toHaveLength(1);
  });

  it("drops an audition whose track loses its sound mid-flight", () => {
    const ctx = fakeContext();
    const { voice, on } = fakeVoice();
    let alive = true;
    const scheduler = new PreviewScheduler(ctx, () => (alive ? voice : null));

    scheduler.start("t1", [note(0), note(2, 67)], 120);
    alive = false;
    ctx.currentTime = 1.0;
    vi.advanceTimersByTime(25);

    expect(on).toHaveLength(1);
    expect(scheduler.isActive("t1")).toBe(false);
  });

  it("stops everything on dispose", () => {
    const ctx = fakeContext();
    const { voice, on } = fakeVoice();
    const scheduler = new PreviewScheduler(ctx, () => voice);

    scheduler.start("t1", [note(4, 60)], 120);
    scheduler.dispose();
    ctx.currentTime = 4;
    vi.advanceTimersByTime(100);

    expect(on).toHaveLength(0);
    expect(scheduler.start("t1", [note(0)], 120)).toBeNull();
  });
});
