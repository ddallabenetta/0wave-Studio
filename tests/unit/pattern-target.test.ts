import { describe, expect, it } from "vitest";
import {
  findPatternPlacements,
  resolvePatternTarget,
} from "@/components/playground/patternTarget";
import {
  createEmptyProject,
  createPattern,
  createSynthSound,
  createTrack,
} from "@/lib/schema/factories";
import type { Project } from "@/lib/schema/types";

/**
 * Two instrument tracks with their own sound; the pattern is placed on the
 * first one, and (in some tests) on the second one as well.
 */
function fixture(options: { alsoOnBass?: boolean } = {}): Project {
  const project = createEmptyProject();

  const drumSound = createSynthSound("Kick");
  drumSound.id = "sound-kick";
  const bassSound = createSynthSound("Round Bass");
  bassSound.id = "sound-bass";
  project.sounds.push(drumSound, bassSound);

  const pattern = createPattern("Beat", 4, 4);
  pattern.id = "pattern-1";
  project.patterns.push(pattern);

  const drums = createTrack("Drums", "instrument", 0);
  drums.id = "track-drums";
  drums.soundId = "sound-kick";
  drums.clips.push({
    kind: "pattern",
    id: "clip-drums",
    patternId: "pattern-1",
    startBeat: 0,
    lengthBeats: 4,
    loopEnabled: true,
    transpose: 0,
    velocityMultiplier: 1,
  });

  const bass = createTrack("Bass", "instrument", 1);
  bass.id = "track-bass";
  bass.soundId = "sound-bass";
  if (options.alsoOnBass) {
    bass.clips.push({
      kind: "pattern",
      id: "clip-bass",
      patternId: "pattern-1",
      startBeat: 8,
      lengthBeats: 4,
      loopEnabled: true,
      transpose: 0,
      velocityMultiplier: 1,
    });
  }

  project.tracks.push(drums, bass);
  return project;
}

describe("findPatternPlacements", () => {
  it("finds every clip playing the pattern, in track order", () => {
    const placements = findPatternPlacements(fixture({ alsoOnBass: true }), "pattern-1");
    expect(placements).toEqual([
      { trackId: "track-drums", clipId: "clip-drums" },
      { trackId: "track-bass", clipId: "clip-bass" },
    ]);
  });

  it("returns nothing for an unplaced pattern", () => {
    expect(findPatternPlacements(fixture(), "pattern-unknown")).toEqual([]);
    expect(findPatternPlacements(fixture(), null)).toEqual([]);
  });
});

describe("resolvePatternTarget", () => {
  it("resolves the instrument from the only placement", () => {
    const target = resolvePatternTarget(fixture(), "pattern-1", null);
    expect(target.track?.id).toBe("track-drums");
    expect(target.sound?.name).toBe("Kick");
  });

  it("has no instrument when the pattern is not placed anywhere", () => {
    const target = resolvePatternTarget(fixture(), "pattern-unplaced", null);
    expect(target.active).toBeNull();
    expect(target.sound).toBeNull();
    expect(target.placements).toEqual([]);
  });

  it("follows the selected clip when the pattern is placed twice", () => {
    const project = fixture({ alsoOnBass: true });
    const target = resolvePatternTarget(project, "pattern-1", {
      kind: "pattern-clip",
      trackId: "track-bass",
      clipId: "clip-bass",
    });
    expect(target.track?.id).toBe("track-bass");
    expect(target.sound?.name).toBe("Round Bass");
  });

  it("falls back to the selected track", () => {
    const project = fixture({ alsoOnBass: true });
    const target = resolvePatternTarget(project, "pattern-1", {
      kind: "track",
      trackId: "track-bass",
    });
    expect(target.active?.clipId).toBe("clip-bass");
  });

  it("falls back to the first placement when the selection is elsewhere", () => {
    const project = fixture({ alsoOnBass: true });
    const target = resolvePatternTarget(project, "pattern-1", {
      kind: "note",
      patternId: "pattern-1",
      noteId: "n1",
    });
    expect(target.active?.clipId).toBe("clip-drums");
  });

  it("reports the track even when it has no sound assigned", () => {
    const project = fixture();
    project.tracks[0].soundId = undefined;
    const target = resolvePatternTarget(project, "pattern-1", null);
    expect(target.track?.id).toBe("track-drums");
    expect(target.sound).toBeNull();
  });
});
