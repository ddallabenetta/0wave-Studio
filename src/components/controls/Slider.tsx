"use client";

/**
 * Slider: a full-width, click-to-position slider in the style of the
 * "reasoning effort" pickers in Claude Code / Codex.
 *
 * A thin recessed track with tick dots, an accent fill and a small pill
 * thumb; the label sits on the left with the live value on the right, and
 * the two ends of the range are named under the track (e.g. "Soft" … "Snappy").
 *
 * Pointer: click or drag positions the thumb directly. Alt+click and
 * double-click reset to `defaultValue`. Keyboard: arrows ±5%, PageUp/Down
 * ±25%, Home min, End max.
 */
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { clamp } from "@/lib/music/theory";

export interface SliderProps {
  label: string;
  /**
   * Slot beside the label, for a glossary tip. Kept generic so the control
   * library stays independent of the guidance layer.
   */
  help?: ReactNode;
  /** Normalized 0..1 position. */
  value: number;
  onChange: (value: number) => void;
  /** Value restored by Alt+click / double-click. */
  defaultValue: number;
  /** Display for the current value (defaults to a percentage). */
  format?: (value: number) => string;
  /** Name of the low end of the range, shown under the track. */
  minLabel?: string;
  /** Name of the high end of the range, shown under the track. */
  maxLabel?: string;
  disabled?: boolean;
  className?: string;
}

const NUDGE = 0.05;

export function Slider({
  label,
  help,
  value,
  onChange,
  defaultValue,
  format = (v) => `${Math.round(v * 100)}%`,
  minLabel,
  maxLabel,
  disabled = false,
  className = "",
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const positionFromEvent = useCallback((e: React.PointerEvent): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp((e.clientX - rect.left) / rect.width, 0, 1);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || e.button !== 0) return;
      if (e.altKey) {
        onChange(clamp(defaultValue, 0, 1));
        return;
      }
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* Drag still tracks via pointermove. */
      }
      setDragging(true);
      onChange(positionFromEvent(e));
    },
    [disabled, defaultValue, onChange, positionFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onChange(positionFromEvent(e));
    },
    [dragging, onChange, positionFromEvent],
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
      let next: number | null = null;
      switch (e.key) {
        case "ArrowRight":
          next = value + NUDGE;
          break;
        case "ArrowLeft":
          next = value - NUDGE;
          break;
        case "PageUp":
          next = value + NUDGE * 5;
          break;
        case "PageDown":
          next = value - NUDGE * 5;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      onChange(clamp(next, 0, 1));
    },
    [disabled, value, onChange],
  );

  const t = clamp(value, 0, 1);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft">
          {label}
          {help}
        </span>
        <span
          className={`font-mono text-[11px] tabular-nums ${
            dragging ? "text-accent" : "text-ink"
          }`}
        >
          {format(t)}
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(t.toFixed(2))}
        aria-valuetext={format(t)}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onDoubleClick={() => !disabled && onChange(clamp(defaultValue, 0, 1))}
        onKeyDown={onKeyDown}
        className={`group relative h-7 cursor-pointer select-none rounded-[var(--radius-control)] ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
        style={{ touchAction: "none" }}
      >
        {/* Track */}
        <div className="material-sunken absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 overflow-hidden rounded-full">
          {/* Fill. A two-stop gradient rather than a flat accent, so the
              travelled part of the track reads as an amount, not a state. */}
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${t * 100}%`,
              background: "linear-gradient(90deg, var(--accent-pressed), var(--accent))",
              boxShadow: dragging
                ? "0 0 10px -1px color-mix(in srgb, var(--accent) 75%, transparent)"
                : "none",
              transition: "box-shadow var(--dur-2) var(--ease-out-expo)",
            }}
          />
          {/* Tick dots */}
          <div aria-hidden className="absolute inset-0 flex justify-between px-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="relative top-1/2 size-[3px] -translate-y-1/2 rounded-full bg-ink/40"
              />
            ))}
          </div>
        </div>

        {/* Thumb */}
        <div
          aria-hidden
          data-pressed={dragging || undefined}
          className="absolute top-1/2"
          style={{ left: `${t * 100}%`, transform: "translate(-50%, -50%)" }}
        >
          <div
            className={`motion-ui h-4 w-[9px] rounded-[3px] border bg-surface-raised group-hover:bg-accent-wash ${
              dragging ? "border-accent" : "border-edge-strong"
            }`}
            style={{
              boxShadow: dragging ? "var(--halo-strong)" : "var(--shadow-ambient)",
              // Grows under the finger: the grabbed thumb is physically
              // bigger than the one you are only hovering.
              transform: dragging ? "scale(1.18)" : "none",
            }}
          />
        </div>
      </div>

      {(minLabel || maxLabel) && (
        <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-ink-faint">
          <span>{minLabel ?? ""}</span>
          <span>{maxLabel ?? ""}</span>
        </div>
      )}
    </div>
  );
}
