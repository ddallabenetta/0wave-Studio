# Piano Roll

The Piano Roll is a mandatory, real editor in the Playground. It is one of two
views over `Pattern.notes: NoteEvent[]`.

## Non-negotiables

- It edits the SAME `NoteEvent[]` as the Pattern Editor (step grid). A change in
  one is immediately visible in the other. No second copy of note data.
- First version may be basic but MUST be usable: create, move (x and y), resize
  duration, delete, select, velocity, snap, scroll, zoom, synced playhead.
- Overlapping notes are allowed on polyphonic tracks.
- Not required for MVP: MPE, per-note pitch bend/aftertouch, scale fold, ghost
  notes, drawn automation lanes, microtuning, expression lanes.

## Layout

```
┌─ time axis (beats/bars, snap grid, scrollable, zoomable) ─┐
│ pitch axis │  note canvas (scroll x + y, zoom x)            │
│ (keyboard) │                                                │
└────────────┴────────────────────────────────────────────────┘
```

- Vertical: piano keyboard strip on the left (labels from `noteToName`), rows
  map to MIDI pitch. Clicking a key row triggers a note preview.
- Horizontal: beats → pixels via `pixelsPerBeat` (zoomable). Bar lines stronger
  than beat lines; subdivision lines from the current snap.
- Snap: `ui-store.pianoRollSnap` (steps per beat; default 4 = 16th). Configurable.

## Interactions

| Action | Behavior |
|---|---|
| Click empty cell | Create a note at snapped start, pitch = row, duration = one snap step, velocity = current draw velocity. Preview it through the engine. |
| Click a note | Select it (single). Shift-click adds to multi-select. |
| Drag a note | Move horizontally (snapped) and vertically (pitch rows). Immediate, stable, no React churn per pointermove (use transform during drag). |
| Drag right edge | Resize duration (min one snap step). |
| Double-click | Delete the note. |
| Right-click / context | Delete note; duplicate note. |
| Drag on empty region | Rectangle multi-select (basic). |
| Backspace/Delete | Remove selected notes. |
| Alt-drag | Duplicate + move selection. |
| Arrows | Nudge selected notes by one snap step / one semitone. |
| Quantize | Snap all selected note starts to the grid (uses `quantizeBeat`). |

Velocity editing: an inspector panel or a simple lower lane with vertical drag
+ numeric feedback. Whichever is chosen, it writes `velocity` on the NoteEvent.

## Data flow

All mutations go through the project store (`addNote`, `updateNote`,
`deleteNote`, `deleteNotes`) which owns the canonical `NoteEvent[]`. The Piano
Roll never mutates arrays directly. During a drag, local transform state drives
the visual; on pointer-up the store action commits the change (undoable).

## Accessibility

- Keyboard-operable for the fundamental operations: navigate a cursor, insert
  note at cursor, delete, move selection with arrows.
- Notes expose an accessible name (`noteToName(pitch)` + start/duration) to
  screen readers, at least on selection.

## Performance

- Render notes with absolutely positioned elements keyed by `NoteEvent.id`; only
  re-render the changed note (or the selection set). Avoid re-rendering the
  whole grid on every pointermove.
- Playhead and analyzer update in an isolated layer (canvas or a single
  absolutely-positioned element driven by `ui-store.positionBeats`), never by
  re-rendering the note list.
- Must stay smooth with 200+ notes.
