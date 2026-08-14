"use client";

/**
 * The plain-language layer.
 *
 * Music software is full of words that mean nothing outside music software.
 * Rather than renaming everything (which would strand anyone who already
 * knows the vocabulary), every piece of jargon in the UI can carry a
 * `HelpTip`: the real term stays, and a one-sentence explanation is one
 * hover, tap or focus away.
 *
 * Three pieces live here:
 *  - `HelpTip`      the "?" affordance and its popover;
 *  - `PlainLabel`   a label that pairs the term with its tip;
 *  - `ExplainNote`  an inline sentence shown only while hints are on.
 *
 * Accessibility: the trigger is a real button with `aria-expanded`, the
 * popover is linked through `aria-describedby` so screen readers get the
 * explanation without opening anything, Escape closes, and a pointer
 * leaving the group closes it too. Nothing here is hover-only.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Question } from "@phosphor-icons/react";
import { useGuideStore } from "@/lib/state/guide-store";
import { strings } from "@/i18n";

export type TermId = keyof typeof strings.glossary;

/** Side the popover opens on when there is room. */
type Placement = "top" | "bottom";

export function HelpTip({
  term,
  placement = "top",
  className = "",
}: {
  term: TermId;
  placement?: Placement;
  className?: string;
}) {
  const entry = strings.glossary[term];
  const explain = useGuideStore((s) => s.explain);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex items-center ${className}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${strings.guide.whatIsThis} ${entry.term}`}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`motion-ui flex size-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] ${
          open
            ? "border-accent bg-accent text-accent-on"
            : explain
              ? "border-accent/45 bg-accent-wash text-accent-ink hover:border-accent"
              : "border-edge-strong text-ink-faint hover:border-accent hover:text-accent-ink"
        }`}
      >
        <Question size={9} weight="bold" aria-hidden />
      </button>

      {/* Always in the accessibility tree, only painted when open: screen
          readers get the explanation via aria-describedby regardless. */}
      <span
        id={id}
        role="tooltip"
        className={`material-glass anim-rise-sm pointer-events-none absolute left-1/2 z-50 w-60 -translate-x-1/2 rounded-[var(--radius-control)] px-3 py-2 text-left ${
          placement === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
        } ${open ? "" : "hidden"}`}
      >
        <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-wider text-accent-ink">
          {entry.term}
        </span>
        <span className="block text-[11px] leading-relaxed text-ink-soft">{entry.plain}</span>
      </span>
    </span>
  );
}

/**
 * A section or control label with its explanation attached. The term keeps
 * its real name; the dotted underline is the signal that there is more to
 * read, and it only appears while hints are on.
 */
export function PlainLabel({
  term,
  children,
  className = "",
  placement = "top",
}: {
  term: TermId;
  children?: React.ReactNode;
  className?: string;
  placement?: Placement;
}) {
  const explain = useGuideStore((s) => s.explain);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={explain ? "decoration-dotted underline-offset-4 [text-decoration-line:underline]" : ""}>
        {children ?? strings.glossary[term].term}
      </span>
      <HelpTip term={term} placement={placement} />
    </span>
  );
}

/**
 * A full sentence of guidance that exists only for people who need it.
 * Hidden entirely when hints are off, so the interface an experienced user
 * sees is exactly the one they had before.
 */
export function ExplainNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const explain = useGuideStore((s) => s.explain);
  const hydrated = useGuideStore((s) => s.hydrated);
  if (!hydrated || !explain) return null;
  return (
    <p
      className={`anim-rise-sm flex items-start gap-2 rounded-[var(--radius-control)] border border-accent/20 bg-accent-wash/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-soft ${className}`}
    >
      <span aria-hidden className="mt-[3px] size-1.5 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </p>
  );
}
