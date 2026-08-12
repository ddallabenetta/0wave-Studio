import { describe, expect, it } from "vitest";
import {
  beatsToSeconds,
  formatPosition,
  frequencyToKnob,
  knobToFrequency,
  nameToNote,
  noteToFrequency,
  noteToName,
  quantizeBeat,
  quantizeDuration,
  secondsToBeats,
  swingOffsetBeats,
  velocityToGain,
} from "@/lib/music/theory";

describe("note/frequency conversion", () => {
  it("maps A4 to 440 Hz", () => {
    expect(noteToFrequency(69)).toBeCloseTo(440, 6);
  });
  it("doubles frequency per octave", () => {
    expect(noteToFrequency(81)).toBeCloseTo(880, 6);
    expect(noteToFrequency(57)).toBeCloseTo(220, 6);
  });
  it("maps C4 to middle C", () => {
    expect(noteToFrequency(60)).toBeCloseTo(261.6256, 3);
  });
});

describe("note names", () => {
  it("round-trips MIDI to name", () => {
    expect(noteToName(60)).toBe("C4");
    expect(noteToName(69)).toBe("A4");
    expect(noteToName(61)).toBe("C#4");
    expect(nameToNote(noteToName(60))).toBe(60);
    expect(nameToNote("F#3")).toBe(54);
    expect(nameToNote("Bb2")).toBe(46);
  });
  it("rejects garbage", () => {
    expect(nameToNote("H4")).toBeNull();
    expect(nameToNote("C")).toBeNull();
    expect(nameToNote("")).toBeNull();
  });
});

describe("tempo math", () => {
  it("converts beats and seconds both ways", () => {
    expect(beatsToSeconds(4, 120)).toBeCloseTo(2, 6);
    expect(secondsToBeats(2, 120)).toBeCloseTo(4, 6);
    expect(beatsToSeconds(1, 60)).toBeCloseTo(1, 6);
  });
});

describe("quantization", () => {
  it("snaps to the nearest step", () => {
    expect(quantizeBeat(0.26, 4)).toBeCloseTo(0.25);
    expect(quantizeBeat(0.13, 4)).toBeCloseTo(0.25);
    expect(quantizeBeat(0.12, 4)).toBeCloseTo(0);
  });
  it("keeps off-grid value when resolution is degenerate", () => {
    expect(quantizeBeat(0.37, 0)).toBeCloseTo(0.37);
  });
  it("never returns a zero duration", () => {
    expect(quantizeDuration(0.01, 4)).toBeCloseTo(0.25);
    expect(quantizeDuration(1.3, 4)).toBeCloseTo(1.25);
  });
});

describe("swing", () => {
  it("shifts odd-numbered steps only", () => {
    // stepsPerBeat 4: step 1 (0.25 beats) is the first swung step.
    // offset = swing * 0.5 * (1/stepsPerBeat); max swing = half a step
    expect(swingOffsetBeats(0.25, 4, 0.5)).toBeCloseTo(0.0625);
    expect(swingOffsetBeats(0, 4, 0.5)).toBe(0);
    expect(swingOffsetBeats(0.5, 4, 0.5)).toBe(0);
    expect(swingOffsetBeats(0.75, 4, 0.5)).toBeCloseTo(0.0625);
    expect(swingOffsetBeats(0.25, 4, 1)).toBeCloseTo(0.125);
  });
  it("leaves off-grid notes untouched", () => {
    expect(swingOffsetBeats(0.26, 4, 1)).toBe(0);
  });
  it("zero swing means zero offset", () => {
    expect(swingOffsetBeats(0.25, 4, 0)).toBe(0);
  });
});

describe("position formatting", () => {
  it("formats 1-based bars.beats.subdivision", () => {
    expect(formatPosition(0, 4)).toBe("1.1.1");
    expect(formatPosition(4, 4)).toBe("2.1.1");
    expect(formatPosition(5.5, 4)).toBe("2.2.3");
  });
});

describe("velocity", () => {
  it("scales between 1-sensitivity and 1", () => {
    expect(velocityToGain(127, 1)).toBeCloseTo(1);
    expect(velocityToGain(0, 1)).toBeCloseTo(0);
    expect(velocityToGain(127, 0)).toBeCloseTo(1);
    expect(velocityToGain(0, 0.5)).toBeCloseTo(0.5);
  });
});

describe("log frequency mapping", () => {
  it("round-trips through the knob domain", () => {
    for (const hz of [20, 100, 440, 1000, 8000, 20000]) {
      expect(knobToFrequency(frequencyToKnob(hz))).toBeCloseTo(hz, 3);
    }
  });
  it("clamps out-of-range input", () => {
    expect(knobToFrequency(2)).toBe(20000);
    expect(knobToFrequency(-1)).toBe(20);
  });
});
