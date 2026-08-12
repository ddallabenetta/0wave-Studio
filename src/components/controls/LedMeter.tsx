"use client";

/**
 * LedMeter: a segmented level meter (input level, master output, etc).
 *
 * Driven by a normalized `level` (0..1) plus a `clip` flag. Renders a fixed
 * set of segments (default 9) colored green, orange, red via semantic tokens.
 * Updates are cheap: segment sizes never change (no layout), only opacity and
 * background paint toggle as the level moves.
 */
import { clamp } from "@/lib/music/theory";

export interface LedMeterProps {
  /** Normalized level, 0..1. */
  level: number;
  /** Latches the top segment red to signal clipping. */
  clip?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Number of segments (8-10 reads best). */
  segments?: number;
  /** Accessible name. When omitted the meter is treated as decorative. */
  label?: string;
  className?: string;
}

function segmentColor(index: number, total: number): string {
  const frac = (index + 1) / total;
  if (frac < 0.7) return "bg-success";
  if (frac < 0.9) return "bg-warning";
  return "bg-error";
}

export function LedMeter(props: LedMeterProps) {
  const {
    level,
    clip = false,
    orientation = "horizontal",
    segments = 9,
    label,
    className,
  } = props;

  const n = Math.max(1, segments);
  const normalized = clamp(level, 0, 1);
  const litCount = Math.round(normalized * n);
  const vertical = orientation === "vertical";

  const a11y = label
    ? {
        role: "meter" as const,
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(normalized * 100),
      }
    : { "aria-hidden": true as const };

  return (
    <div
      {...a11y}
      className={`inline-flex ${vertical ? "flex-col-reverse" : "flex-row"} gap-0.5 ${
        className ?? ""
      }`}
    >
      {Array.from({ length: n }, (_, i) => {
        const lit = i < litCount || (clip && i === n - 1);
        const segSize = vertical ? "h-1.5 w-3" : "h-3 w-1.5";
        return (
          <span
            key={i}
            className={`${segSize} rounded-[var(--radius-clip)] ${segmentColor(i, n)} ${
              lit ? "opacity-100" : "opacity-20"
            }`}
          />
        );
      })}
    </div>
  );
}
