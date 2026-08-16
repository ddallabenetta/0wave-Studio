import { describe, expect, it } from "vitest";
import { clipRepeats, patternPreviewCells } from "@/components/playground/patternGeometry";
import type { NoteEvent } from "@/lib/schema/types";

function note(
  startBeat: number,
  pitch: number,
  durationBeats = 0.5,
  velocity = 127,
): NoteEvent {
  return { id: `${startBeat}-${pitch}`, pitch, startBeat, durationBeats, velocity, muted: false };
}

describe("patternPreviewCells", () => {
  it("returns nothing for an empty pattern", () => {
    expect(patternPreviewCells([], 4)).toEqual([]);
  });

  it("normalises time against the pattern length", () => {
    const cells = patternPreviewCells([note(0, 60), note(2, 60), note(3, 60)], 4);
    expect(cells.map((c) => c.x)).toEqual([0, 0.5, 0.75]);
    expect(cells[0].width).toBeCloseTo(0.125);
  });

  it("keeps a single-pitch pattern to one row of the minimum window", () => {
    const cells = patternPreviewCells([note(0, 60), note(1, 60)], 4);
    expect(cells[0].height).toBeCloseTo(1 / 8);
    expect(new Set(cells.map((c) => c.y)).size).toBe(1);
  });

  it("puts higher pitches above lower ones", () => {
    const [low, high] = patternPreviewCells([note(0, 48), note(1, 72)], 4);
    expect(high.y).toBeLessThan(low.y);
  });

  it("spreads a wide pitch range over its own rows", () => {
    const cells = patternPreviewCells([note(0, 36), note(1, 84)], 4);
    // 49 semitones of span, so one row is 1/49 of the height.
    expect(cells[0].height).toBeCloseTo(1 / 49);
    expect(cells[0].y).toBeCloseTo(48 / 49);
    expect(cells[1].y).toBeCloseTo(0);
  });

  it("drops notes past the end of the pattern and clips long ones", () => {
    const cells = patternPreviewCells([note(0, 60, 99), note(9, 60)], 4);
    expect(cells).toHaveLength(1);
    expect(cells[0].width).toBeCloseTo(1);
  });

  it("keeps very short notes visible", () => {
    const [cell] = patternPreviewCells([note(0, 60, 0.01)], 16);
    expect(cell.width).toBeGreaterThan(0);
  });

  it("maps velocity to 0..1", () => {
    const [soft] = patternPreviewCells([note(0, 60, 0.5, 0)], 4);
    expect(soft.velocity).toBe(0);
    const [loud] = patternPreviewCells([note(0, 60, 0.5, 127)], 4);
    expect(loud.velocity).toBe(1);
  });
});

describe("clipRepeats", () => {
  it("shows the pattern once when the clip does not loop", () => {
    expect(clipRepeats(16, 4, false)).toBe(1);
  });

  it("tiles a looped clip", () => {
    expect(clipRepeats(16, 4, true)).toBe(4);
  });

  it("counts a partial repetition", () => {
    expect(clipRepeats(10, 4, true)).toBe(3);
  });

  it("never returns zero", () => {
    expect(clipRepeats(0, 4, true)).toBe(1);
  });
});
