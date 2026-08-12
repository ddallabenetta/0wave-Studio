"use client";

/**
 * Basic view of the synth editor: a handful of mouse-driven controls.
 *
 * - A waveform selector (main oscillator shape).
 * - A two-axis pad: brightness (X, log filter cutoff) × movement (Y, LFO
 *   depth), inside the Character card.
 * - Four full-width character sliders (Punch, Vivace, Body, Space) rendered
 *   as standalone rows below the card.
 *
 * Every change is heard immediately:
 * - sustained sounds (pads) keep a held preview note and morph through the
 *   engine's live parameter path (smooth, linear-feeling transitions);
 * - percussive sounds retrigger a short preview, throttled while dragging.
 */
import { useCallback, useEffect, useRef } from "react";
import { Pad2D, SegmentedControl, Slider } from "@/components/controls";
import { Panel } from "./Panel";
import { useSynthBinding } from "./useSynthBinding";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useUiStore } from "@/lib/state/ui-store";
import {
  applyMacro,
  applyPadX,
  applyPadY,
  isSustainedSound,
  readMacro,
  readPadX,
  readPadY,
} from "@/lib/audio/macros";
import type { MacroId } from "@/lib/audio/macros";
import { strings } from "@/i18n";
import type { Waveform } from "@/lib/schema/types";

const WAVEFORMS: { value: Waveform; label: string }[] = [
  { value: "sine", label: "Sin" },
  { value: "triangle", label: "Tri" },
  { value: "sawtooth", label: "Saw" },
  { value: "square", label: "Sqr" },
];

const PREVIEW_NOTE = 60;
const PERCUSSIVE_TAIL_MS = 170;
const SUSTAINED_TAIL_MS = 900;
const PERCUSSIVE_THROTTLE_MS = 100;

/** Sorted display order of the character sliders. */
const SLIDER_ORDER: MacroId[] = ["punch", "vivace", "body", "space"];

const MACRO_LABELS: Record<MacroId, string> = {
  punch: strings.studio.macros.punch,
  vivace: strings.studio.macros.vivace,
  body: strings.studio.macros.body,
  space: strings.studio.macros.space,
};

/** Alt+click / double-click reset positions, matching the Init Patch values. */
const MACRO_DEFAULTS: Record<MacroId, number> = {
  punch: 0.75,
  vivace: 0.5,
  body: 0.62,
  space: 0.42,
};

/** Named ends of each slider range, shown under the track. */
const MACRO_ENDS: Record<MacroId, { min: string; max: string }> = {
  punch: { min: strings.studio.macroEnds.punch.min, max: strings.studio.macroEnds.punch.max },
  vivace: { min: strings.studio.macroEnds.vivace.min, max: strings.studio.macroEnds.vivace.max },
  body: { min: strings.studio.macroEnds.body.min, max: strings.studio.macroEnds.body.max },
  space: { min: strings.studio.macroEnds.space.min, max: strings.studio.macroEnds.space.max },
};

/**
 * Hear every edit: hold the note for sustained sounds, retrigger for
 * percussive ones. A single shared tail timer stops the note shortly after
 * the last change so long releases can fade naturally.
 */
function useAutoPreview(active: boolean, sustained: () => boolean) {
  const engineRef = useEngineRef();
  const audioStatus = useUiStore((s) => s.audioStatus);
  const held = useRef(false);
  const tailTimer = useRef<number | null>(null);
  const lastTrigger = useRef(0);
  const sustainedRef = useRef(sustained);
  useEffect(() => {
    sustainedRef.current = sustained;
  }, [sustained]);

  const clearTail = useCallback(() => {
    if (tailTimer.current !== null) {
      window.clearTimeout(tailTimer.current);
      tailTimer.current = null;
    }
  }, []);

  const stopPreview = useCallback(() => {
    clearTail();
    if (held.current) {
      engineRef.current?.noteOff(PREVIEW_NOTE);
      held.current = false;
    }
  }, [clearTail, engineRef]);

  const bump = useCallback(() => {
    if (!active || audioStatus !== "running") return;
    const engine = engineRef.current;
    if (!engine) return;
    const sustainedSound = sustainedRef.current();

    if (sustainedSound) {
      // Hold one note; subsequent edits morph it live via setParameter.
      if (!held.current) {
        engine.noteOn(PREVIEW_NOTE, 90);
        held.current = true;
      }
      clearTail();
      tailTimer.current = window.setTimeout(() => {
        engine.noteOff(PREVIEW_NOTE);
        held.current = false;
      }, SUSTAINED_TAIL_MS);
      return;
    }

    // Percussive: scrub-style retrigger, throttled while dragging.
    const now = performance.now();
    if (now - lastTrigger.current >= PERCUSSIVE_THROTTLE_MS) {
      lastTrigger.current = now;
      engine.noteOn(PREVIEW_NOTE, 100);
    }
    clearTail();
    tailTimer.current = window.setTimeout(() => engine.noteOff(PREVIEW_NOTE), PERCUSSIVE_TAIL_MS);
  }, [active, audioStatus, clearTail, engineRef]);

  useEffect(() => stopPreview, [stopPreview]);

  return bump;
}

export function BasicSynthPanel({ soundId }: { soundId: string | null }) {
  const { state, set } = useSynthBinding(soundId);
  const bump = useAutoPreview(Boolean(state), () => (state ? isSustainedSound(state) : false));

  if (!state) return null;

  const write = (path: string, value: number | string | boolean) => set(path, value);

  const apply = (writes: { path: string; value: number | string | boolean }[]) => {
    for (const w of writes) write(w.path, w.value);
    bump();
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel title={strings.studio.sections.character}>
        <div className="flex flex-col gap-3 p-3">
          <SegmentedControl
            label={strings.synth.waveform}
            options={WAVEFORMS}
            value={state.osc1.waveform}
            size="sm"
            onChange={(w) => apply([{ path: "osc1.waveform", value: w }])}
          />
          <Pad2D
            label={strings.studio.pad.title}
            xLabel={strings.studio.pad.xLabel}
            yLabel={strings.studio.pad.yLabel}
            x={readPadX(state)}
            y={readPadY(state)}
            defaultValue={{ x: 0.5, y: 0 }}
            onChange={(x, y) => apply([...applyPadX(x), ...applyPadY(y)])}
          />
        </div>
      </Panel>

      {/* Character sliders: standalone rows outside the card. */}
      <div className="flex flex-col">
        {SLIDER_ORDER.map((id) => {
          const ends = MACRO_ENDS[id];
          return (
            <div
              key={id}
              className="border-b border-edge py-2 last:border-b-0 first:pt-0"
            >
              <Slider
                label={MACRO_LABELS[id]}
                value={readMacro(state, id)}
                defaultValue={MACRO_DEFAULTS[id]}
                minLabel={ends.min}
                maxLabel={ends.max}
                onChange={(v) => apply(applyMacro(id, v))}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
