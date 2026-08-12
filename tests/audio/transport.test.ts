import { describe, expect, it } from "vitest";
import type { LoopRange, NoteEvent } from "@/lib/schema/types";
import { PatternScheduler } from "@/lib/audio/transport";

function note(startBeat: number, durationBeats: number, pitch = 60, velocity = 100, muted = false): NoteEvent {
  return { id: `n-${startBeat}-${pitch}`, pitch, startBeat, durationBeats, velocity, muted };
}

const NO_LOOP: LoopRange = { enabled: false, startBeat: 0, endBeat: 8 };

function onBeats(events: { type: string; beat: number }[]): number[] {
  return events.filter((e) => e.type === "on").map((e) => e.beat);
}

describe("PatternScheduler", () => {
  it("emits on/off events for notes inside the window", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0.5, 0.25), note(2, 1)], 0);
    const events = s.eventsFor(0, 3, 0, NO_LOOP);
    expect(onBeats(events)).toEqual([0.5, 2]);
    const offs = events.filter((e) => e.type === "off").map((e) => e.beat);
    expect(offs).toEqual([0.75, 3]);
  });

  it("drops events before the window start (seek forward)", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0.5, 0.25), note(2, 1)], 0);
    const events = s.eventsFor(1, 3, 0, NO_LOOP);
    expect(onBeats(events)).toEqual([2]);
  });

  it("repeats notes every loop length while playing", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0.5, 0.25)], 0);
    const loop: LoopRange = { enabled: true, startBeat: 0, endBeat: 8 };
    const events = s.eventsFor(0, 20, 0, loop);
    expect(onBeats(events)).toEqual([0.5, 8.5, 16.5]);
  });

  it("stops repeating notes at untilBeat", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0.5, 0.25)], 0, { untilBeat: 12 });
    const loop: LoopRange = { enabled: true, startBeat: 0, endBeat: 8 };
    const events = s.eventsFor(0, 20, 0, loop);
    expect(onBeats(events)).toEqual([0.5, 8.5]);
  });

  it("cuts notes at untilBeat", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0.5, 4)], 0, { untilBeat: 2 });
    const events = s.eventsFor(0, 4, 0, NO_LOOP);
    const offs = events.filter((e) => e.type === "off").map((e) => e.beat);
    expect(offs).toEqual([2]);
  });

  it("cuts long notes at the next loop iteration's start", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0.5, 12)], 0);
    const loop: LoopRange = { enabled: true, startBeat: 0, endBeat: 8 };
    const events = s.eventsFor(0, 9, 0, loop);
    const offs = events.filter((e) => e.type === "off").map((e) => e.beat);
    // Iteration 1: natural end 12.5, but the next trigger at 8.5 cuts it.
    // Iteration 2 (on at 8.5): natural end 20.5, next trigger at 16.5 cuts it.
    expect(offs).toEqual([8.5, 16.5]);
  });

  it("skips notes that never start before untilBeat", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(10, 1)], 0, { untilBeat: 8 });
    const events = s.eventsFor(0, 20, 0, NO_LOOP);
    expect(events).toEqual([]);
  });

  it("applies swing to even subdivisions at the inferred grid", () => {
    const s = new PatternScheduler();
    // 16th-note grid: offbeat 8ths (steps 1 and 3) get delayed.
    s.schedule("t1", [note(0.25, 0.1), note(0.75, 0.1), note(1, 0.1)], 0);
    const events = s.eventsFor(0, 2, 0.5, NO_LOOP);
    const beats = onBeats(events);
    expect(beats[0]).toBeCloseTo(0.25 + 0.0625, 6);
    expect(beats[1]).toBeCloseTo(0.75 + 0.0625, 6);
    expect(beats[2]).toBe(1); // downbeat untouched
  });

  it("applies transpose and velocity multiplier", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0, 0.5, 60, 100)], 0, { transpose: 7, velocityMultiplier: 0.5 });
    const events = s.eventsFor(0, 1, 0, NO_LOOP);
    expect(events[0]).toMatchObject({ type: "on", note: 67, velocity: 50 });
  });

  it("skips muted notes", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0, 0.5, 60, 100, true), note(1, 0.5)], 0);
    const events = s.eventsFor(0, 2, 0, NO_LOOP);
    expect(onBeats(events)).toEqual([1]);
  });

  it("clamps transposed pitch into the MIDI range", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0, 0.5, 125, 100)], 0, { transpose: 12 });
    const events = s.eventsFor(0, 1, 0, NO_LOOP);
    expect(events[0].note).toBe(127);
  });

  it("infers the coarsest grid that explains the notes", () => {
    const s = new PatternScheduler();
    // 8th-note pattern: 0.5 is an odd step at 2 steps/beat.
    expect(s.stepsPerBeatFor([note(0, 0.25), note(0.5, 0.25)])).toBe(2);
    // 16th-note pattern: 0.25 is an odd step at 4 steps/beat.
    expect(s.stepsPerBeatFor([note(0, 0.25), note(0.25, 0.25)])).toBe(4);
    // 32nd-note pattern.
    expect(s.stepsPerBeatFor([note(0, 0.25), note(0.125, 0.25)])).toBe(8);
    // Off-grid notes never swing; grid choice is irrelevant.
    expect(s.stepsPerBeatFor([note(0.33, 0.25)])).toBe(2);
  });

  it("clears and removes schedules", () => {
    const s = new PatternScheduler();
    s.schedule("t1", [note(0, 0.5)], 0);
    s.remove("t1");
    expect(s.eventsFor(0, 2, 0, NO_LOOP)).toEqual([]);
    s.schedule("t1", [note(0, 0.5)], 0);
    s.clear();
    expect(s.eventsFor(0, 2, 0, NO_LOOP)).toEqual([]);
  });
});
