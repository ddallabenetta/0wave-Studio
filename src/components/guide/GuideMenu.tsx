"use client";

/**
 * Guide menu in the top bar: the single place where the beginner scaffolding
 * can be turned on, replayed, or switched off for good.
 *
 * Keyboard and focus behaviour mirrors ThemeMenu (arrow keys move within the
 * menu, Escape and Tab close it, focus returns to the trigger) so the two
 * menus in the same bar do not behave differently.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowCounterClockwise, CaretDown, Check, Lifebuoy, Path } from "@phosphor-icons/react";
import { useGuideStore } from "@/lib/state/guide-store";
import { strings } from "@/i18n";

export function GuideMenu() {
  const explain = useGuideStore((s) => s.explain);
  const setExplain = useGuideStore((s) => s.setExplain);
  const startTour = useGuideStore((s) => s.startTour);
  const replayWelcome = useGuideStore((s) => s.replayWelcome);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (dir: 1 | -1) => {
    const items = rootRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']");
    if (!items || items.length === 0) return;
    const current = [...items].findIndex((el) => el === document.activeElement);
    const next = (current + dir + items.length) % items.length;
    items[next].focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
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

  const itemClass =
    "motion-ui flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-surface hover:text-ink";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`material-raised motion-ui flex items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1 text-xs ${
          explain ? "text-accent-ink" : "text-ink-soft"
        }`}
      >
        <Lifebuoy size={14} aria-hidden />
        <span>{strings.guide.menu}</span>
        <CaretDown
          size={12}
          aria-hidden
          className={`motion-ui text-ink-faint ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={strings.guide.menu}
          onKeyDown={onMenuKeyDown}
          className="material-glass anim-rise-sm absolute right-0 top-full z-50 mt-1 w-60 rounded-[var(--radius-panel)] p-1"
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={explain}
            onClick={() => setExplain(!explain)}
            className={itemClass}
          >
            <Lifebuoy size={14} aria-hidden />
            <span className="flex-1">
              {explain ? strings.guide.explain.on : strings.guide.explain.off}
            </span>
            {explain && <Check size={14} weight="bold" aria-hidden className="text-accent" />}
          </button>

          <p className="px-2 pb-1.5 pt-0.5 text-[10px] leading-snug text-ink-faint">
            {strings.guide.explain.tooltip}
          </p>

          <div aria-hidden className="my-1 h-px bg-edge" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              startTour();
            }}
            className={itemClass}
          >
            <Path size={14} aria-hidden />
            <span className="flex-1">{strings.guide.tour.start}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              replayWelcome();
            }}
            className={itemClass}
          >
            <ArrowCounterClockwise size={14} aria-hidden />
            <span className="flex-1">{strings.guide.replayWelcome}</span>
          </button>
        </div>
      )}
    </div>
  );
}
