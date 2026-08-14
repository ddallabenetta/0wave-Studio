"use client";

/** Shared Studio/Playground panel chrome. */
import type { ReactNode } from "react";
import { ExplainNote, HelpTip } from "@/components/guide/HelpTip";
import type { TermId } from "@/components/guide/HelpTip";

export function Panel({
  title,
  term,
  hint,
  actions,
  children,
  className = "",
  contentClassName = "",
}: {
  title?: string;
  /**
   * Glossary entry for the panel's subject. Adds a "?" beside the title
   * that explains, in one sentence, what this section of the instrument
   * actually does.
   */
  term?: TermId;
  /** Longer guidance, shown inside the panel only while hints are on. */
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={`material-raised flex min-h-0 flex-col rounded-[var(--radius-panel)] ${className}`}
    >
      {title && (
        <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-edge px-3">
          <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
            {title}
            {term && <HelpTip term={term} placement="bottom" />}
          </h2>
          {actions}
        </header>
      )}
      {hint && <ExplainNote className="mx-3 mt-3">{hint}</ExplainNote>}
      <div className={`min-h-0 flex-1 ${contentClassName}`}>{children}</div>
    </section>
  );
}

/** Row of controls inside a panel. */
export function ControlRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-start gap-x-4 gap-y-3 ${className}`}>{children}</div>;
}
