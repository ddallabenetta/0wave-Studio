"use client";

/**
 * IconButton: a square, icon-only button.
 *
 * `aria-label` is required (an icon alone is not an accessible name) and is
 * also used as the native `title` tooltip unless one is provided. Reuses the
 * Button variant styling so hover, pressed and focus states match.
 */
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ButtonVariant } from "./Button";
import { Spinner, variantClass } from "./Button";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  /** Required accessible name; also the default tooltip. */
  "aria-label": string;
  /** Native tooltip. Defaults to the accessible name. */
  title?: string;
  /** Phosphor icon element. Hidden while loading. */
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  props,
  ref,
) {
  const {
    "aria-label": label,
    title,
    icon,
    variant = "default",
    size = "md",
    loading = false,
    disabled,
    type = "button",
    className,
    ...rest
  } = props;

  const isDisabled = disabled || loading;
  const sizeClass = size === "sm" ? "size-7" : "size-8";
  const stateClass = isDisabled ? "cursor-not-allowed opacity-50" : "";

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-label={label}
      title={title ?? label}
      aria-busy={loading || undefined}
      className={`inline-flex select-none items-center justify-center rounded-[var(--radius-control)] ${sizeClass} ${variantClass(
        variant,
        !isDisabled,
      )} ${stateClass} ${className ?? ""}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
    </button>
  );
});
