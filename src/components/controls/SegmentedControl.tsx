"use client";

/**
 * SegmentedControl: a mutually exclusive option list (waveform, filter mode,
 * editor tabs). Implements true radiogroup semantics with a roving tabindex:
 * only the selected (or first enabled) segment is tabbable; arrow keys move
 * the selection and focus, Home/End jump to the ends.
 *
 * The selected segment is not color-only: it is recessed (material-sunken),
 * bold, and uses the accent color.
 */
import { useCallback, useRef } from "react";
import type { ReactNode } from "react";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /**
   * One line explaining what the option is for, surfaced as the native
   * tooltip. Segment labels are necessarily terse ("Synth", "Sample
   * Editor"); this is where somebody who has never used a synthesizer
   * finds out which one they want.
   */
  hint?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name of the radiogroup. */
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string = string>(
  props: SegmentedControlProps<T>,
) {
  const { options, value, onChange, label, size = "md", disabled = false, className } = props;

  const refs = useRef(new Map<T, HTMLButtonElement>());

  const selectedIdx = options.findIndex((o) => o.value === value);
  const firstEnabled = options.findIndex((o) => !o.disabled);
  const selectedIsEnabled = selectedIdx >= 0 && !options[selectedIdx].disabled;
  const tabbableIdx = selectedIsEnabled ? selectedIdx : firstEnabled;

  const focusByIndex = useCallback(
    (i: number) => {
      const opt = options[i];
      if (opt) refs.current.get(opt.value)?.focus();
    },
    [options],
  );

  const selectByIndex = useCallback(
    (i: number) => {
      const opt = options[i];
      if (!opt || opt.disabled || disabled) return;
      onChange(opt.value);
      focusByIndex(i);
    },
    [options, disabled, onChange, focusByIndex],
  );

  const move = useCallback(
    (from: number, dir: 1 | -1) => {
      let i = from;
      for (let k = 0; k < options.length; k++) {
        i = (i + dir + options.length) % options.length;
        if (!options[i].disabled) {
          selectByIndex(i);
          return;
        }
      }
    },
    [options, selectByIndex],
  );

  const lastEnabled = options.length - 1 - [...options].reverse().findIndex((o) => !o.disabled);

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(idx, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(idx, -1);
        break;
      case "Home":
        e.preventDefault();
        if (firstEnabled >= 0) selectByIndex(firstEnabled);
        break;
      case "End":
        e.preventDefault();
        if (lastEnabled >= 0 && lastEnabled < options.length) selectByIndex(lastEnabled);
        break;
      default:
        break;
    }
  };

  const padClass = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex items-center gap-1 ${className ?? ""}`}
    >
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        const isDisabled = disabled || !!opt.disabled;
        const classes = selected
          ? "material-sunken font-semibold text-accent"
          : isDisabled
            ? "border border-edge bg-surface text-ink-faint"
            : "material-raised text-ink-soft hover:text-ink";
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) refs.current.set(opt.value, el);
              else refs.current.delete(opt.value);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            title={opt.hint}
            tabIndex={idx === tabbableIdx && !isDisabled ? 0 : -1}
            onClick={() => selectByIndex(idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`motion-ui relative overflow-hidden ${padClass} rounded-[var(--radius-control)] ${classes} ${
              isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            }`}
          >
            {opt.label}
            {/* Accent rule under the selected segment. Recessed material and
                weight already carry the state; this adds the movement that
                makes a switch feel like a switch. */}
            <span
              aria-hidden
              className="motion-ui absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-accent"
              style={{
                opacity: selected ? 1 : 0,
                transform: selected ? "none" : "scaleX(0.3)",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
