"use client";

/**
 * Knob: a circular rotary control.
 *
 * Interaction model:
 * - vertical drag changes the value via pointer capture (~150px = full range).
 * - ArrowUp/Down ±step, PageUp/Down ±10x step, Home/End jump to min/max.
 * - double-click or Alt+click resets to defaultValue.
 * - the wheel is deliberately inert (never hijacked, never preventDefault).
 *
 * Visual: a raised 3D cap with a rotating pointer notch, surrounded by an arc
 * that sweeps from -135deg to +135deg. While interacting, a small mono readout
 * replaces the label so the exact value is always visible.
 */
import { forwardRef, useCallback, useState } from "react";
import { clamp } from "@/lib/music/theory";
import {
  useDragSession,
  useValueKeyboard,
  valueToNormalized,
} from "./useDrag";

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Value restored by double-click or Alt+click. */
  defaultValue: number;
  label: string;
  unit?: string;
  format?: (value: number) => string;
  logarithmic?: boolean;
  step?: number;
  disabled?: boolean;
  /** Diameter of the cap in px. */
  size?: number;
  className?: string;
}

const MIN_ANGLE = -135;
const MAX_ANGLE = 135;
const STROKE = 3;
const RING_PAD = 5;

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

function decimalsFor(step: number | undefined, min: number, max: number): number {
  const s = step && step > 0 ? step : (max - min) / 100;
  if (!s || !Number.isFinite(s) || s <= 0) return 2;
  return Math.min(4, Math.max(0, Math.ceil(-Math.log10(s))));
}

export const Knob = forwardRef<HTMLDivElement, KnobProps>(function Knob(props, ref) {
  const {
    value,
    min,
    max,
    onChange,
    defaultValue,
    label,
    unit,
    format,
    logarithmic = false,
    step,
    disabled = false,
    size = 44,
    className,
  } = props;

  const [focused, setFocused] = useState(false);

  const drag = useDragSession({
    value,
    min,
    max,
    logarithmic,
    step,
    orientation: "vertical",
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

  const t = valueToNormalized(value, min, max, logarithmic);
  const angle = MIN_ANGLE + (MAX_ANGLE - MIN_ANGLE) * t;

  const decimals = decimalsFor(step, min, max);
  const formatter = format ?? ((v: number) => v.toFixed(decimals));
  const valueText = `${formatter(value)}${unit ? ` ${unit}` : ""}`;
  const interacting = drag.dragging || focused;

  const arcR = size / 2 + RING_PAD;
  const svgSize = size + RING_PAD * 2 + STROKE;
  const c = svgSize / 2;
  const capOffset = (svgSize - size) / 2;

  return (
    <div
      className={`inline-flex flex-col items-center gap-1 select-none ${className ?? ""}`}
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
        className={`relative rounded-full ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-ns-resize"
        }`}
        style={{ width: svgSize, height: svgSize }}
      >
        <svg width={svgSize} height={svgSize} className="absolute inset-0" aria-hidden>
          <path
            d={arcPath(c, c, arcR, MIN_ANGLE, MAX_ANGLE)}
            fill="none"
            style={{ stroke: "var(--edge-strong)" }}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <path
            d={arcPath(c, c, arcR, MIN_ANGLE, angle)}
            fill="none"
            style={{ stroke: "var(--accent)" }}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        </svg>

        {/* Cap wrapper carries rotation; the inner cap carries the press state. */}
        <div
          className="absolute"
          style={{
            width: size,
            height: size,
            left: capOffset,
            top: capOffset,
            transform: `rotate(${angle}deg)`,
          }}
        >
          <div
            data-pressed={drag.dragging || undefined}
            className={
              disabled
                ? "h-full w-full rounded-full border border-edge bg-surface-raised"
                : "material-raised motion-ui h-full w-full rounded-full"
            }
          >
            <span
              aria-hidden
              className="absolute left-1/2 top-[4px] h-[26%] w-[3px] -translate-x-1/2 rounded-full bg-accent"
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
