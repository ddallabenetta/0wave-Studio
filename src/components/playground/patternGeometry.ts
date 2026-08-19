/**
 * Pattern thumbnails, as pure geometry.
 *
 * A pattern is a name in a list until you can see it. These helpers turn a
 * note list into normalised rectangles (0..1 in both axes) that any surface
 * can draw at any size: the pattern picker's cards, the clips on the
 * timeline, the inspector. No React, no DOM, no colour decisions — so the
 * shape of a thumbnail is testable on its own.
 */
import type { NoteEvent } from "@/lib/schema/types";

export interface PreviewCell {
  /** Left edge, 0..1 of the pattern length. */
  x: number;
  /** Top edge, 0..1 of the drawn pitch range (high pitches on top). */
  y: number;
  /** Width, 0..1 of the pattern length; at least MIN_WIDTH so it stays visible. */
  width: number;
  /** Row height, 0..1. */
  height: number;
  /** 0..1, for opacity. */
  velocity: number;
}

/**
 * Fewest pitch rows a thumbnail is drawn with. Without a floor, a one-pitch
 * drum pattern would draw a full-height band and read as a wall of sound.
 */
const MIN_ROWS = 8;
/** Thinnest a note is drawn, so a 1/32 hit does not vanish. */
const MIN_WIDTH = 0.012;

/**
 * Normalised note rectangles, ordered as given. Notes beyond the pattern
 * length are clipped away — they do not sound either (see flattenTrackNotes).
 */
export function patternPreviewCells(
  notes: readonly NoteEvent[],
  lengthBeats: number,
  options: { minRows?: number } = {},
): PreviewCell[] {
  const length = Math.max(lengthBeats, 0.25);
  const minRows = Math.max(1, options.minRows ?? MIN_ROWS);
  const visible = notes.filter((note) => note.startBeat < length);
  if (visible.length === 0) return [];

  let low = Infinity;
  let high = -Infinity;
  for (const note of visible) {
    if (note.pitch < low) low = note.pitch;
    if (note.pitch > high) high = note.pitch;
  }
  // Expand a narrow range around its centre so the drawn band keeps its
  // proportions whether the pattern is a kick or a two-octave line.
  const span = high - low + 1;
  const rows = Math.max(minRows, span);
  const padding = (rows - span) / 2;
  const top = high + padding;

  const height = 1 / rows;
  return visible.map((note) => {
    const x = Math.max(0, note.startBeat / length);
    const width = Math.max(MIN_WIDTH, Math.min(note.durationBeats / length, 1 - x));
    return {
      x,
      y: (top - note.pitch) / rows,
      width,
      height,
      velocity: Math.max(0, Math.min(1, note.velocity / 127)),
    };
  });
}

/**
 * How many times a pattern repeats inside a clip. A looped clip tiles the
 * pattern; a plain one shows it once, however long the clip is.
 */
export function clipRepeats(
  clipLengthBeats: number,
  patternLengthBeats: number,
  loopEnabled: boolean,
): number {
  if (!loopEnabled) return 1;
  const patternLength = Math.max(patternLengthBeats, 0.25);
  return Math.max(1, Math.ceil(clipLengthBeats / patternLength));
}
