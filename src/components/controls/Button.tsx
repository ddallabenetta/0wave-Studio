"use client";

/**
 * Button: the standard push button.
 *
 * Variants: primary (accent fill), default (raised tactile), danger
 * (record/error fill), ghost (transparent). Every variant gives clear hover,
 * pressed and focus states and a real 1px pressed translation. Supports an
 * optional leading icon, two sizes, and a loading state that swaps the icon
 * for a spinner and blocks interaction.
 */
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "default" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Optional leading icon. Hidden while loading. */
  icon?: ReactNode;
}

export function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function variantClass(variant: ButtonVariant, interactive: boolean): string {
  switch (variant) {
    case "primary":
      return `bg-accent text-accent-on ${
        interactive
          ? "shadow-[var(--shadow-ambient)] hover:bg-accent-hover active:translate-y-px active:bg-accent-pressed active:shadow-none"
          : "shadow-none"
      }`;
    case "default":
      return interactive
        ? "material-raised motion-ui text-ink hover:border-edge-strong"
        : "border border-edge bg-surface-raised text-ink";
    case "danger":
      return `bg-record text-accent-on ${
        interactive
          ? "shadow-[var(--shadow-ambient)] hover:brightness-95 active:translate-y-px active:brightness-90 active:shadow-none"
          : "shadow-none"
      }`;
    case "ghost":
      return `bg-transparent text-ink-soft ${
        interactive ? "hover:bg-surface hover:text-ink active:translate-y-px" : ""
      }`;
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const {
    variant = "default",
    size = "md",
    loading = false,
    icon,
    disabled,
    type = "button",
    className,
    children,
    ...rest
  } = props;

  const isDisabled = disabled || loading;
  const sizeClass = size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm";
  const stateClass = isDisabled ? "cursor-not-allowed opacity-50" : "";

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex select-none items-center justify-center gap-1.5 rounded-[var(--radius-control)] font-medium ${sizeClass} ${variantClass(
        variant,
        !isDisabled,
      )} ${stateClass} ${className ?? ""}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});
