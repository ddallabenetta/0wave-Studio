"use client";

/**
 * Real oscilloscope + spectrum analyser.
 *
 * Both draw from engine.getMasterFrame() inside one requestAnimationFrame
 * loop. No React state is touched per frame; the loop stops when the tab is
 * hidden or the component unmounts. The master meter samples the captured
 * peak at 20 Hz, which is a display rate, not an audio rate.
 */
import { useEffect, useRef, useState } from "react";
import { useEngine, useAnimationFrame } from "@/components/hooks/useEngine";
import { LedMeter } from "@/components/controls";
import { useUiStore } from "@/lib/state/ui-store";
import { Panel } from "./Panel";
import { strings } from "@/i18n";

function fitCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function Analyzer() {
  const engine = useEngine();
  const scopeRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumRef = useRef<HTMLCanvasElement | null>(null);
  const peakRef = useRef(0);
  const [level, setLevel] = useState(0);
  const clipping = useUiStore((s) => s.masterClipping);
  const status = useUiStore((s) => s.audioStatus);
  const running = status === "running";

  useEffect(() => {
    const id = window.setInterval(() => setLevel(peakRef.current), 50);
    return () => window.clearInterval(id);
  }, []);

  useAnimationFrame(running, () => {
    const frame = engine?.getMasterFrame();
    const scope = scopeRef.current;
    const spectrum = spectrumRef.current;
    fitCanvas(scope);
    fitCanvas(spectrum);

    const scopeCtx = scope?.getContext("2d");
    if (scope && scopeCtx) {
      const { width, height } = scope;
      scopeCtx.clearRect(0, 0, width, height);
      scopeCtx.strokeStyle = "#3a3a3e";
      scopeCtx.lineWidth = 1;
      scopeCtx.beginPath();
      scopeCtx.moveTo(0, height / 2);
      scopeCtx.lineTo(width, height / 2);
      scopeCtx.stroke();

      if (frame) {
        const data = frame.timeDomain;
        let peak = 0;
        scopeCtx.strokeStyle = "#ff6a2b";
        scopeCtx.lineWidth = Math.max(1, Math.round(height / 60));
        scopeCtx.beginPath();
        for (let i = 0; i < data.length; i += 1) {
          const v = data[i];
          const abs = v < 0 ? -v : v;
          if (abs > peak) peak = abs;
          const x = (i / (data.length - 1)) * width;
          const y = height / 2 - v * (height / 2) * 0.92;
          if (i === 0) scopeCtx.moveTo(x, y);
          else scopeCtx.lineTo(x, y);
        }
        scopeCtx.stroke();
        peakRef.current = peak;
      }
    }

    const spectrumCtx = spectrum?.getContext("2d");
    if (spectrum && spectrumCtx && frame) {
      const { width, height } = spectrum;
      spectrumCtx.clearRect(0, 0, width, height);
      const bins = frame.frequency;
      const barCount = Math.min(64, bins.length);
      const step = Math.max(1, Math.floor(bins.length / barCount));
      const barWidth = width / barCount;
      for (let i = 0; i < barCount; i += 1) {
        let sum = 0;
        for (let j = 0; j < step; j += 1) sum += bins[i * step + j] ?? 0;
        const magnitude = sum / step / 255;
        const barHeight = magnitude * height;
        spectrumCtx.fillStyle = magnitude > 0.85 ? "#e8500a" : "#ff6a2b";
        spectrumCtx.fillRect(i * barWidth + 1, height - barHeight, Math.max(1, barWidth - 2), barHeight);
      }
    }
  });

  return (
    <Panel title="Analyzer" className="shrink-0">
      <div className="flex flex-col gap-2 p-3">
        <canvas ref={scopeRef} className="material-display h-24 w-full" role="img" aria-label="Oscilloscope" />
        <canvas ref={spectrumRef} className="material-display h-20 w-full" role="img" aria-label="Spectrum analyzer" />
        <LedMeter level={running ? level : 0} clip={clipping} label="Master level" orientation="horizontal" />
        {!running && (
          <p className="font-mono text-[10px] text-ink-faint">{strings.audio.statusUninitialized}</p>
        )}
      </div>
    </Panel>
  );
}
