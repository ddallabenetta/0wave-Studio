"use client";

/**
 * Toggle: a two-state switch.
 *
 * A rectangular (not pill) track with a sliding square thumb. Uses native
 * button semantics (role="switch", aria-checked) so Space and Enter toggle it
 * for free. Pressing lowers the whole control 1px. An optional LED dot shows
 * semantic state (on / off / warning / error) alongside the label.
 */
import { forwardRef } from "react";

export type LedState = "on" | "off" | "warning" | "error";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  /** Optional semantic LED indicator shown beside the label. */
  led?: LedState;
  className?: string;
}

const LED_COLOR: Record<LedState, string> = {
  on: "bg-success",
  off: "bg-ink-faint",
  warning: "bg-warning",
  error: "bg-error",
};

/** Halo colour per state. `off` is deliberately absent: a dark LED is dark. */
const LED_GLOW: Record<LedState, string | null> = {
  on: "var(--success)",
  off: null,
  warning: "var(--warning)",
  error: "var(--error)",
};

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(props, ref) {
  const { checked, onChange, label, disabled = false, led, className } = props;

  const trackClass = disabled
    ? "relative h-5 w-9 shrink-0 cursor-not-allowed rounded-[var(--radius-control)] border border-edge bg-surface-raised"
    : "material-raised motion-ui relative h-5 w-9 shrink-0 cursor-pointer rounded-[var(--radius-control)]";

  return (
    <label
      className={`inline-flex select-none items-center gap-2 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${className ?? ""}`}
    >
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={trackClass}
      >
        {/* Sliding square thumb. Position moves with the checked state, and
            the travel is animated so the switch reads as one object moving
            rather than two states swapping. */}
        <span
          aria-hidden
          className="absolute left-[3px] top-1/2"
          style={{
            transform: `translate(${checked ? 16 : 0}px, -50%)`,
            transition: "transform var(--dur-2) var(--ease-spring)",
          }}
        >
          <span
            className={`motion-ui block h-3.5 w-3.5 rounded-[var(--radius-clip)] ${
              checked ? "bg-accent" : "bg-ink-faint"
            }`}
            style={{ boxShadow: checked ? "var(--halo)" : "none" }}
          />
        </span>
      </button>

      <span className="flex items-center gap-1.5">
        {led && (
          <span
            aria-hidden
            className={`motion-ui size-2 rounded-full ${LED_COLOR[led]}`}
            style={{
              // A lit LED glows in its own colour; an unlit one is inert.
              boxShadow: LED_GLOW[led]
                ? `0 0 7px -1px ${LED_GLOW[led]}, 0 0 2px 0 ${LED_GLOW[led]}`
                : "none",
            }}
          />
        )}
        <span className="text-sm text-ink">{label}</span>
      </span>
    </label>
  );
});
