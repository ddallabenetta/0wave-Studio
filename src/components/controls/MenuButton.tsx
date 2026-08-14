"use client";

/**
 * MenuButton: a button that opens a short list of actions.
 *
 * Used where a row or a panel has more actions than it has room for — the
 * sound library's per-sound actions, the library's "add" button — so the
 * surface stays quiet until the user asks for it.
 *
 * The popup is positioned `fixed`, from the trigger's measured rect: menus
 * open inside scrolling lists, and an absolutely positioned one would be
 * clipped by the list's own `overflow`. It flips above the trigger when
 * there is no room below, and closes on outside click, Escape, Tab, scroll
 * and resize (the measured position would otherwise go stale).
 */
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import type { ButtonVariant } from "./Button";

export interface MenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Destructive action: rendered in the error colour. */
  danger?: boolean;
  /** Native tooltip, e.g. why an action is disabled. */
  title?: string;
}

export interface MenuButtonProps {
  /** Accessible name of the trigger; also its tooltip. */
  label: string;
  /** Accessible name of the popup itself. Defaults to the trigger's. */
  menuLabel?: string;
  icon: ReactNode;
  actions: ReadonlyArray<MenuAction>;
  /** Visible trigger text. Omitted for an icon-only trigger. */
  children?: ReactNode;
  /** Which trigger edge the menu lines up with. */
  align?: "start" | "end";
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
}

const MENU_WIDTH = 188;
const ITEM_HEIGHT = 30;
const MENU_PADDING = 8;
const GAP = 4;
const EDGE = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

export function MenuButton({
  label,
  menuLabel,
  icon,
  actions,
  children,
  align = "end",
  variant = "ghost",
  size = "sm",
  className,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  /* Measured when the menu opens, from the event that opened it: reading
     the rect in an effect would only re-render for the same answer. */
  const openMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const height = actions.length * ITEM_HEIGHT + MENU_PADDING;
    const below = rect.bottom + GAP;
    const top =
      below + height <= window.innerHeight - EDGE ? below : rect.top - height - GAP;
    const left = align === "end" ? rect.right - MENU_WIDTH : rect.left;
    setPosition({
      top: clamp(top, EDGE, window.innerHeight - height - EDGE),
      left: clamp(left, EDGE, window.innerWidth - MENU_WIDTH - EDGE),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    // Capture: the menu's own scroll containers do not bubble their events.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const select = (action: MenuAction) => {
    dismiss();
    action.onSelect();
  };

  const moveFocus = (dir: 1 | -1) => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])');
    if (!items || items.length === 0) return;
    const current = [...items].findIndex((el) => el === document.activeElement);
    items[(current + dir + items.length) % items.length].focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        dismiss();
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const triggerProps = {
    ref: triggerRef,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => (open ? setOpen(false) : openMenu()),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openMenu();
      }
    },
    variant,
    size,
    className,
  };

  return (
    <>
      {children ? (
        <Button {...triggerProps} aria-label={label} icon={icon}>
          {children}
        </Button>
      ) : (
        <IconButton {...triggerProps} aria-label={label} icon={icon} />
      )}

      {open && position && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel ?? label}
          onKeyDown={onMenuKeyDown}
          style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          className="material-raised fixed z-50 rounded-[var(--radius-panel)] p-1"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              title={action.title}
              onClick={() => select(action)}
              className={`motion-ui flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-xs ${
                action.disabled
                  ? "cursor-not-allowed text-ink-faint opacity-60"
                  : action.danger
                    ? "text-error hover:bg-surface"
                    : "text-ink-soft hover:bg-surface hover:text-ink"
              }`}
            >
              {action.icon}
              <span className="flex-1 truncate">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
