"use client";

/**
 * Effect chain editor. Deterministic order (EFFECT_ORDER): distortion,
 * chorus, delay, reverb. Shared by the synth editor and the sample editor.
 */
import { Knob, Toggle } from "@/components/controls";
import { ControlRow } from "./Panel";
import { strings } from "@/i18n";
import type { EffectState } from "@/lib/schema/types";

const FX_LABEL: Record<string, string> = {
  distortion: "Distortion",
  chorus: "Chorus",
  delay: "Delay",
  reverb: "Reverb",
};

export function EffectsSection({
  effects,
  set,
  advanced,
  prefix = "effects",
}: {
  effects: EffectState[];
  set: (path: string, value: number | string | boolean) => void;
  advanced: boolean;
  prefix?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {effects.map((fx, index) => {
        const base = `${prefix}.${index}`;
        return (
          <div key={fx.kind} className="material-sunken rounded-[var(--radius-control)] px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                {index + 1}. {FX_LABEL[fx.kind]}
              </span>
              <Toggle
                checked={!fx.bypass}
                onChange={(on) => set(`${base}.bypass`, !on)}
                label={strings.common.on}
                led={fx.bypass ? "off" : "on"}
              />
            </div>
            <ControlRow>
              {fx.kind === "distortion" && (
                <>
                  <Knob
                    label={strings.synth.drive}
                    value={fx.params.drive}
                    min={0}
                    max={1}
                    defaultValue={0.3}
                    size={40}
                    onChange={(v) => set(`${base}.params.drive`, v)}
                  />
                  <Knob
                    label={strings.synth.tone}
                    value={fx.params.tone}
                    min={0}
                    max={1}
                    defaultValue={0.6}
                    size={40}
                    onChange={(v) => set(`${base}.params.tone`, v)}
                  />
                </>
              )}
              {fx.kind === "chorus" && (
                <>
                  <Knob
                    label={strings.synth.rate}
                    value={fx.params.rate}
                    min={0.01}
                    max={20}
                    defaultValue={1.2}
                    logarithmic
                    unit="Hz"
                    size={40}
                    onChange={(v) => set(`${base}.params.rate`, v)}
                  />
                  <Knob
                    label={strings.synth.depth}
                    value={fx.params.depth}
                    min={0}
                    max={1}
                    defaultValue={0.4}
                    size={40}
                    onChange={(v) => set(`${base}.params.depth`, v)}
                  />
                  <Knob
                    label={strings.synth.mix}
                    value={fx.params.mix}
                    min={0}
                    max={1}
                    defaultValue={0.35}
                    size={40}
                    onChange={(v) => set(`${base}.params.mix`, v)}
                  />
                </>
              )}
              {fx.kind === "delay" && (
                <>
                  {fx.params.sync ? (
                    <Knob
                      label={strings.synth.time}
                      value={fx.params.timeBeats}
                      min={0.0625}
                      max={8}
                      defaultValue={0.75}
                      logarithmic
                      unit="beats"
                      size={40}
                      onChange={(v) => set(`${base}.params.timeBeats`, v)}
                    />
                  ) : (
                    <Knob
                      label={strings.synth.time}
                      value={fx.params.timeSeconds}
                      min={0.01}
                      max={2}
                      defaultValue={0.35}
                      logarithmic
                      unit="s"
                      size={40}
                      onChange={(v) => set(`${base}.params.timeSeconds`, v)}
                    />
                  )}
                  <Knob
                    label={strings.synth.feedback}
                    value={fx.params.feedback}
                    min={0}
                    max={0.95}
                    defaultValue={0.35}
                    size={40}
                    onChange={(v) => set(`${base}.params.feedback`, v)}
                  />
                  <Knob
                    label={strings.synth.mix}
                    value={fx.params.mix}
                    min={0}
                    max={1}
                    defaultValue={0.25}
                    size={40}
                    onChange={(v) => set(`${base}.params.mix`, v)}
                  />
                  {advanced && (
                    <Toggle
                      checked={fx.params.sync}
                      onChange={(on) => set(`${base}.params.sync`, on)}
                      label={strings.synth.sync}
                    />
                  )}
                </>
              )}
              {fx.kind === "reverb" && (
                <>
                  <Knob
                    label={strings.synth.decayTime}
                    value={fx.params.decay}
                    min={0.1}
                    max={20}
                    defaultValue={2.2}
                    logarithmic
                    unit="s"
                    size={40}
                    onChange={(v) => set(`${base}.params.decay`, v)}
                  />
                  <Knob
                    label={strings.synth.mix}
                    value={fx.params.mix}
                    min={0}
                    max={1}
                    defaultValue={0.25}
                    size={40}
                    onChange={(v) => set(`${base}.params.mix`, v)}
                  />
                </>
              )}
            </ControlRow>
          </div>
        );
      })}
    </div>
  );
}
