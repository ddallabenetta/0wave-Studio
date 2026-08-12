"use client";

/**
 * On-screen musical keyboard with computer-keyboard mapping.
 *
 * Notes are sent straight to the engine (noteOn/noteOff); React state only
 * tracks which keys are lit. Z / X shift the octave.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useUiStore } from "@/lib/state/ui-store";
import { noteToName } from "@/lib/music/theory";
import { strings } from "@/i18n";

/** Tracker-style layout: two rows covering two octaves from the base note. */
const KEY_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23,
  i: 24,
};

const SEMITONES_IN_OCTAVE = 12;
const BASE_NOTE = 48; // C3 at octave offset 0
const VISIBLE_OCTAVES = 2;
const BLACK_KEYS = [1, 3, 6, 8, 10];

const WHITE_WIDTH = 34;

export function Keyboard({ velocity = 100 }: { velocity?: number }) {
  const engineRef = useEngineRef();
  const octave = useUiStore((s) => s.keyboardOctave);
  const shiftOctave = useUiStore((s) => s.shiftKeyboardOctave);
  const setActiveNotes = useUiStore((s) => s.setActiveNotes);
  const [held, setHeld] = useState<number[]>([]);
  const heldRef = useRef<Set<number>>(new Set());
  const pointerDown = useRef(false);
  const lastPointerNote = useRef<number | null>(null);

  const base = BASE_NOTE + octave * SEMITONES_IN_OCTAVE;

  const sync = useCallback(() => {
    const notes = [...heldRef.current];
    setHeld(notes);
    setActiveNotes(notes);
  }, [setActiveNotes]);

  const noteOn = useCallback(
    (note: number) => {
      if (heldRef.current.has(note)) return;
      heldRef.current.add(note);
      engineRef.current?.noteOn(note, velocity);
      sync();
    },
    [engineRef, velocity, sync],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (!heldRef.current.has(note)) return;
      heldRef.current.delete(note);
      engineRef.current?.noteOff(note);
      sync();
    },
    [engineRef, sync],
  );

  /* Computer keyboard */
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "arrowleft") return;
      if (key === "-" || key === "[") return;
      if (key in KEY_MAP) {
        event.preventDefault();
        noteOn(base + KEY_MAP[key]);
        return;
      }
      // Octave shift uses keys outside the note map.
      if (key === "k") shiftOctave(-1);
      if (key === "l") shiftOctave(1);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key in KEY_MAP) noteOff(base + KEY_MAP[key]);
    };

    const onBlur = () => {
      for (const note of [...heldRef.current]) noteOff(note);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      onBlur();
    };
  }, [base, noteOn, noteOff, shiftOctave]);

  /* Pointer input */
  useEffect(() => {
    const onUp = () => {
      pointerDown.current = false;
      if (lastPointerNote.current !== null) {
        noteOff(lastPointerNote.current);
        lastPointerNote.current = null;
      }
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [noteOff]);

  const whiteNotes: number[] = [];
  const blackNotes: { note: number; offset: number }[] = [];
  let whiteIndex = 0;
  for (let i = 0; i < VISIBLE_OCTAVES * SEMITONES_IN_OCTAVE + 1; i += 1) {
    const note = base + i;
    if (BLACK_KEYS.includes(i % SEMITONES_IN_OCTAVE)) {
      blackNotes.push({ note, offset: whiteIndex * WHITE_WIDTH - WHITE_WIDTH * 0.3 });
    } else {
      whiteNotes.push(note);
      whiteIndex += 1;
    }
  }

  const press = (note: number) => {
    pointerDown.current = true;
    lastPointerNote.current = note;
    noteOn(note);
  };
  const enter = (note: number) => {
    if (!pointerDown.current) return;
    if (lastPointerNote.current !== null && lastPointerNote.current !== note) {
      noteOff(lastPointerNote.current);
    }
    lastPointerNote.current = note;
    noteOn(note);
  };

  return (
    <div className="flex items-end gap-4 border-t border-edge bg-surface px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {noteToName(base)}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => shiftOctave(-1)}
            className="material-raised motion-ui rounded-[var(--radius-control)] px-2 py-1 font-mono text-[11px] text-ink-soft"
            title={strings.keyboard.octaveDown}
          >
            -
          </button>
          <button
            type="button"
            onClick={() => shiftOctave(1)}
            className="material-raised motion-ui rounded-[var(--radius-control)] px-2 py-1 font-mono text-[11px] text-ink-soft"
            title={strings.keyboard.octaveUp}
          >
            +
          </button>
        </div>
      </div>

      <div
        className="relative h-24 select-none overflow-x-auto"
        style={{ width: whiteNotes.length * WHITE_WIDTH }}
        role="group"
        aria-label="Musical keyboard"
      >
        {whiteNotes.map((note, index) => {
          const active = held.includes(note);
          return (
            <button
              key={note}
              type="button"
              aria-label={noteToName(note)}
              aria-pressed={active}
              onPointerDown={() => press(note)}
              onPointerEnter={() => enter(note)}
              className={`absolute bottom-0 top-0 rounded-b-[var(--radius-control)] border border-edge ${
                active ? "bg-accent-wash" : "bg-surface-raised"
              }`}
              style={{
                left: index * WHITE_WIDTH,
                width: WHITE_WIDTH - 2,
                boxShadow: active ? "inset 0 2px 4px var(--bevel-dark)" : "var(--shadow-ambient)",
              }}
            >
              <span className="absolute bottom-1 left-0 right-0 text-center font-mono text-[9px] text-ink-faint">
                {note % 12 === 0 ? noteToName(note) : ""}
              </span>
            </button>
          );
        })}
        {blackNotes.map(({ note, offset }) => {
          const active = held.includes(note);
          return (
            <button
              key={note}
              type="button"
              aria-label={noteToName(note)}
              aria-pressed={active}
              onPointerDown={() => press(note)}
              onPointerEnter={() => enter(note)}
              className="absolute top-0 z-10 rounded-b-[var(--radius-clip)] border border-edge-strong"
              style={{
                left: offset,
                width: WHITE_WIDTH * 0.62,
                height: "62%",
                background: active ? "var(--accent-pressed)" : "var(--display)",
              }}
            />
          );
        })}
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
        Z S X D C V ... Q 2 W 3 E
        <br />
        K / L: octave
      </p>
    </div>
  );
}
