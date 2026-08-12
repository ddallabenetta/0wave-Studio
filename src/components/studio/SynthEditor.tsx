"use client";

/**
 * Synthesizer editor. Parameters are laid out in signal order:
 * SOURCE, SHAPE, MOTION, SPACE, OUTPUT.
 *
 * Every control writes to the engine (immediate audio) and to the project
 * store (persisted). Basic mode shows the essential set plus four macros that
 * are direct aliases of real parameters, so they stay reproducible and
 * savable. Advanced mode exposes everything.
 */
import { Knob, SegmentedControl, Toggle } from "@/components/controls";
import { Panel, ControlRow } from "./Panel";
import { EffectsSection } from "./EffectsSection";
import { BasicSynthPanel } from "./BasicSynthPanel";
import { WaveformPreview } from "./WaveformPreview";
import { useSynthBinding } from "./useSynthBinding";
import { useUiStore } from "@/lib/state/ui-store";
import { strings } from "@/i18n";
import type { OscillatorState, Waveform } from "@/lib/schema/types";

const WAVEFORMS: { value: Waveform; label: string }[] = [
  { value: "sine", label: "Sin" },
  { value: "triangle", label: "Tri" },
  { value: "sawtooth", label: "Saw" },
  { value: "square", label: "Sqr" },
];

const FILTER_MODES = [
  { value: "lowpass" as const, label: "LP" },
  { value: "highpass" as const, label: "HP" },
  { value: "bandpass" as const, label: "BP" },
];

const LFO_DESTINATIONS = [
  { value: "pitch" as const, label: "Pitch" },
  { value: "filter" as const, label: "Filter" },
  { value: "amplitude" as const, label: "Amp" },
];

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}k` : v.toFixed(0));
const secs = (v: number) => (v >= 1 ? `${v.toFixed(2)}` : `${(v * 1000).toFixed(0)}`);

function OscillatorControls({
  osc,
  prefix,
  set,
  advanced,
}: {
  osc: OscillatorState;
  prefix: "osc1" | "osc2";
  set: (path: string, value: number | string | boolean) => void;
  advanced: boolean;
}) {
  return (
    <div className="material-sunken rounded-[var(--radius-control)] px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
          {prefix === "osc1" ? strings.synth.osc1 : strings.synth.osc2}
        </span>
        <Toggle
          checked={osc.enabled}
          onChange={(on) => set(`${prefix}.enabled`, on)}
          label={strings.common.on}
          led={osc.enabled ? "on" : "off"}
        />
      </div>
      <ControlRow>
        <SegmentedControl
          label={strings.synth.waveform}
          options={WAVEFORMS}
          value={osc.waveform}
          size="sm"
          onChange={(w) => set(`${prefix}.waveform`, w)}
        />
        <Knob
          label={strings.synth.octave}
          value={osc.octave}
          min={-4}
          max={4}
          step={1}
          defaultValue={0}
          size={40}
          onChange={(v) => set(`${prefix}.octave`, Math.round(v))}
        />
        <Knob
          label={strings.synth.semitone}
          value={osc.semitone}
          min={-12}
          max={12}
          step={1}
          defaultValue={0}
          size={40}
          onChange={(v) => set(`${prefix}.semitone`, Math.round(v))}
        />
        <Knob
          label={strings.synth.detune}
          value={osc.detuneCents}
          min={-100}
          max={100}
          defaultValue={0}
          unit="ct"
          size={40}
          onChange={(v) => set(`${prefix}.detuneCents`, v)}
        />
        {advanced && (
          <>
            <Knob
              label={strings.synth.phase}
              value={osc.phase}
              min={0}
              max={1}
              defaultValue={0}
              size={40}
              onChange={(v) => set(`${prefix}.phase`, v)}
            />
            <Knob
              label={strings.synth.unison}
              value={osc.unison}
              min={1}
              max={8}
              step={1}
              defaultValue={1}
              size={40}
              onChange={(v) => set(`${prefix}.unison`, Math.round(v))}
            />
            <Knob
              label={strings.synth.spread}
              value={osc.unisonSpreadCents}
              min={0}
              max={100}
              defaultValue={12}
              unit="ct"
              size={40}
              onChange={(v) => set(`${prefix}.unisonSpreadCents`, v)}
            />
          </>
        )}
      </ControlRow>
    </div>
  );
}

export function SynthEditor({ soundId }: { soundId: string | null }) {
  const complexity = useUiStore((s) => s.complexity);
  const advanced = complexity === "advanced";
  const { state, set } = useSynthBinding(soundId);

  if (!state) {
    return (
      <Panel title={strings.synth.osc1}>
        <p className="p-6 text-sm text-ink-faint">{strings.library.empty}</p>
      </Panel>
    );
  }

  if (!advanced) {
    return (
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <Panel title={strings.studio.sections.preview}>
          <div className="p-3">
            <WaveformPreview state={state} />
          </div>
        </Panel>
        <BasicSynthPanel soundId={soundId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <Panel title={strings.studio.sections.source}>
        <div className="flex flex-col gap-3 p-3">
          <OscillatorControls osc={state.osc1} prefix="osc1" set={set} advanced={advanced} />
          <OscillatorControls osc={state.osc2} prefix="osc2" set={set} advanced={advanced} />
          <div className="material-sunken rounded-[var(--radius-control)] px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                {strings.synth.noise}
              </span>
              <Toggle
                checked={state.noise.enabled}
                onChange={(on) => set("noise.enabled", on)}
                label={strings.common.on}
                led={state.noise.enabled ? "on" : "off"}
              />
            </div>
            <ControlRow>
              <Knob
                label="Color"
                value={state.noise.color}
                min={0}
                max={1}
                defaultValue={0}
                size={40}
                onChange={(v) => set("noise.color", v)}
              />
            </ControlRow>
          </div>
          <div className="material-sunken rounded-[var(--radius-control)] px-3 py-2">
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-ink-soft">
              {strings.synth.mixer}
            </span>
            <ControlRow>
              <Knob
                label={strings.synth.osc1}
                value={state.mixer.osc1}
                min={0}
                max={1}
                defaultValue={0.8}
                size={40}
                onChange={(v) => set("mixer.osc1", v)}
              />
              <Knob
                label={strings.synth.osc2}
                value={state.mixer.osc2}
                min={0}
                max={1}
                defaultValue={0.6}
                size={40}
                onChange={(v) => set("mixer.osc2", v)}
              />
              <Knob
                label={strings.synth.noise}
                value={state.mixer.noise}
                min={0}
                max={1}
                defaultValue={0.5}
                size={40}
                onChange={(v) => set("mixer.noise", v)}
              />
            </ControlRow>
          </div>
        </div>
      </Panel>

      <Panel title={strings.studio.sections.shape}>
        <div className="flex flex-col gap-3 p-3">
          <ControlRow>
            <SegmentedControl
              label={strings.synth.filter}
              options={FILTER_MODES}
              value={state.filter.mode}
              size="sm"
              onChange={(m) => set("filter.mode", m)}
            />
            <Knob
              label={strings.synth.cutoff}
              value={state.filter.cutoff}
              min={20}
              max={20000}
              logarithmic
              defaultValue={8000}
              unit="Hz"
              format={hz}
              onChange={(v) => set("filter.cutoff", v)}
            />
            <Knob
              label={strings.synth.resonance}
              value={state.filter.resonance}
              min={0.1}
              max={24}
              defaultValue={0.8}
              onChange={(v) => set("filter.resonance", v)}
            />
            <Knob
              label={strings.synth.envAmount}
              value={state.filterEnvAmount}
              min={-1}
              max={1}
              defaultValue={0}
              onChange={(v) => set("filterEnvAmount", v)}
            />
          </ControlRow>

          <div className="material-sunken rounded-[var(--radius-control)] px-3 py-2">
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-ink-soft">
              {strings.synth.ampEnv}
            </span>
            <ControlRow>
              <Knob label={strings.synth.attack} value={state.ampEnvelope.attack} min={0.001} max={10} logarithmic defaultValue={0.005} unit="ms" format={secs} size={40} onChange={(v) => set("ampEnvelope.attack", v)} />
              <Knob label={strings.synth.decay} value={state.ampEnvelope.decay} min={0.001} max={10} logarithmic defaultValue={0.15} unit="ms" format={secs} size={40} onChange={(v) => set("ampEnvelope.decay", v)} />
              <Knob label={strings.synth.sustain} value={state.ampEnvelope.sustain} min={0} max={1} defaultValue={0.7} size={40} onChange={(v) => set("ampEnvelope.sustain", v)} />
              <Knob label={strings.synth.release} value={state.ampEnvelope.release} min={0.001} max={30} logarithmic defaultValue={0.2} unit="ms" format={secs} size={40} onChange={(v) => set("ampEnvelope.release", v)} />
            </ControlRow>
          </div>

          <div className="material-sunken rounded-[var(--radius-control)] px-3 py-2">
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-ink-soft">
              {strings.synth.filterEnv}
            </span>
            <ControlRow>
              <Knob label={strings.synth.attack} value={state.filterEnvelope.attack} min={0.001} max={10} logarithmic defaultValue={0.005} unit="ms" format={secs} size={40} onChange={(v) => set("filterEnvelope.attack", v)} />
              <Knob label={strings.synth.decay} value={state.filterEnvelope.decay} min={0.001} max={10} logarithmic defaultValue={0.25} unit="ms" format={secs} size={40} onChange={(v) => set("filterEnvelope.decay", v)} />
              <Knob label={strings.synth.sustain} value={state.filterEnvelope.sustain} min={0} max={1} defaultValue={0.3} size={40} onChange={(v) => set("filterEnvelope.sustain", v)} />
              <Knob label={strings.synth.release} value={state.filterEnvelope.release} min={0.001} max={30} logarithmic defaultValue={0.3} unit="ms" format={secs} size={40} onChange={(v) => set("filterEnvelope.release", v)} />
            </ControlRow>
          </div>
        </div>
      </Panel>

      <Panel title={strings.studio.sections.motion}>
        <ControlRow className="p-3">
          <SegmentedControl
            label={strings.synth.waveform}
            options={WAVEFORMS}
            value={state.lfo.waveform}
            size="sm"
            onChange={(w) => set("lfo.waveform", w)}
          />
          <SegmentedControl
            label={strings.synth.destination}
            options={LFO_DESTINATIONS}
            value={state.lfo.destination}
            size="sm"
            onChange={(d) => set("lfo.destination", d)}
          />
          <Knob
            label={strings.synth.rate}
            value={state.lfo.rate}
            min={0.01}
            max={40}
            logarithmic
            defaultValue={2}
            unit="Hz"
            disabled={state.lfo.sync}
            size={40}
            onChange={(v) => set("lfo.rate", v)}
          />
          <Knob
            label={strings.synth.depth}
            value={state.lfo.depth}
            min={0}
            max={1}
            defaultValue={0}
            size={40}
            onChange={(v) => set("lfo.depth", v)}
          />
          <Toggle checked={state.lfo.sync} onChange={(on) => set("lfo.sync", on)} label={strings.synth.sync} />
          {advanced && (
            <Knob
              label="Beats"
              value={state.lfo.syncBeats}
              min={0.0625}
              max={16}
              logarithmic
              defaultValue={1}
              disabled={!state.lfo.sync}
              size={40}
              onChange={(v) => set("lfo.syncBeats", v)}
            />
          )}
        </ControlRow>
      </Panel>

      <Panel title={strings.studio.sections.space}>
        <div className="p-3">
          <EffectsSection effects={state.effects} set={set} advanced={advanced} />
        </div>
      </Panel>

      <Panel title={strings.studio.sections.output}>
        <ControlRow className="p-3">
          <Knob
            label={strings.synth.gain}
            value={state.output.gain}
            min={0}
            max={1}
            defaultValue={0.8}
            onChange={(v) => set("output.gain", v)}
          />
          <Knob
            label={strings.synth.velocity}
            value={state.output.velocitySensitivity}
            min={0}
            max={1}
            defaultValue={0.6}
            onChange={(v) => set("output.velocitySensitivity", v)}
          />
        </ControlRow>
      </Panel>
    </div>
  );
}
