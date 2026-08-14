"use client";

/**
 * A thumbnail of what a patch actually looks like.
 *
 * Preset lists usually distinguish entries by name alone, which is useless
 * if the names are new to you. This draws the preset's real waveform and
 * amp envelope with the same deterministic renderer the big preview uses,
 * so a kick, a pad and a noise hit are visibly three different things
 * before anything is played.
 *
 * Pure and cheap: no AudioContext, no randomness, memoised per patch.
 */
import { useMemo } from "react";
import { renderWaveformPreview } from "@/lib/audio/waveformPreview";
import type { SynthState } from "@/lib/schema/types";

export function PresetSparkline({
  state,
  active = false,
  className = "",
}: {
  state: SynthState | undefined;
  /** Selected card: the trace lights up rather than changing colour. */
  active?: boolean;
  className?: string;
}) {
  const preview = useMemo(() => (state ? renderWaveformPreview(state) : null), [state]);

  return (
    <span
      aria-hidden
      className={`material-display relative block overflow-hidden rounded-[var(--radius-control)] ${className}`}
    >
      {preview && (
        <svg viewBox="0 -1 1 2" preserveAspectRatio="none" className="h-full w-full">
          <line x1="0" y1="0" x2="1" y2="0" stroke="var(--display-grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {/* Envelope behind the wave: the shape of the note over time. */}
          <path
            d={preview.envelopePath}
            fill="none"
            stroke="var(--display-ink)"
            strokeOpacity="0.22"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            transform="translate(0 -1) scale(1 2)"
          />
          <path
            d={preview.wavePath}
            fill="none"
            stroke="var(--display-trace)"
            strokeWidth={active ? 1.6 : 1.2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray={preview.silent ? "1 0.5" : undefined}
            style={{
              filter: active
                ? "drop-shadow(0 0 3px color-mix(in srgb, var(--display-trace) 80%, transparent))"
                : "none",
              transition: "stroke-width var(--dur-2) var(--ease-out-expo)",
            }}
          />
        </svg>
      )}
    </span>
  );
}
