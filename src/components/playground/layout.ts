/**
 * Geometry shared by the track list and the timeline.
 *
 * The two are separate scrollers side by side, so a track row and its lane
 * only line up while both agree on these numbers: one row height, and the
 * height of the bar ruler the track list has to leave room for.
 */

/** Height of one track row, and of its lane in the timeline. */
export const TRACK_ROW_HEIGHT = 64;

/** Height of the timeline's bar ruler; matched by a spacer in the track list. */
export const TIMELINE_RULER_HEIGHT = 24;
