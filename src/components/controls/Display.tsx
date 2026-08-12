"use client";

/**
 * Display: a dark LCD readout for numeric values (BPM, position, counts).
 *
 * Purely presentational. Uses the material-display surface and the mono font
 * with tabular figures so digits do not shift as the value changes.
 */
import type { ReactNode } from "react";

export interface DisplayProps {
  value: ReactNode;
  unit?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASS = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-lg",
} as const;

export function Display({ value, unit, size = "md", className }: DisplayProps) {
  return (
    <span
      className={`material-display inline-flex items-baseline gap-1 whitespace-nowrap font-mono tabular-nums ${SIZE_CLASS[size]} ${
        className ?? ""
      }`}
    >
      <span className="text-display-ink">{value}</span>
      {unit && <span className="text-display-ink/60">{unit}</span>}
    </span>
  );
}
