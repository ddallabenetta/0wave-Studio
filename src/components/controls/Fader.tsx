"use client";

/**
 * Fader: a linear slider, vertical or horizontal (volume, pan, etc).
 *
 * Shares the Knob's interaction contract:
 * - drag along the track via pointer capture.
 * - ArrowUp/Down/Left/Right ±step, PageUp/Down ±10x step, Home/End min/max.
 * - double-click or Alt+click resets to defaultValue.
 * - the wheel is deliberately inert.
 *
 * Visual: a recessed channel with an accent fill and a raised rectangular
 * thumb. While interacting, a small mono readout replaces the label.
 */
import { forwardRef, useCallback, useState } from "react";
import { clamp } from "@/lib/music/theory";
import { useDragSession, useValueKeyboard, valueToNormalized } from "./useDrag";

export interface FaderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Value restored by double-click or Alt+click. */
  defaultValue: number;
  label: string;
  unit?: string;
  format?: (value: number) => string;
  step?: number;
  /** Drag and layout axis. */
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
  /** Track length in px along the drag axis. */
  length?: number;
  className?: string;
}

function decimalsFor(step: number | undefined, min: number, max: number): number {
  const s = step && step > 0 ? step : (max - min) / 100;
  if (!s || !Number.isFinite(s) || s <= 0) return 2;
  return Math.min(4, Math.max(0, Math.ceil(-Math.log10(s))));
}

export const Fader = forwardRef<HTMLDivElement, FaderProps>(function Fader(props, ref) {
  const {
    value,
    min,
    max,
    onChange,
    defaultValue,
    label,
    unit,
    format,
    step,
    orientation = "vertical",
    disabled = false,
    length = 160,
    className,
  } = props;

  const vertical = orientation === "vertical";
  const [focused, setFocused] = useState(false);

  const drag = useDragSession({
    value,
    min,
    max,
    step,
    orientation,
    disabled,
    onValue: onChange,
  });

  const onKeyDown = useValueKeyboard({ value, min, max, step, disabled, onValue: onChange });

  const resetValue = clamp(defaultValue, min, max);
  const reset = useCallback(() => {
    if (!disabled) onChange(resetValue);
  }, [disabled, onChange, resetValue]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.altKey) {
        reset();
        return;
      }
      drag.onPointerDown(e);
    },
    [drag, reset],
  );

  const t = valueToNormalized(value, min, max, false);
  const decimals = decimalsFor(step, min, max);
  const formatter = format ?? ((v: number) => v.toFixed(decimals));
  const valueText = `${formatter(value)}${unit ? ` ${unit}` : ""}`;
  const interacting = drag.dragging || focused;

  // Hit area is a little wider than the visible track.
  const crossSize = 28;
  const boxStyle = vertical
    ? { width: crossSize, height: length }
    : { width: length, height: crossSize };

  const thumbPos = vertical
    ? { left: "50%", top: `${(1 - t) * 100}%` }
    : { left: `${t * 100}%`, top: "50%" };

  return (
    <div
      className={`inline-flex select-none ${vertical ? "flex-col items-center" : "flex-row items-center"} gap-1.5 ${
        className ?? ""
      }`}
      style={{ touchAction: "none" }}
    >
      <div
        ref={ref}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-label={label}
        aria-orientation={orientation}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerUp}
        onLostPointerCapture={drag.onPointerUp}
        onDoubleClick={reset}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`relative rounded-[var(--radius-control)] ${
          disabled ? "cursor-not-allowed opacity-50" : vertical ? "cursor-ns-resize" : "cursor-ew-resize"
        }`}
        style={boxStyle}
      >
        {/* Recessed channel. */}
        <div
          className={`material-sunken absolute ${
            vertical
              ? "left-1/2 top-0 h-full w-[6px] -translate-x-1/2"
              : "left-0 top-1/2 h-[6px] w-full -translate-y-1/2"
          } rounded-full`}
        >
          <div
            className={`absolute rounded-full bg-accent ${
              vertical ? "bottom-0 left-0 w-full" : "left-0 top-0 h-full"
            }`}
            style={vertical ? { height: `${t * 100}%` } : { width: `${t * 100}%` }}
          />
        </div>

        {/* Positioning wrapper centers the thumb on the current value. */}
        <div className="absolute" style={{ ...thumbPos, transform: "translate(-50%, -50%)" }}>
          <div
            data-pressed={drag.dragging || undefined}
            className={
              disabled
                ? "rounded-[var(--radius-control)] border border-edge bg-surface-raised"
                : "material-raised motion-ui rounded-[var(--radius-control)]"
            }
            style={vertical ? { width: 24, height: 14 } : { width: 14, height: 24 }}
          >
            <span
              aria-hidden
              className={
                vertical
                  ? "absolute left-1/2 top-1/2 h-[2px] w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-faint"
                  : "absolute left-1/2 top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-faint"
              }
            />
          </div>
        </div>
      </div>

      <div className="flex h-4 items-center justify-center">
        <span
          className={`font-mono text-[10px] leading-4 ${
            interacting ? "text-accent" : "text-ink-faint"
          }`}
        >
          {interacting ? valueText : label}
        </span>
      </div>
    </div>
  );
});
