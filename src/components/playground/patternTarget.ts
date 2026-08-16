"use client";

/**
 * Which instrument a pattern is heard through.
 *
 * A pattern owns notes, not a sound. What it sounds like is decided by where
 * it is placed: a clip on a track, and that track's assigned sound. So the
 * note editors never ask the user to pick an instrument — they resolve it
 * from the arrangement, and drop the same pattern on the bass track to hear
 * it as a bass.
 *
 * When a pattern is placed more than once, the placement being edited wins:
 * the selected clip, then the selected track, then the first clip in track
 * order. The resolver is pure so that rule is testable on its own.
 */
import { useMemo } from "react";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import type { Selection } from "@/lib/state/ui-store";
import type { ID, Project, SoundDefinition, Track } from "@/lib/schema/types";

export interface PatternPlacement {
  trackId: ID;
  clipId: ID;
}

export interface PatternTarget {
  /** Every clip in the arrangement that plays this pattern. */
  placements: PatternPlacement[];
  /** The placement the editors follow; null when the pattern is unplaced. */
  active: PatternPlacement | null;
  /** Track of the active placement. */
  track: Track | null;
  /** Sound assigned to that track: what an audition will play through. */
  sound: SoundDefinition | null;
}

const EMPTY: PatternTarget = { placements: [], active: null, track: null, sound: null };

/** Every clip playing `patternId`, in track order then clip order. */
export function findPatternPlacements(project: Project, patternId: ID | null): PatternPlacement[] {
  if (!patternId) return [];
  const placements: PatternPlacement[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.kind === "pattern" && clip.patternId === patternId) {
        placements.push({ trackId: track.id, clipId: clip.id });
      }
    }
  }
  return placements;
}

export function resolvePatternTarget(
  project: Project,
  patternId: ID | null,
  selection: Selection,
): PatternTarget {
  const placements = findPatternPlacements(project, patternId);
  if (placements.length === 0) return EMPTY;

  const selectedClip =
    selection?.kind === "pattern-clip"
      ? placements.find((p) => p.clipId === selection.clipId)
      : undefined;
  const selectedTrack =
    selection && selection.kind !== "note"
      ? placements.find((p) => p.trackId === selection.trackId)
      : undefined;

  const active = selectedClip ?? selectedTrack ?? placements[0];
  const track = project.tracks.find((t) => t.id === active.trackId) ?? null;
  const sound = track?.soundId
    ? project.sounds.find((s) => s.id === track.soundId) ?? null
    : null;
  return { placements, active, track, sound };
}

/** Store-backed `resolvePatternTarget` for the Playground editors. */
export function usePatternTarget(patternId: ID | null): PatternTarget {
  const project = useProjectStore((s) => s.project);
  const selection = useUiStore((s) => s.selection);
  return useMemo(
    () => resolvePatternTarget(project, patternId, selection),
    [project, patternId, selection],
  );
}
