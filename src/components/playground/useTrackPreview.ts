"use client";

/**
 * Auditions in the Playground: always through the track's own instrument.
 *
 * Placing a note, tapping a key column, playing a pattern card — all of them
 * go to the engine's per-track preview, so what you hear is what that part
 * of the arrangement will sound like, mixed through its own fader, and it
 * layers over a running transport instead of interrupting it.
 */
import { useCallback, useMemo } from "react";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useProjectStore } from "@/lib/state/project-store";
import type { PreviewNote } from "@/lib/audio/preview";
import type { ID, NoteEvent } from "@/lib/schema/types";

/** Length of a single tapped note, in beats. */
const TAP_BEATS = 0.5;

export interface TrackPreview {
  /** One note. Returns false when the track has nothing to play it with. */
  note(trackId: ID | null | undefined, pitch: number, velocity?: number): boolean;
  /** A whole pattern. Returns its length in seconds, or null if silent. */
  notes(trackId: ID | null | undefined, notes: readonly NoteEvent[]): number | null;
  /** Drop what has not sounded yet (sounding notes ring out). */
  stop(trackId?: ID): void;
}

export function useTrackPreview(): TrackPreview {
  const engineRef = useEngineRef();
  const tempo = useProjectStore((s) => s.project.tempo);

  const notes = useCallback(
    (trackId: ID | null | undefined, list: readonly NoteEvent[]): number | null => {
      if (!trackId) return null;
      const playable: PreviewNote[] = list
        .filter((note) => !note.muted)
        .map((note) => ({
          pitch: note.pitch,
          velocity: note.velocity,
          startBeat: note.startBeat,
          durationBeats: note.durationBeats,
        }));
      if (playable.length === 0) return null;
      return engineRef.current?.previewTrackNotes(trackId, playable, tempo) ?? null;
    },
    [engineRef, tempo],
  );

  const note = useCallback(
    (trackId: ID | null | undefined, pitch: number, velocity = 100): boolean => {
      if (!trackId) return false;
      const length = engineRef.current?.previewTrackNotes(
        trackId,
        [{ pitch, velocity, startBeat: 0, durationBeats: TAP_BEATS }],
        tempo,
      );
      return length !== null && length !== undefined;
    },
    [engineRef, tempo],
  );

  const stop = useCallback(
    (trackId?: ID) => engineRef.current?.stopTrackPreview(trackId),
    [engineRef],
  );

  return useMemo(() => ({ note, notes, stop }), [note, notes, stop]);
}
