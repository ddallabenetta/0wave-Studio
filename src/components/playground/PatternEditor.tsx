"use client";

/**
 * Pattern Editor: a step-grid projection of the pattern's NoteEvent list.
 *
 * The grid is a view, not a second data model. Toggling a step creates or
 * removes a real NoteEvent; notes that sit off the grid (typically drawn in
 * the Piano Roll) keep their exact timing and are shown on their nearest
 * step with an off-grid marker instead of being rewritten.
 */
import { useMemo } from "react";
import { Button, Knob, SegmentedControl } from "@/components/controls";
import { ExplainNote, HelpTip } from "@/components/guide/HelpTip";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { useEngineRef } from "@/components/hooks/useEngine";
import { noteToName } from "@/lib/music/theory";
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

/** Pitch rows shown in the step grid, high to low. */
const ROW_COUNT = 12;

export function PatternEditor({ patternId }: { patternId: string | null }) {
  const pattern = useProjectStore((s) => s.project.patterns.find((p) => p.id === patternId));
  const updatePattern = useProjectStore((s) => s.updatePattern);
  const addNote = useProjectStore((s) => s.addNote);
  const updateNote = useProjectStore((s) => s.updateNote);
  const deleteNote = useProjectStore((s) => s.deleteNote);
  const clearPatternNotes = useProjectStore((s) => s.clearPatternNotes);
  const duplicatePattern = useProjectStore((s) => s.duplicatePattern);
  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const positionBeats = useUiStore((s) => s.positionBeats);
  const transportPlaying = useUiStore((s) => s.transportPlaying);
  const engineRef = useEngineRef();

  const baseNote = 60;

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
    return <p className="p-4 text-xs text-ink-faint">{strings.playground.pattern.newPattern}</p>;
  }

  const { steps, stepBeats, byStep } = grid;
  const rows = Array.from({ length: ROW_COUNT }, (_, i) => baseNote + ROW_COUNT - 1 - i);
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
    engineRef.current?.noteOn(pitch, 100);
    window.setTimeout(() => engineRef.current?.noteOff(pitch), 180);
  };

  const selectedNote =
    selection?.kind === "note" ? pattern.notes.find((n) => n.id === selection.noteId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-3 py-2">
        <input
          value={pattern.name}
          aria-label={strings.common.name}
          onChange={(e) => updatePattern(pattern.id, (p) => void (p.name = e.target.value || p.name))}
          className="material-sunken w-40 rounded-[var(--radius-control)] px-2 py-1 text-xs text-ink outline-none"
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
        <Button size="sm" onClick={() => duplicatePattern(pattern.id)}>
          {strings.playground.pattern.duplicatePattern}
        </Button>
        <Button size="sm" onClick={() => clearPatternNotes(pattern.id)}>
          {strings.playground.pattern.clear}
        </Button>

        {selectedNote && (
          <div className="ml-auto flex items-center gap-3">
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
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <ExplainNote className="mb-2 max-w-lg">
          {strings.playground.pattern.gridHint}
        </ExplainNote>
        <table className="border-separate border-spacing-[2px]">
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
        <p className="mt-2 font-mono text-[10px] text-ink-faint">
          {strings.playground.pattern.offGridHint}
        </p>
      </div>
    </div>
  );
}
