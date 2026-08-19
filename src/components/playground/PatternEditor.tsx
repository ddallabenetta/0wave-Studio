"use client";

/**
 * Pattern Editor: a step-grid projection of the pattern's NoteEvent list.
 *
 * The grid is a view, not a second data model. Toggling a step creates or
 * removes a real NoteEvent; notes that sit off the grid (typically drawn in
 * the Piano Roll) keep their exact timing and are shown on their nearest
 * step with an off-grid marker instead of being rewritten.
 *
 * Two things follow the pattern instead of being configured:
 *
 * - the instrument. A step is auditioned through the track the pattern is
 *   placed on (see PatternTargetChip), never through the Studio's preview
 *   engine, so what you hear while writing is what the arrangement plays.
 * - the pitch window. Twelve fixed rows from middle C hid every bass line in
 *   the project; the window now opens on the notes that are actually there,
 *   and can be moved an octave at a time.
 */
import { useMemo, useState } from "react";
import { CaretDown, CaretUp, DotsThree } from "@phosphor-icons/react";
import { IconButton, Knob, MenuButton, SegmentedControl } from "@/components/controls";
import { ExplainNote, HelpTip } from "@/components/guide/HelpTip";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { noteToName } from "@/lib/music/theory";
import { PatternTargetChip } from "./PatternTargetChip";
import { usePatternTarget } from "./patternTarget";
import { useTrackPreview } from "./useTrackPreview";
import { strings } from "@/i18n";
import type { NoteEvent } from "@/lib/schema/types";

/** Grid fineness, described by how many squares a beat is cut into. */
const RESOLUTIONS = [
  { value: "2", label: "1/8", hint: strings.playground.pattern.resolutionHints.eighth },
  { value: "4", label: "1/16", hint: strings.playground.pattern.resolutionHints.sixteenth },
  { value: "8", label: "1/32", hint: strings.playground.pattern.resolutionHints.thirtysecond },
];

/** Pattern length in bars. The values are beats; the labels are bars. */
const LENGTHS = [
  { value: "4", label: "1", hint: strings.playground.pattern.lengthHints.one },
  { value: "8", label: "2", hint: strings.playground.pattern.lengthHints.two },
  { value: "16", label: "4", hint: strings.playground.pattern.lengthHints.four },
];

/**
 * Pitch rows shown in the step grid, high to low.
 *
 * The window is as tall as the pattern needs and no taller: a one-pitch drum
 * part gets a handful of rows and stays entirely on screen, while a melody
 * gets up to an octave. A fixed twelve rows pushed the notes of a percussion
 * pattern below the fold of a 300 px panel, which is the same as not showing
 * them at all.
 */
const MIN_ROWS = 5;
const MAX_ROWS = 12;

interface PitchWindow {
  /** Pattern the window was fitted for. */
  patternId: string | null;
  /** Number of rows shown. */
  rows: number;
  /** Lowest pitch shown. */
  base: number;
}

/** The pitch window a pattern opens on: how many rows, and the lowest one. */
function fitWindow(patternId: string | null, notes: readonly NoteEvent[]): PitchWindow {
  if (notes.length === 0) return { patternId, rows: MAX_ROWS, base: 60 };
  let low = Infinity;
  let high = -Infinity;
  for (const note of notes) {
    if (note.pitch < low) low = note.pitch;
    if (note.pitch > high) high = note.pitch;
  }
  const span = high - low + 1;
  // Two rows of headroom, so there is somewhere to put the next note.
  const rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, span + 2));
  const base = span <= rows ? low - Math.floor((rows - span) / 2) : Math.floor(low / 12) * 12;
  return { patternId, rows, base: Math.max(0, Math.min(127 - rows, base)) };
}

export function PatternEditor({ patternId }: { patternId: string | null }) {
  const pattern = useProjectStore((s) => s.project.patterns.find((p) => p.id === patternId));
  const updatePattern = useProjectStore((s) => s.updatePattern);
  const addNote = useProjectStore((s) => s.addNote);
  const updateNote = useProjectStore((s) => s.updateNote);
  const deleteNote = useProjectStore((s) => s.deleteNote);
  const clearPatternNotes = useProjectStore((s) => s.clearPatternNotes);
  const duplicatePattern = useProjectStore((s) => s.duplicatePattern);
  const deletePattern = useProjectStore((s) => s.deletePattern);
  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const setActivePatternId = useUiStore((s) => s.setActivePatternId);
  const positionBeats = useUiStore((s) => s.positionBeats);
  const transportPlaying = useUiStore((s) => s.transportPlaying);
  const target = usePatternTarget(patternId ?? null);
  const preview = useTrackPreview();

  /**
   * The pitch window, fitted when a pattern is opened and then held still.
   *
   * Refitting on every edit would move the rows under the cursor the moment a
   * note lands outside the current range — the grid must not walk away while
   * it is being used. It is re-fitted when another pattern is opened (adjusted
   * during render, which is what React prescribes for state that follows a
   * prop) and moved by the octave arrows, which report what is out of view.
   */
  const [view, setView] = useState<PitchWindow>(() => fitWindow(patternId, pattern?.notes ?? []));
  if (view.patternId !== patternId) setView(fitWindow(patternId, pattern?.notes ?? []));
  const window_ =
    view.patternId === patternId ? view : fitWindow(patternId, pattern?.notes ?? []);
  const shiftOctave = (delta: number) =>
    setView({ ...window_, base: Math.max(0, Math.min(127 - window_.rows, window_.base + delta * 12)) });

  const grid = useMemo(() => {
    if (!pattern) return null;
    const steps = Math.round(pattern.lengthBeats * pattern.resolution);
    const stepBeats = 1 / pattern.resolution;
    /** step index -> notes whose start rounds to that step */
    const byStep = new Map<number, NoteEvent[]>();
    for (const note of pattern.notes) {
      const index = Math.round(note.startBeat / stepBeats);
      const list = byStep.get(index);
      if (list) list.push(note);
      else byStep.set(index, [note]);
    }
    return { steps, stepBeats, byStep };
  }, [pattern]);

  if (!pattern || !grid) {
    return (
      <p className="p-4 text-xs leading-relaxed text-ink-faint">
        {strings.playground.pattern.choosePattern}
      </p>
    );
  }

  const { steps, stepBeats, byStep } = grid;
  const rowCount = window_.rows;
  const baseNote = window_.base;
  const rows = Array.from({ length: rowCount }, (_, i) => baseNote + rowCount - 1 - i);
  const notesAbove = pattern.notes.filter((n) => n.pitch > baseNote + rowCount - 1).length;
  const notesBelow = pattern.notes.filter((n) => n.pitch < baseNote).length;

  // Only a running transport has a "current" step. When stopped, position
  // is 0 and highlighting step 0 would read as a note that is not there.
  const playingStep = transportPlaying
    ? Math.floor((positionBeats % pattern.lengthBeats) / stepBeats)
    : -1;

  const noteAt = (pitch: number, step: number): NoteEvent | undefined =>
    byStep.get(step)?.find((n) => n.pitch === pitch);

  const toggle = (pitch: number, step: number) => {
    const existing = noteAt(pitch, step);
    if (existing) {
      deleteNote(pattern.id, existing.id);
      return;
    }
    const id = addNote(pattern.id, {
      pitch,
      startBeat: step * stepBeats,
      durationBeats: stepBeats,
      velocity: 100,
      muted: false,
    });
    setSelection({ kind: "note", patternId: pattern.id, noteId: id });
    // Heard through the track this pattern is placed on, layered over
    // whatever the transport is already playing.
    preview.note(target.active?.trackId, pitch, 100);
  };

  const selectedNote =
    selection?.kind === "note" ? pattern.notes.find((n) => n.id === selection.noteId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge px-3 py-2">
        <input
          value={pattern.name}
          aria-label={strings.common.name}
          onChange={(e) => updatePattern(pattern.id, (p) => void (p.name = e.target.value || p.name))}
          className="material-sunken w-36 rounded-[var(--radius-control)] px-2 py-1 text-xs text-ink outline-none focus:shadow-[var(--halo)]"
        />

        <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.pattern.length}
          <HelpTip term="pattern" placement="bottom" />
        </label>
        <SegmentedControl
          label={strings.playground.pattern.length}
          options={LENGTHS}
          value={String(Math.round(pattern.lengthBeats))}
          size="sm"
          onChange={(value) => updatePattern(pattern.id, (p) => void (p.lengthBeats = Number(value)))}
        />

        <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.pattern.resolution}
          <HelpTip term="step" placement="bottom" />
        </label>
        <SegmentedControl
          label={strings.playground.pattern.resolution}
          options={RESOLUTIONS}
          value={String(pattern.resolution)}
          size="sm"
          onChange={(value) => updatePattern(pattern.id, (p) => void (p.resolution = Number(value)))}
        />

        <span aria-hidden className="h-5 w-px bg-edge" />

        {/* Where it plays, and what it plays through. */}
        <PatternTargetChip patternId={pattern.id} />

        <div className="ml-auto flex items-center gap-3">
          {selectedNote && (
            <>
              <Knob
                label={strings.playground.pattern.velocity}
                value={selectedNote.velocity}
                min={1}
                max={127}
                step={1}
                defaultValue={100}
                size={36}
                onChange={(v) =>
                  updateNote(pattern.id, selectedNote.id, (n) => void (n.velocity = Math.round(v)), {
                    undoable: false,
                  })
                }
              />
              <Knob
                label={strings.playground.pattern.gate}
                value={selectedNote.durationBeats}
                min={0.0625}
                max={4}
                defaultValue={stepBeats}
                size={36}
                onChange={(v) =>
                  updateNote(pattern.id, selectedNote.id, (n) => void (n.durationBeats = v), {
                    undoable: false,
                  })
                }
              />
            </>
          )}
          <MenuButton
            label={strings.common.more}
            icon={<DotsThree size={16} weight="bold" />}
            actions={[
              {
                id: "duplicate",
                label: strings.playground.pattern.duplicatePattern,
                onSelect: () => {
                  const id = duplicatePattern(pattern.id);
                  if (id) setActivePatternId(id);
                },
              },
              {
                id: "clear",
                label: strings.playground.pattern.clear,
                disabled: pattern.notes.length === 0,
                onSelect: () => clearPatternNotes(pattern.id),
              },
              {
                id: "delete",
                label: strings.playground.pattern.deletePattern,
                danger: true,
                onSelect: () => {
                  deletePattern(pattern.id);
                  setActivePatternId(null);
                  setSelection(null);
                },
              },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <ExplainNote className="mb-2 max-w-lg">
          {strings.playground.pattern.gridHint}
        </ExplainNote>

        <div className="flex items-start gap-2">
          {/* Octave window: the arrows say how much material is out of view,
              which is also why they exist. */}
          <div className="sticky left-0 flex flex-col items-center gap-1 pt-4">
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={strings.playground.pattern.octaveUp}
              title={
                notesAbove > 0
                  ? `${notesAbove} ${strings.playground.pattern.notesAbove}`
                  : strings.playground.pattern.octaveUp
              }
              icon={<CaretUp size={12} weight="bold" />}
              disabled={baseNote >= 127 - rowCount}
              onClick={() => shiftOctave(1)}
              className={notesAbove > 0 ? "text-accent-ink" : undefined}
            />
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={strings.playground.pattern.octaveDown}
              title={
                notesBelow > 0
                  ? `${notesBelow} ${strings.playground.pattern.notesBelow}`
                  : strings.playground.pattern.octaveDown
              }
              icon={<CaretDown size={12} weight="bold" />}
              disabled={baseNote <= 0}
              onClick={() => shiftOctave(-1)}
              className={notesBelow > 0 ? "text-accent-ink" : undefined}
            />
          </div>

          <table className="border-separate border-spacing-[2px]">
            <thead>
              <tr>
                <th scope="col" className="w-12" />
                {Array.from({ length: steps }, (_, step) => {
                  const beat = step / pattern.resolution;
                  const onBeat = step % pattern.resolution === 0;
                  return (
                    <th
                      key={step}
                      scope="col"
                      className={`w-5 pb-0.5 text-center font-mono text-[9px] font-normal ${
                        step === playingStep ? "text-accent-ink" : "text-ink-faint"
                      }`}
                    >
                      {onBeat ? beat + 1 : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((pitch) => (
                <tr key={pitch}>
                  <th
                    scope="row"
                    className="w-12 pr-1 text-right font-mono text-[10px] font-normal text-ink-faint"
                  >
                    {noteToName(pitch)}
                  </th>
                  {Array.from({ length: steps }, (_, step) => {
                    const note = noteAt(pitch, step);
                    const offGrid = note ? Math.abs(note.startBeat - step * stepBeats) > 1e-6 : false;
                    const isBeat = step % pattern.resolution === 0;
                    const isPlaying = step === playingStep;
                    return (
                      <td
                        key={step}
                        className="motion-ui"
                        // The playing column is tinted across every row, so the
                        // position in the bar is legible without hunting for a
                        // one-pixel outline.
                        style={
                          isPlaying
                            ? { background: "color-mix(in srgb, var(--accent) 22%, transparent)" }
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          aria-label={`${noteToName(pitch)} step ${step + 1}`}
                          aria-pressed={Boolean(note)}
                          onClick={() => toggle(pitch, step)}
                          className={`h-5 w-5 rounded-[var(--radius-clip)] border motion-ui ${
                            note
                              ? "border-accent-pressed bg-accent"
                              : isBeat
                                ? "border-edge-strong bg-surface-sunken"
                                : "border-edge bg-surface-raised"
                          } ${isPlaying ? "outline outline-1 outline-ink" : ""}`}
                          style={{
                            // Velocity is drawn as opacity: a soft note is a
                            // faint square, which matches how it sounds.
                            ...(note ? { opacity: 0.35 + (note.velocity / 127) * 0.65 } : {}),
                            ...(note && isPlaying
                              ? { boxShadow: "var(--halo-strong)", transform: "scale(1.08)" }
                              : {}),
                          }}
                        >
                          {offGrid && (
                            <span aria-hidden className="block text-[8px] leading-none text-accent-on">
                              *
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 font-mono text-[10px] text-ink-faint">
          {strings.playground.pattern.offGridHint}
        </p>
      </div>
    </div>
  );
}
