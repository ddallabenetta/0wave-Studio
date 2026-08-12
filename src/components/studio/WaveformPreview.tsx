"use client";

/**
 * Waveform preview for the current patch: the mixed oscillator/noise shape
 * at burst amplitude, plus a small ADSR curve. Deterministic — re-renders
 * instantly on every edit without touching the audio engine.
 */
import { useMemo } from "react";
import { renderWaveformPreview } from "@/lib/audio/waveformPreview";
import type { SynthState } from "@/lib/schema/types";
import { strings } from "@/i18n";

export function WaveformPreview({ state }: { state: SynthState }) {
  const { wavePath, envelopePath, silent } = useMemo(() => renderWaveformPreview(state), [state]);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="material-display relative rounded-[var(--radius-control)] px-1 pb-1 pt-2"
        role="img"
        aria-label={strings.studio.waveformPreview}
      >
        <svg
          viewBox="0 -1 1 2"
          preserveAspectRatio="none"
          className="h-32 w-full"
          aria-hidden
        >
          {/* Zero line */}
          <line x1="0" y1="0" x2="1" y2="0" stroke="var(--edge-strong)" strokeWidth="1" />
          {/* Wave */}
          <path
            d={wavePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray={silent ? "1 0.5" : undefined}
          />
        </svg>
        <span className="absolute left-1.5 top-1 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
          {strings.studio.waveformPreview}
        </span>
        {silent && (
          <span className="absolute bottom-1.5 left-0 right-0 text-center font-mono text-[10px] text-ink-faint">
            {strings.studio.silentPatch}
          </span>
        )}
      </div>

      <div
        className="material-display relative rounded-[var(--radius-control)] px-1 pb-1 pt-2"
        role="img"
        aria-label={strings.studio.envelopePreview}
      >
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="h-12 w-full"
          aria-hidden
        >
          <path
            d={envelopePath}
            fill="none"
            stroke="var(--accent)"
            opacity="0.8"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="absolute left-1.5 top-1 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
          {strings.studio.envelopePreview}
        </span>
      </div>
    </div>
  );
}
