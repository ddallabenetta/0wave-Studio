"use client";

/**
 * Numeric drag utilities shared by Knob and Fader.
 *
 * A drag session captures the geometry of one pointer gesture and converts
 * pixel deltas into value deltas. Both controls reuse the same pointer-capture
 * math so the feel is identical and predictable.
 *
 * Gestures:
 * - vertical: dragging up increases the value.
 * - horizontal: dragging right increases the value.
 * - Alt is reserved for "reset to default" and is handled by the caller.
 *
 * The wheel is intentionally NOT handled. Knobs and faders here never change
 * on wheel input, so we never hijack it or call preventDefault on it.
 * Scrolling is not hijacked either: callers set touch-action none, and we do
 * not preventDefault on pointerdown, so the control can still receive focus.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/music/theory";

/** Full pixel range covered by one full-range drag gesture. */
export const DRAG_PIXELS = 150;

export interface DragOptions {
  value: number;
  min: number;
  max: number;
  /** When true the value is mapped through a log curve. */
  logarithmic?: boolean;
  /** Step for quantization; 0 disables snapping. */
  step?: number;
  /** Drag axis. Vertical for knobs and vertical faders. */
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
  /** Called with the new (already snapped) value during the drag. */
  onValue: (next: number) => void;
}

/** Convert a normalized 0..1 position into a value in [min, max]. */
export function normalizedToValue(
  t: number,
  min: number,
  max: number,
  logarithmic: boolean,
): number {
  const c = clamp(t, 0, 1);
  if (logarithmic && min > 0) return min * Math.pow(max / min, c);
  return min + (max - min) * c;
}

/** Convert a value in [min, max] into a normalized 0..1 position. */
export function valueToNormalized(
  value: number,
  min: number,
  max: number,
  logarithmic: boolean,
): number {
  if (max === min) return 0;
  const v = clamp(value, min, max);
  if (logarithmic && min > 0) return clamp(Math.log(v / min) / Math.log(max / min), 0, 1);
  return (v - min) / (max - min);
}

/** Snap a value to the nearest step within [min, max]. */
export function snapValue(value: number, min: number, max: number, step: number): number {
  if (step <= 0) return clamp(value, min, max);
  return clamp(min + Math.round((value - min) / step) * step, min, max);
}

interface Session {
  startY: number;
  startX: number;
  startT: number;
}

export interface DragSession {
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

/**
 * Hook returning pointer handlers plus a `dragging` flag for a drag-driven
 * value control. Spread the handlers onto the interactive element. Pointer
 * capture keeps the drag alive even when the pointer leaves the element.
 */
export function useDragSession(options: DragOptions): DragSession {
  const {
    value,
    min,
    max,
    logarithmic = false,
    step = 0,
    orientation = "vertical",
    disabled = false,
    onValue,
  } = options;

  const session = useRef<Session | null>(null);
  const [dragging, setDragging] = useState(false);

  // Keep the latest config in a ref so the handlers never go stale.
  // Written in an effect, never during render.
  const config = useRef({ value, min, max, logarithmic, step, orientation, disabled });
  useEffect(() => {
    config.current = { value, min, max, logarithmic, step, orientation, disabled };
  });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const c = config.current;
    if (c.disabled || e.button !== 0) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* No active pointer to capture; the drag still tracks via pointermove. */
    }
    session.current = {
      startY: e.clientY,
      startX: e.clientX,
      startT: valueToNormalized(c.value, c.min, c.max, c.logarithmic),
    };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = session.current;
      const c = config.current;
      if (!s || c.disabled) return;

      const pixels =
        c.orientation === "vertical" ? s.startY - e.clientY : e.clientX - s.startX;

      const rawT = s.startT + pixels / DRAG_PIXELS;
      const raw = normalizedToValue(rawT, c.min, c.max, c.logarithmic);
      onValue(snapValue(raw, c.min, c.max, c.step));
    },
    [onValue],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    session.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may already be released in some browsers.
    }
  }, []);

  return { dragging, onPointerDown, onPointerMove, onPointerUp };
}

export interface KeyboardOptions {
  value: number;
  min: number;
  max: number;
  /** Step increment; defaults to (max-min)/100. */
  step?: number;
  disabled?: boolean;
  onValue: (next: number) => void;
}

/**
 * Hook implementing the shared keyboard contract for value controls:
 * Arrow Up/Right +step, Arrow Down/Left -step, PageUp/PageDown +10/-10 step,
 * Home min, End max. Returns a single onKeyDown handler.
 */
export function useValueKeyboard(options: KeyboardOptions) {
  const { value, min, max, step, disabled = false, onValue } = options;
  const base = step && step > 0 ? step : (max - min) / 100;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      let next: number | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "ArrowRight":
          next = value + base;
          break;
        case "ArrowDown":
        case "ArrowLeft":
          next = value - base;
          break;
        case "PageUp":
          next = value + base * 10;
          break;
        case "PageDown":
          next = value - base * 10;
          break;
        case "Home":
          next = min;
          break;
        case "End":
          next = max;
          break;
        default:
          return;
      }
      e.preventDefault();
      onValue(snapValue(next, min, max, step && step > 0 ? step : 0));
    },
    [value, min, max, base, step, disabled, onValue],
  );

  return onKeyDown;
}
