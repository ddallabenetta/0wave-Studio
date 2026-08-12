import { describe, expect, it } from "vitest";
import { flattenTrackNotes } from "@/components/playground/usePlaybackSync";
import { createEmptyProject, createPattern, createTrack } from "@/lib/schema/factories";
import type { PatternClip, Project, Track } from "@/lib/schema/types";

function projectWithClip(clip: Partial<PatternClip> = {}): { project: Project; track: Track } {
  const project = createEmptyProject();
  const pattern = createPattern("P", 4, 4);
  pattern.id = "pat-1";
  pattern.notes = [
    { id: "n1", pitch: 60, startBeat: 0, durationBeats: 0.5, velocity: 100, muted: false },
    { id: "n2", pitch: 64, startBeat: 2, durationBeats: 0.5, velocity: 80, muted: false },
    { id: "n3", pitch: 67, startBeat: 3, durationBeats: 0.5, velocity: 60, muted: true },
  ];
  project.patterns.push(pattern);

  const track = createTrack("T");
  track.clips.push({
    kind: "pattern",
    id: "clip-1",
    patternId: "pat-1",
    startBeat: 8,
    lengthBeats: 4,
    loopEnabled: false,
    transpose: 0,
    velocityMultiplier: 1,
    ...clip,
  });
  project.tracks.push(track);
  return { project, track };
}

describe("flattenTrackNotes", () => {
  it("positions notes at absolute timeline beats", () => {
    const { project, track } = projectWithClip();
    const notes = flattenTrackNotes(project, track);
    expect(notes.map((n) => n.startBeat)).toEqual([8, 10]);
  });

  it("drops muted notes", () => {
    const { project, track } = projectWithClip();
    const notes = flattenTrackNotes(project, track);
    expect(notes.some((n) => n.pitch === 67)).toBe(false);
  });

  it("bakes clip transpose into pitch", () => {
    const { project, track } = projectWithClip({ transpose: 12 });
    const notes = flattenTrackNotes(project, track);
    expect(notes.map((n) => n.pitch)).toEqual([72, 76]);
  });

  it("bakes the velocity multiplier and clamps to the MIDI range", () => {
    const { project, track } = projectWithClip({ velocityMultiplier: 2 });
    const notes = flattenTrackNotes(project, track);
    expect(notes.map((n) => n.velocity)).toEqual([127, 127]);
  });

  it("repeats the pattern across a looped clip", () => {
    const { project, track } = projectWithClip({ loopEnabled: true, lengthBeats: 12 });
    const notes = flattenTrackNotes(project, track);
    // 3 repeats of a 4-beat pattern, 2 audible notes each
    expect(notes).toHaveLength(6);
    expect(notes.map((n) => n.startBeat)).toEqual([8, 10, 12, 14, 16, 18]);
  });

  it("cuts notes that fall past the end of the clip", () => {
    const { project, track } = projectWithClip({ lengthBeats: 2 });
    const notes = flattenTrackNotes(project, track);
    expect(notes.map((n) => n.startBeat)).toEqual([8]);
  });

  it("shortens a note so it never runs past the clip end", () => {
    const { project, track } = projectWithClip({ startBeat: 0, lengthBeats: 2.25 });
    const notes = flattenTrackNotes(project, track);
    const last = notes[notes.length - 1];
    expect(last.startBeat + last.durationBeats).toBeLessThanOrEqual(2.25 + 1e-9);
  });

  it("gives every generated note a unique id", () => {
    const { project, track } = projectWithClip({ loopEnabled: true, lengthBeats: 12 });
    const notes = flattenTrackNotes(project, track);
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
  });

  it("ignores audio clips and unknown patterns", () => {
    const { project, track } = projectWithClip({ patternId: "missing" });
    track.clips.push({
      kind: "audio",
      id: "audio-1",
      assetId: "asset-1",
      startBeat: 0,
      lengthBeats: 4,
      offsetSeconds: 0,
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 1,
    });
    expect(flattenTrackNotes(project, track)).toEqual([]);
  });
});
