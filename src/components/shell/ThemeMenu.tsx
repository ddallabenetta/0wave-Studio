"use client";

/**
 * ThemeMenu: a single button that opens the Light / Dark / System menu.
 *
 * The trigger shows the active scheme's icon and label and toggles a menu
 * of menuitemradio options (current selection marked). The menu closes on
 * outside click, Escape, or Tab; when it opens, focus moves to the selected
 * item, and when it closes, focus returns to the trigger.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { CaretDown, Check, Monitor, Moon, Sun } from "@phosphor-icons/react";
import { useThemeStore } from "@/lib/state/theme-store";
import type { ThemePreference } from "@/lib/state/theme-store";
import { strings } from "@/i18n";

const OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: strings.theme.light, Icon: Sun },
  { value: "dark", label: strings.theme.dark, Icon: Moon },
  { value: "system", label: strings.theme.system, Icon: Monitor },
];

export function ThemeMenu() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  const active = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const { Icon: ActiveIcon } = active;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selected = rootRef.current?.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]',
    );
    selected?.focus();
  }, [open]);

  const select = (value: ThemePreference) => {
    setTheme(value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (dir: 1 | -1) => {
    const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    if (!items || items.length === 0) return;
    const current = [...items].findIndex((el) => el === document.activeElement);
    const next = (current + dir + items.length) % items.length;
    items[next].focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "Home":
        event.preventDefault();
        rootRef.current
          ?.querySelector<HTMLElement>('[role="menuitemradio"]')
          ?.focus();
        break;
      case "End": {
        event.preventDefault();
        const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
        items?.item(items.length - 1)?.focus();
        break;
      }
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className="material-raised motion-ui flex items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1 text-xs text-ink-soft"
      >
        <ActiveIcon size={14} aria-hidden />
        <span>{active.label}</span>
        <CaretDown
          size={12}
          aria-hidden
          className={`text-ink-faint transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={strings.theme.label}
          onKeyDown={onMenuKeyDown}
          className="material-raised absolute right-0 top-full z-50 mt-1 w-40 rounded-[var(--radius-panel)] p-1"
        >
          {OPTIONS.map(({ value, label, Icon }) => {
            const selected = value === theme;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => select(value)}
                className={`motion-ui flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-xs ${
                  selected ? "font-medium text-accent" : "text-ink-soft hover:bg-surface hover:text-ink"
                }`}
              >
                <Icon size={14} aria-hidden />
                <span className="flex-1">{label}</span>
                {selected && <Check size={14} weight="bold" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
