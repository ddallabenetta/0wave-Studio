"use client";

/**
 * Pad2D: a draggable point on a two-axis surface.
 *
 * Values are normalized 0..1 on both axes (x = left→right, y = bottom→top).
 * Pointer drag moves the point directly; Alt+click and double-click reset to
 * the default; arrow keys nudge by 5%. Used by the Studio basic view for the
 * brightness × movement character pad.
 */
import { useCallback, useRef, useState } from "react";
import { clamp } from "@/lib/music/theory";

export interface Pad2DPoint {
  x: number;
  y: number;
}

export interface Pad2DProps {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  label: string;
  /** Label for the horizontal axis (left end). */
  xLabel: string;
  /** Label for the vertical axis (bottom end). */
  yLabel: string;
  defaultValue?: Pad2DPoint;
  height?: number;
  disabled?: boolean;
  className?: string;
}

const NUDGE = 0.05;

export function Pad2D({
  x,
  y,
  onChange,
  label,
  xLabel,
  yLabel,
  defaultValue = { x: 0.5, y: 0.5 },
  height = 168,
  disabled = false,
  className = "",
}: Pad2DProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const toPoint = useCallback((e: React.PointerEvent): Pad2DPoint => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: 1 - clamp((e.clientY - rect.top) / rect.height, 0, 1),
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || e.button !== 0) return;
      if (e.altKey) {
        onChange(defaultValue.x, defaultValue.y);
        return;
      }
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* Drag still tracks via pointermove. */
      }
      setDragging(true);
      const point = toPoint(e);
      onChange(point.x, point.y);
    },
    [disabled, defaultValue, onChange, toPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const point = toPoint(e);
      onChange(point.x, point.y);
    },
    [dragging, onChange, toPoint],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* Pointer may already be released. */
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      let nx = x;
      let ny = y;
      switch (e.key) {
        case "ArrowUp":
          ny = clamp(y + NUDGE, 0, 1);
          break;
        case "ArrowDown":
          ny = clamp(y - NUDGE, 0, 1);
          break;
        case "ArrowRight":
          nx = clamp(x + NUDGE, 0, 1);
          break;
        case "ArrowLeft":
          nx = clamp(x - NUDGE, 0, 1);
          break;
        case "Home":
          nx = 0;
          ny = 0;
          break;
        case "End":
          nx = 1;
          ny = 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      onChange(nx, ny);
    },
    [disabled, x, y, onChange],
  );

  const px = x * 100;
  const py = y * 100;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div
        ref={boxRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(x.toFixed(2))}
        aria-valuetext={`${xLabel} ${Math.round(px)}%, ${yLabel} ${Math.round(py)}%`}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onDoubleClick={() => !disabled && onChange(defaultValue.x, defaultValue.y)}
        onKeyDown={onKeyDown}
        className={`material-sunken relative w-full select-none rounded-[var(--radius-control)] ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-crosshair"
        }`}
        style={{ height, touchAction: "none" }}
      >
        {/* Field wash. The surface itself shows what the axes mean: it
            brightens towards the right (the X axis) and lifts towards the
            top (the Y axis), so the corner you are heading for is legible
            before you get there. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[var(--radius-control)]"
          style={{
            background:
              "linear-gradient(90deg, transparent 15%, color-mix(in srgb, var(--accent) 14%, transparent) 100%), linear-gradient(0deg, transparent 30%, color-mix(in srgb, var(--accent-glow) 10%, transparent) 100%)",
          }}
        />

        {/* Light that follows the point, so the pad glows where you left it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[var(--radius-control)]"
          style={{
            background: `radial-gradient(120px circle at ${px}% ${100 - py}%, color-mix(in srgb, var(--accent) ${
              dragging ? 30 : 18
            }%, transparent), transparent 70%)`,
            transition: "background var(--dur-2) linear",
          }}
        />

        {/* Quarter grid: reference marks so a position can be remembered. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {[25, 50, 75].map((offset) => (
            <span
              key={`v-${offset}`}
              className="absolute top-0 h-full w-px"
              style={{
                left: `${offset}%`,
                background: "var(--ink)",
                opacity: offset === 50 ? 0.12 : 0.06,
              }}
            />
          ))}
          {[25, 50, 75].map((offset) => (
            <span
              key={`h-${offset}`}
              className="absolute left-0 h-px w-full"
              style={{
                top: `${offset}%`,
                background: "var(--ink)",
                opacity: offset === 50 ? 0.12 : 0.06,
              }}
            />
          ))}
        </div>

        {/* Drag point. */}
        <div
          aria-hidden
          data-pressed={dragging || undefined}
          className="pointer-events-none absolute"
          style={{ left: `${px}%`, top: `${100 - py}%`, transform: "translate(-50%, -50%)" }}
        >
          {/* Halo pulses only while dragging: a live control, not decoration
              on a control nobody is touching. */}
          {dragging && (
            <span className="anim-ring absolute inset-0 rounded-full text-accent" />
          )}
          <div
            className={`motion-ui relative size-4 rounded-full border-2 ${
              dragging ? "border-accent-pressed bg-accent-pressed/40" : "border-accent bg-accent/25"
            }`}
            style={{
              boxShadow: dragging
                ? "0 0 0 1px var(--surface-raised), var(--halo-strong)"
                : "0 0 0 1px var(--surface-raised), var(--shadow-ambient)",
              transform: dragging ? "scale(1.15)" : "none",
            }}
          />
        </div>

        {/* Axis labels. */}
        <span className="pointer-events-none absolute left-1.5 top-1 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
          {xLabel} {Math.round(px)}%
        </span>
        <span className="pointer-events-none absolute bottom-1 left-1.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
          {yLabel} {Math.round(py)}%
        </span>
        <span className="pointer-events-none absolute bottom-1 right-1.5 font-mono text-[9px] text-ink-faint/60">
          {label}
        </span>
      </div>
    </div>
  );
}
