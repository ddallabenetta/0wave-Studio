"use client";

/**
 * Piano Roll: the second view over the same Pattern.notes list.
 *
 * Create, move, resize, delete, multi-select, quantize and velocity editing
 * all write through the project store, so any change appears immediately in
 * the Pattern Editor and vice versa.
 *
 * Auditioning a note plays it through the instrument of the track this
 * pattern is placed on — the same rule the Pattern Editor follows — so the
 * two editors never disagree about what the pattern sounds like.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, SegmentedControl } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { noteToName, quantizeBeat } from "@/lib/music/theory";
import { PatternTargetChip } from "./PatternTargetChip";
import { usePatternTarget } from "./patternTarget";
import { useTrackPreview } from "./useTrackPreview";
import { strings } from "@/i18n";
import type { NoteEvent } from "@/lib/schema/types";

const ROW_HEIGHT = 14;
const LOW_NOTE = 36;
const HIGH_NOTE = 84;
const BLACK_KEYS = [1, 3, 6, 8, 10];

const SNAP_OPTIONS = [
  { value: "1", label: "1/4" },
  { value: "2", label: "1/8" },
  { value: "4", label: "1/16" },
  { value: "8", label: "1/32" },
];

type DragMode = "move" | "resize";

interface DragState {
  mode: DragMode;
  noteId: string;
  startX: number;
  startY: number;
  originStart: number;
  originPitch: number;
  originDuration: number;
  moved: boolean;
  /** Whether this drag has already put its starting state on the undo stack. */
  undoPushed: boolean;
}

export function PianoRoll({ patternId }: { patternId: string | null }) {
  const pattern = useProjectStore((s) => s.project.patterns.find((p) => p.id === patternId));
  const addNote = useProjectStore((s) => s.addNote);
  const updateNote = useProjectStore((s) => s.updateNote);
  const deleteNote = useProjectStore((s) => s.deleteNote);
  const deleteNotes = useProjectStore((s) => s.deleteNotes);
  const snap = useUiStore((s) => s.pianoRollSnap);
  const setSnap = useUiStore((s) => s.setPianoRollSnap);
  const setSelection = useUiStore((s) => s.setSelection);
  const positionBeats = useUiStore((s) => s.positionBeats);
  const transportPlaying = useUiStore((s) => s.transportPlaying);
  const target = usePatternTarget(patternId);
  const trackPreview = useTrackPreview();

  const [pixelsPerBeat, setPixelsPerBeat] = useState(64);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const drag = useRef<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef<HTMLDivElement | null>(null);

  /** Keep the pitch keyboard aligned with the grid's vertical scroll. */
  const syncKeys = useCallback((scrollTop: number) => {
    if (keysRef.current) keysRef.current.style.transform = `translateY(${-scrollTop}px)`;
  }, []);

  const rows = useMemo(
    () => Array.from({ length: HIGH_NOTE - LOW_NOTE + 1 }, (_, i) => HIGH_NOTE - i),
    [],
  );

  /**
   * Open on the notes that exist, not on the top of the pitch range. Runs
   * once per pattern so it never fights the user's own scrolling.
   */
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !pattern || scrolledFor.current === pattern.id) return;
    scrolledFor.current = pattern.id;
    const pitches = pattern.notes.map((n) => n.pitch);
    const focus = pitches.length
      ? pitches.reduce((sum, p) => sum + p, 0) / pitches.length
      : 60;
    const scrollTarget = (HIGH_NOTE - focus) * ROW_HEIGHT - grid.clientHeight / 2;
    grid.scrollTop = Math.max(0, scrollTarget);
    syncKeys(grid.scrollTop);
  }, [pattern, syncKeys]);

  const previewTrackId = target.active?.trackId;
  const preview = useCallback(
    (pitch: number, velocity = 100) => {
      trackPreview.note(previewTrackId, pitch, velocity);
    },
    [trackPreview, previewTrackId],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const state = drag.current;
      if (!state || !pattern) return;
      const deltaBeats = (event.clientX - state.startX) / pixelsPerBeat;
      const deltaRows = Math.round((event.clientY - state.startY) / ROW_HEIGHT);
      state.moved = true;
      // One undo entry per gesture, as on the timeline: the first frame
      // carries the note's starting position, the rest are silent.
      const undoable = !state.undoPushed;
      state.undoPushed = true;

      if (state.mode === "move") {
        const nextStart = Math.max(0, quantizeBeat(state.originStart + deltaBeats, snap));
        const nextPitch = Math.max(0, Math.min(127, state.originPitch - deltaRows));
        updateNote(
          pattern.id,
          state.noteId,
          (note) => {
            note.startBeat = nextStart;
            note.pitch = nextPitch;
          },
          { undoable },
        );
      } else {
        const nextDuration = Math.max(1 / snap, quantizeBeat(state.originDuration + deltaBeats, snap));
        updateNote(pattern.id, state.noteId, (note) => void (note.durationBeats = nextDuration), {
          undoable,
        });
      }
    },
    [pattern, pixelsPerBeat, snap, updateNote],
  );

  if (!pattern) {
    return <p className="p-4 text-xs text-ink-faint">{strings.playground.pattern.newPattern}</p>;
  }

  const totalBeats = Math.max(pattern.lengthBeats, 4);
  /** Transport position folded into the pattern, via its clip's start. */
  const clipStart =
    target.track?.clips.find((clip) => clip.id === target.active?.clipId)?.startBeat ?? 0;
  const patternBeat =
    (((positionBeats - clipStart) % pattern.lengthBeats) + pattern.lengthBeats) %
    pattern.lengthBeats;

  const beginDrag = (event: React.PointerEvent, note: NoteEvent, mode: DragMode) => {
    event.stopPropagation();
    // Capture keeps the drag alive outside the element; a missing pointer
    // (synthetic events, cancelled gestures) must not break the interaction.
    try {
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      /* no active pointer; pointermove on the surface still drives the drag */
    }
    drag.current = {
      mode,
      noteId: note.id,
      startX: event.clientX,
      startY: event.clientY,
      originStart: note.startBeat,
      originPitch: note.pitch,
      originDuration: note.durationBeats,
      moved: false,
      undoPushed: false,
    };
    setSelection({ kind: "note", patternId: pattern.id, noteId: note.id });
    setSelectedIds((current) =>
      event.shiftKey ? [...new Set([...current, note.id])] : [note.id],
    );
  };

  const createNoteAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const x = event.clientX - rect.left + grid.scrollLeft;
    const y = event.clientY - rect.top + grid.scrollTop;
    const startBeat = Math.max(0, quantizeBeat(x / pixelsPerBeat, snap));
    const pitch = HIGH_NOTE - Math.floor(y / ROW_HEIGHT);
    if (pitch < LOW_NOTE || pitch > HIGH_NOTE) return;
    const id = addNote(pattern.id, {
      pitch,
      startBeat,
      durationBeats: 1 / snap,
      velocity: 100,
      muted: false,
    });
    setSelection({ kind: "note", patternId: pattern.id, noteId: id });
    setSelectedIds([id]);
    preview(pitch);
  };

  const nudge = (deltaBeats: number, deltaPitch: number) => {
    for (const id of selectedIds) {
      updateNote(pattern.id, id, (note) => {
        note.startBeat = Math.max(0, note.startBeat + deltaBeats);
        note.pitch = Math.max(0, Math.min(127, note.pitch + deltaPitch));
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge px-3 py-2">
        <SegmentedControl
          label="Snap"
          options={SNAP_OPTIONS}
          value={String(snap)}
          size="sm"
          onChange={(value) => setSnap(Number(value))}
        />
        <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          Zoom
          <input
            type="range"
            min={24}
            max={200}
            value={pixelsPerBeat}
            aria-label="Piano roll zoom"
            onChange={(e) => setPixelsPerBeat(Number(e.target.value))}
            className="w-24 accent-[var(--accent)]"
          />
        </label>
        <Button
          size="sm"
          className="whitespace-nowrap"
          disabled={selectedIds.length === 0}
          onClick={() => {
            for (const id of selectedIds) {
              updateNote(pattern.id, id, (note) => {
                note.startBeat = quantizeBeat(note.startBeat, snap);
              });
            }
          }}
        >
          Quantize
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="whitespace-nowrap"
          disabled={selectedIds.length === 0}
          onClick={() => {
            deleteNotes(pattern.id, selectedIds);
            setSelectedIds([]);
            setSelection(null);
          }}
        >
          {strings.playground.inspector.deleteNote}
        </Button>
        <span className="whitespace-nowrap font-mono text-[10px] text-ink-faint">
          {pattern.notes.length} {strings.playground.pattern.notes}
        </span>
        <span aria-hidden className="h-5 w-px bg-edge" />
        <PatternTargetChip patternId={pattern.id} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Pitch keyboard */}
        <div className="w-14 shrink-0 overflow-hidden border-r border-edge bg-surface">
          <div ref={keysRef} className="will-change-transform">
            {rows.map((pitch) => (
              <button
                key={pitch}
                type="button"
                aria-label={`${strings.playground.inspector.pitch} ${noteToName(pitch)}`}
                onClick={() => preview(pitch)}
                style={{ height: ROW_HEIGHT }}
                className={`flex w-full items-center justify-end border-b border-edge pr-1 font-mono text-[9px] ${
                  BLACK_KEYS.includes(pitch % 12)
                    ? "bg-display text-display-ink"
                    : "bg-surface-raised text-ink-faint"
                }`}
              >
                {pitch % 12 === 0 ? noteToName(pitch) : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Note grid */}
        <div
          ref={gridRef}
          className="relative min-h-0 flex-1 overflow-auto"
          onScroll={(event) => syncKeys(event.currentTarget.scrollTop)}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === "Delete" || event.key === "Backspace") {
              deleteNotes(pattern.id, selectedIds);
              setSelectedIds([]);
            }
            if (event.key === "ArrowRight") nudge(1 / snap, 0);
            if (event.key === "ArrowLeft") nudge(-1 / snap, 0);
            if (event.key === "ArrowUp") nudge(0, 1);
            if (event.key === "ArrowDown") nudge(0, -1);
          }}
          tabIndex={0}
          role="application"
          aria-label="Piano roll"
        >
          <div
            className="relative"
            style={{ width: totalBeats * pixelsPerBeat, height: rows.length * ROW_HEIGHT }}
            onDoubleClick={createNoteAt}
          >
            {/* Row stripes + beat grid */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `repeating-linear-gradient(to bottom, var(--surface-sunken) 0 ${ROW_HEIGHT}px, var(--surface-raised) ${ROW_HEIGHT}px ${
                  ROW_HEIGHT * 2
                }px), repeating-linear-gradient(to right, var(--edge) 0 1px, transparent 1px ${pixelsPerBeat}px)`,
              }}
            />

            {pattern.notes.map((note) => {
              const top = (HIGH_NOTE - note.pitch) * ROW_HEIGHT;
              if (top < 0 || top > rows.length * ROW_HEIGHT) return null;
              const selected = selectedIds.includes(note.id);
              return (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${noteToName(note.pitch)} ${note.startBeat.toFixed(2)} ${note.durationBeats.toFixed(2)}`}
                  aria-pressed={selected}
                  onPointerDown={(event) => beginDrag(event, note, "move")}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    deleteNote(pattern.id, note.id);
                  }}
                  className={`absolute rounded-[var(--radius-clip)] border ${
                    selected ? "border-ink ring-1 ring-ink" : "border-accent-pressed"
                  }`}
                  style={{
                    top: top + 1,
                    height: ROW_HEIGHT - 2,
                    left: note.startBeat * pixelsPerBeat,
                    width: Math.max(4, note.durationBeats * pixelsPerBeat),
                    background: "var(--accent)",
                    opacity: note.muted ? 0.3 : 0.45 + (note.velocity / 127) * 0.55,
                  }}
                >
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(event) => beginDrag(event, note, "resize")}
                    className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
                  />
                </div>
              );
            })}

            {/* Playhead, positioned inside the pattern: the clip's own start
                on the timeline is what decides where in the pattern the
                transport currently is. Hidden when stopped, where beat 0
                would read as "playing the first note". */}
            {transportPlaying && (
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 top-0 w-px bg-accent"
                style={{ left: patternBeat * pixelsPerBeat }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
