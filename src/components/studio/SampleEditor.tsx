"use client";

/**
 * Sample editor: real waveform, non-destructive edits.
 *
 * The waveform is computed from the decoded AudioBuffer (min/max peaks per
 * pixel column) for the visible window. Every edit writes parameters on the
 * SampleState; the original asset blob is never modified.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, MagnifyingGlassPlus, MagnifyingGlassMinus } from "@phosphor-icons/react";
import { Button, IconButton, Knob, SegmentedControl, Toggle } from "@/components/controls";
import { useEngine, useEngineRef } from "@/components/hooks/useEngine";
import { useProjectStore } from "@/lib/state/project-store";
import { Panel, ControlRow } from "./Panel";
import { EffectsSection } from "./EffectsSection";
import { useSampleBinding } from "./useSynthBinding";
import { loadSampleBuffer, getCachedBuffer } from "./sampleBuffers";
import { noteToName } from "@/lib/music/theory";
import { strings } from "@/i18n";
import type { SamplePlaybackMode } from "@/lib/schema/types";

const MODES: { value: SamplePlaybackMode; label: string }[] = [
  { value: "one-shot", label: strings.sampleEditor.oneShot },
  { value: "loop", label: strings.sampleEditor.loopMode },
  { value: "instrument", label: strings.sampleEditor.instrument },
];

type MarkerKind = "trimStart" | "trimEnd" | "loopStart" | "loopEnd";

const MARKER_COLOR: Record<MarkerKind, string> = {
  trimStart: "var(--accent)",
  trimEnd: "var(--accent)",
  loopStart: "var(--success)",
  loopEnd: "var(--success)",
};

export function SampleEditor({ soundId }: { soundId: string | null }) {
  const engine = useEngine();
  const engineRef = useEngineRef();
  const { sound, state, set } = useSampleBinding(soundId);
  const assets = useProjectStore((s) => s.project.assets);
  const undo = useProjectStore((s) => s.undo);
  const asset = assets.find((a) => a.id === state?.assetId);

  const [buffer, setBuffer] = useState<AudioBuffer | null>(
    state?.assetId ? getCachedBuffer(state.assetId) ?? null : null,
  );
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<MarkerKind | null>(null);

  useEffect(() => {
    let alive = true;
    if (!engine || !asset) return;
    void loadSampleBuffer(engine, asset).then((decoded) => {
      if (alive) setBuffer(decoded);
    });
    return () => {
      alive = false;
    };
  }, [engine, asset]);

  const duration = buffer?.duration ?? asset?.duration ?? 0;
  const windowSeconds = duration / zoom;
  const windowStart = Math.min(offset, Math.max(0, duration - windowSeconds));

  const peaks = useMemo(() => {
    if (!buffer) return null;
    const columns = 1200;
    const data = buffer.getChannelData(0);
    const startSample = Math.floor((windowStart / buffer.duration) * data.length);
    const endSample = Math.floor(((windowStart + windowSeconds) / buffer.duration) * data.length);
    const span = Math.max(1, endSample - startSample);
    const perColumn = Math.max(1, Math.floor(span / columns));
    const result = new Float32Array(columns * 2);
    for (let i = 0; i < columns; i += 1) {
      let min = 1;
      let max = -1;
      const from = startSample + i * perColumn;
      for (let j = 0; j < perColumn; j += 1) {
        const value = data[from + j] ?? 0;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      result[i * 2] = min;
      result[i * 2 + 1] = max;
    }
    return result;
  }, [buffer, windowStart, windowSeconds]);

  /* Draw the waveform whenever peaks or size change. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#3a3a3e";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    if (!peaks) return;
    const columns = peaks.length / 2;
    ctx.fillStyle = "#ff6a2b";
    for (let i = 0; i < columns; i += 1) {
      const x = (i / columns) * width;
      const min = peaks[i * 2];
      const max = peaks[i * 2 + 1];
      const y0 = height / 2 - max * (height / 2) * 0.95;
      const y1 = height / 2 - min * (height / 2) * 0.95;
      ctx.fillRect(x, y0, Math.max(1, width / columns), Math.max(1, y1 - y0));
    }
  }, [peaks]);

  const secondsToPercent = useCallback(
    (seconds: number) => ((seconds - windowStart) / windowSeconds) * 100,
    [windowStart, windowSeconds],
  );

  const pointerSeconds = useCallback(
    (clientX: number) => {
      const wrap = wrapRef.current;
      if (!wrap) return 0;
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return windowStart + ratio * windowSeconds;
    },
    [windowStart, windowSeconds],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const kind = dragging.current;
      if (!kind || !state) return;
      const seconds = Math.max(0, Math.min(duration, pointerSeconds(event.clientX)));
      set(kind, seconds);
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [duration, pointerSeconds, set, state]);

  const previewSelection = () => {
    const target = engineRef.current;
    if (!target || !buffer || !sound) return;
    target.playSample(sound, buffer, state?.rootNote ?? 60, 100);
  };

  if (!sound || !state) {
    return (
      <div className="p-3">
        <Panel title={strings.studio.modes.sample}>
          <p className="p-6 text-sm text-ink-faint">{strings.library.empty}</p>
        </Panel>
      </div>
    );
  }

  const markers: MarkerKind[] = state.loopEnabled
    ? ["trimStart", "trimEnd", "loopStart", "loopEnd"]
    : ["trimStart", "trimEnd"];

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <Panel
        title={sound.name}
        actions={
          <div className="flex items-center gap-1">
            <IconButton
              aria-label="Zoom out"
              size="sm"
              variant="ghost"
              icon={<MagnifyingGlassMinus size={13} />}
              onClick={() => setZoom((z) => Math.max(1, z / 2))}
            />
            <IconButton
              aria-label="Zoom in"
              size="sm"
              variant="ghost"
              icon={<MagnifyingGlassPlus size={13} />}
              onClick={() => setZoom((z) => Math.min(64, z * 2))}
            />
            <Button size="sm" icon={<Play size={13} weight="fill" />} onClick={previewSelection}>
              {strings.sampleEditor.previewSelection}
            </Button>
            <Button size="sm" variant="ghost" onClick={undo}>
              {strings.sampleEditor.undo}
            </Button>
          </div>
        }
      >
        <div className="p-3">
          <div ref={wrapRef} className="material-display relative h-40 w-full overflow-hidden">
            <canvas ref={canvasRef} className="h-full w-full" role="img" aria-label="Sample waveform" />

            {/* Trimmed-out regions are dimmed, so the edit is visible. */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-display/70"
              style={{ width: `${Math.max(0, secondsToPercent(state.trimStart))}%`, background: "rgba(29,29,32,0.72)" }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0"
              style={{
                width: `${Math.max(0, 100 - secondsToPercent(state.trimEnd))}%`,
                background: "rgba(29,29,32,0.72)",
              }}
            />

            {markers.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-label={strings.sampleEditor[kind === "trimStart" ? "trimStart" : kind === "trimEnd" ? "trimEnd" : kind === "loopStart" ? "loopStart" : "loopEnd"]}
                onPointerDown={(e) => {
                  e.preventDefault();
                  dragging.current = kind;
                }}
                className="absolute inset-y-0 w-2 cursor-ew-resize"
                style={{ left: `calc(${secondsToPercent(state[kind])}% - 4px)` }}
              >
                <span className="absolute inset-y-0 left-1/2 w-0.5" style={{ background: MARKER_COLOR[kind] }} />
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-ink-faint">
            <span>{duration.toFixed(2)}s</span>
            <span>x{zoom}</span>
            <input
              type="range"
              aria-label="Scroll"
              min={0}
              max={Math.max(0, duration - windowSeconds)}
              step={0.001}
              value={windowStart}
              onChange={(e) => setOffset(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
              disabled={zoom === 1}
            />
          </div>
        </div>
      </Panel>

      <Panel title={strings.studio.sections.shape}>
        <div className="flex flex-col gap-3 p-3">
          <ControlRow>
            <SegmentedControl
              label={strings.sampleEditor.mode}
              options={MODES}
              value={state.playbackMode}
              size="sm"
              onChange={(m) => set("playbackMode", m)}
            />
            <Toggle
              checked={state.loopEnabled}
              onChange={(on) => set("loopEnabled", on)}
              label={strings.sampleEditor.loop}
              led={state.loopEnabled ? "on" : "off"}
            />
            <Toggle
              checked={state.reversed}
              onChange={(on) => set("reversed", on)}
              label={strings.sampleEditor.reverse}
              led={state.reversed ? "on" : "off"}
            />
            <Button
              size="sm"
              onClick={() => {
                if (!buffer) return;
                let peak = 0;
                for (let c = 0; c < buffer.numberOfChannels; c += 1) {
                  const data = buffer.getChannelData(c);
                  for (let i = 0; i < data.length; i += 1) {
                    const abs = Math.abs(data[i]);
                    if (abs > peak) peak = abs;
                  }
                }
                if (peak > 0) set("gain", Math.min(2, 1 / peak));
              }}
            >
              {strings.sampleEditor.normalize}
            </Button>
          </ControlRow>

          <ControlRow>
            <Knob label={strings.sampleEditor.gain} value={state.gain} min={0} max={2} defaultValue={1} onChange={(v) => set("gain", v)} />
            <Knob label={strings.sampleEditor.fadeIn} value={state.fadeIn} min={0} max={5} defaultValue={0} unit="s" onChange={(v) => set("fadeIn", v)} />
            <Knob label={strings.sampleEditor.fadeOut} value={state.fadeOut} min={0} max={5} defaultValue={0} unit="s" onChange={(v) => set("fadeOut", v)} />
            <Knob
              label={strings.sampleEditor.rootNote}
              value={state.rootNote}
              min={0}
              max={127}
              step={1}
              defaultValue={60}
              format={(v) => noteToName(Math.round(v))}
              onChange={(v) => set("rootNote", Math.round(v))}
            />
            <Knob
              label={strings.sampleEditor.tuning}
              value={state.tuningCents}
              min={-1200}
              max={1200}
              defaultValue={0}
              unit="ct"
              onChange={(v) => set("tuningCents", v)}
            />
          </ControlRow>

          <div className="material-sunken rounded-[var(--radius-control)] px-3 py-2">
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-ink-soft">
              {strings.synth.ampEnv}
            </span>
            <ControlRow>
              <Knob label={strings.synth.attack} value={state.ampEnvelope.attack} min={0.001} max={10} logarithmic defaultValue={0.005} size={40} onChange={(v) => set("ampEnvelope.attack", v)} />
              <Knob label={strings.synth.decay} value={state.ampEnvelope.decay} min={0.001} max={10} logarithmic defaultValue={0.15} size={40} onChange={(v) => set("ampEnvelope.decay", v)} />
              <Knob label={strings.synth.sustain} value={state.ampEnvelope.sustain} min={0} max={1} defaultValue={0.7} size={40} onChange={(v) => set("ampEnvelope.sustain", v)} />
              <Knob label={strings.synth.release} value={state.ampEnvelope.release} min={0.001} max={30} logarithmic defaultValue={0.2} size={40} onChange={(v) => set("ampEnvelope.release", v)} />
            </ControlRow>
          </div>

          <ControlRow>
            <Knob
              label={strings.synth.cutoff}
              value={state.filter.cutoff}
              min={20}
              max={20000}
              logarithmic
              defaultValue={20000}
              unit="Hz"
              onChange={(v) => set("filter.cutoff", v)}
            />
            <Knob
              label={strings.synth.resonance}
              value={state.filter.resonance}
              min={0.1}
              max={24}
              defaultValue={0.7}
              onChange={(v) => set("filter.resonance", v)}
            />
          </ControlRow>
        </div>
      </Panel>

      <Panel title={strings.studio.sections.space}>
        <div className="p-3">
          <EffectsSection effects={state.effects} set={set} advanced />
        </div>
      </Panel>
    </div>
  );
}
