"use client";

/**
 * On-screen musical keyboard with computer-keyboard mapping.
 *
 * Notes are sent straight to the engine (noteOn/noteOff); React state only
 * tracks which keys are lit. K / L shift the octave. The keybed fills every
 * pixel of the width available to it; the only other chrome is the octave
 * readout and a small "?" button that reveals the QWERTY keymap.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
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

/** Display order for the keymap dialog; offsets match KEY_MAP. */
const KEYMAP_ROWS: { key: string; offset: number }[][] = [
  [
    { key: "q", offset: 12 }, { key: "2", offset: 13 }, { key: "w", offset: 14 },
    { key: "3", offset: 15 }, { key: "e", offset: 16 }, { key: "r", offset: 17 },
    { key: "5", offset: 18 }, { key: "t", offset: 19 }, { key: "6", offset: 20 },
    { key: "y", offset: 21 }, { key: "7", offset: 22 }, { key: "u", offset: 23 },
    { key: "i", offset: 24 },
  ],
  [
    { key: "z", offset: 0 }, { key: "s", offset: 1 }, { key: "x", offset: 2 },
    { key: "d", offset: 3 }, { key: "c", offset: 4 }, { key: "v", offset: 5 },
    { key: "g", offset: 6 }, { key: "b", offset: 7 }, { key: "h", offset: 8 },
    { key: "n", offset: 9 }, { key: "j", offset: 10 }, { key: "m", offset: 11 },
  ],
];

const SEMITONES_IN_OCTAVE = 12;
const BASE_NOTE = 48; // C3 at octave offset 0
const VISIBLE_OCTAVES = 2;
const BLACK_KEYS = [1, 3, 6, 8, 10];
const MIN_KEY_WIDTH = 18;
const INITIAL_KEY_WIDTH = 34;

/** Overlay showing which computer keys map to which notes at the current octave. */
function KeymapDialog({ base, onClose }: { base: number; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="keymap-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/85 p-4 backdrop-blur-[2px]"
    >
      <div
        className="material-raised w-full max-w-md rounded-[var(--radius-panel)] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="keymap-title" className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
            {strings.keyboard.keymap}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.common.close}
            className="text-ink-soft hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {KEYMAP_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="mb-2 flex flex-wrap gap-1">
            {row.map(({ key, offset }) => (
              <span
                key={key}
                className="material-sunken flex w-9 flex-col items-center rounded-[var(--radius-control)] py-1 font-mono"
              >
                <span className="text-[11px] font-medium text-ink">{key}</span>
                <span className="text-[10px] text-ink-faint">{noteToName(base + offset)}</span>
              </span>
            ))}
          </div>
        ))}

        <p className="mt-3 border-t border-edge pt-3 font-mono text-[10px] leading-relaxed text-ink-faint">
          {strings.keyboard.octaveDown} · {strings.keyboard.octaveUp}
        </p>
      </div>
    </div>
  );
}

export function Keyboard({ velocity = 100 }: { velocity?: number }) {
  const engineRef = useEngineRef();
  const octave = useUiStore((s) => s.keyboardOctave);
  const shiftOctave = useUiStore((s) => s.shiftKeyboardOctave);
  const setActiveNotes = useUiStore((s) => s.setActiveNotes);
  const [held, setHeld] = useState<number[]>([]);
  const [keymapOpen, setKeymapOpen] = useState(false);
  const [keyWidth, setKeyWidth] = useState(INITIAL_KEY_WIDTH);
  const heldRef = useRef<Set<number>>(new Set());
  const pointerDown = useRef(false);
  const lastPointerNote = useRef<number | null>(null);
  const bedRef = useRef<HTMLDivElement | null>(null);

  const base = BASE_NOTE + octave * SEMITONES_IN_OCTAVE;

  const whiteCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < VISIBLE_OCTAVES * SEMITONES_IN_OCTAVE + 1; i += 1) {
      if (!BLACK_KEYS.includes(i % SEMITONES_IN_OCTAVE)) count += 1;
    }
    return count;
  }, []);

  /** The keybed stretches to the width it has; the 2px gap stays constant. */
  useEffect(() => {
    const bed = bedRef.current;
    if (!bed) return;
    const update = () => {
      setKeyWidth(Math.max(MIN_KEY_WIDTH, bed.clientWidth / whiteCount));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bed);
    return () => observer.disconnect();
  }, [whiteCount]);

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
  const blackNotes: { note: number; whiteIndex: number }[] = [];
  let whiteIndex = 0;
  for (let i = 0; i < VISIBLE_OCTAVES * SEMITONES_IN_OCTAVE + 1; i += 1) {
    const note = base + i;
    if (BLACK_KEYS.includes(i % SEMITONES_IN_OCTAVE)) {
      blackNotes.push({ note, whiteIndex });
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
    <>
      <div className="flex items-end gap-3 border-t border-edge bg-surface px-4 py-3">
        <div className="flex shrink-0 flex-col gap-1">
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
          ref={bedRef}
          className="relative h-24 min-w-0 flex-1 select-none overflow-x-auto"
          role="group"
          aria-label="Musical keyboard"
        >
          <div className="relative h-full" style={{ width: keyWidth * whiteCount }}>
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
                    left: index * keyWidth,
                    width: keyWidth - 2,
                    boxShadow: active ? "inset 0 2px 4px var(--bevel-dark)" : "var(--shadow-ambient)",
                  }}
                >
                  <span className="absolute bottom-1 left-0 right-0 text-center font-mono text-[9px] text-ink-faint">
                    {note % 12 === 0 ? noteToName(note) : ""}
                  </span>
                </button>
              );
            })}
            {blackNotes.map(({ note, whiteIndex: wi }) => {
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
                    left: wi * keyWidth - keyWidth * 0.3,
                    width: keyWidth * 0.62,
                    height: "62%",
                    background: active ? "var(--accent-pressed)" : "var(--display)",
                  }}
                />
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setKeymapOpen(true)}
          aria-label={strings.keyboard.keymap}
          className="material-raised motion-ui flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] font-mono text-xs font-medium text-ink-soft"
        >
          ?
        </button>
      </div>

      {keymapOpen && <KeymapDialog base={base} onClose={() => setKeymapOpen(false)} />}
    </>
  );
}
