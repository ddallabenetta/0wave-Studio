"use client";

/**
 * Putting a pattern somewhere.
 *
 * Creating a pattern and placing it are one gesture in this Playground: a
 * pattern with no clip has no instrument, no position and no sound, and the
 * three surfaces that can create one (the timeline, the pattern strip, the
 * editor's "place it" affordance) must all produce the same thing. So the
 * rules live here rather than in whichever component was written first.
 */
import { useProjectStore } from "@/lib/state/project-store";
import { createId } from "@/lib/schema/factories";
import type { ID, Track } from "@/lib/schema/types";

/** Default pattern size for anything created from the Playground. */
export const DEFAULT_PATTERN_BEATS = 4;
export const DEFAULT_PATTERN_RESOLUTION = 4;

/**
 * Where a new clip lands on a track: at the playhead when the transport has
 * moved, otherwise right after the last clip, so repeated inserts never
 * stack on top of each other.
 */
export function insertBeatFor(track: Track | undefined, positionBeats: number): number {
  if (positionBeats > 0) return positionBeats;
  if (!track || track.clips.length === 0) return 0;
  return Math.max(...track.clips.map((c) => c.startBeat + c.lengthBeats));
}

/** Place an existing pattern on a track. Returns the new clip's id. */
export function placePatternClip(trackId: ID, patternId: ID, atBeat: number): ID {
  const store = useProjectStore.getState();
  const pattern = store.project.patterns.find((p) => p.id === patternId);
  const lengthBeats = pattern?.lengthBeats ?? DEFAULT_PATTERN_BEATS;
  const clipId = createId();
  store.addClip(trackId, {
    kind: "pattern",
    id: clipId,
    patternId,
    startBeat: Math.max(0, atBeat),
    lengthBeats,
    // A one-bar figure dropped on a four-bar clip should repeat, which is
    // what everybody expects a pattern to do.
    loopEnabled: true,
    transpose: 0,
    velocityMultiplier: 1,
  });
  return clipId;
}

/**
 * Create a pattern and place it on a track in one step, so it has an
 * instrument from the moment it exists.
 */
export function createPatternOnTrack(
  trackId: ID,
  atBeat: number,
  name?: string,
): { patternId: ID; clipId: ID } {
  const store = useProjectStore.getState();
  const patternId = store.addPattern(DEFAULT_PATTERN_BEATS, DEFAULT_PATTERN_RESOLUTION);
  if (name) store.updatePattern(patternId, (pattern) => void (pattern.name = name));
  const clipId = placePatternClip(trackId, patternId, atBeat);
  return { patternId, clipId };
}
