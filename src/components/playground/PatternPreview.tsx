"use client";

/**
 * A pattern, drawn small.
 *
 * The same thumbnail appears wherever a pattern is referenced rather than
 * edited — the picker, the clips on the timeline, the inspector — so a
 * pattern is recognised by its shape before its name is read. It is a plain
 * SVG over `patternPreviewCells`: no state, no measurement, cheap enough to
 * render one per clip.
 */
import { useMemo } from "react";
import { clipRepeats, patternPreviewCells } from "./patternGeometry";
import type { Pattern } from "@/lib/schema/types";

export function PatternPreview({
  pattern,
  /** CSS colour for the notes. Defaults to the accent. */
  color = "var(--accent)",
  /** Times the pattern is tiled across the width (looped clips). */
  repeats = 1,
  /** Fraction of the width already played, 0..1. Drawn as a soft playhead. */
  progress,
  className = "",
}: {
  pattern: Pattern | undefined;
  color?: string;
  repeats?: number;
  progress?: number;
  className?: string;
}) {
  const cells = useMemo(
    () => (pattern ? patternPreviewCells(pattern.notes, pattern.lengthBeats) : []),
    [pattern],
  );

  const tiles = Math.max(1, Math.round(repeats));
  const tileWidth = 1 / tiles;

  return (
    <span aria-hidden className={`relative block overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="h-full w-full"
        style={{ display: "block" }}
      >
        {/* Beat divisions of one tile, so the grid reads at any width. */}
        {Array.from({ length: tiles }, (_, tile) => (
          <line
            key={`tile-${tile}`}
            x1={tile * tileWidth}
            y1={0}
            x2={tile * tileWidth}
            y2={1}
            stroke="currentColor"
            strokeOpacity={tile === 0 ? 0 : 0.25}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {Array.from({ length: tiles }, (_, tile) =>
          cells.map((cell, index) => (
            <rect
              key={`${tile}-${index}`}
              x={(tile + cell.x) * tileWidth}
              y={cell.y}
              width={Math.max(cell.width * tileWidth, 0.004)}
              height={cell.height}
              rx={0.01}
              fill={color}
              opacity={0.45 + cell.velocity * 0.55}
            />
          )),
        )}
        {progress !== undefined && progress >= 0 && progress <= 1 && (
          <line
            x1={progress}
            y1={0}
            x2={progress}
            y2={1}
            stroke="var(--accent)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </span>
  );
}

/** Repeat count for a pattern clip, re-exported for callers drawing clips. */
export { clipRepeats };
