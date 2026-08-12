"use client";

/** Shared Studio/Playground panel chrome. */
import type { ReactNode } from "react";

export function Panel({
  title,
  actions,
  children,
  className = "",
  contentClassName = "",
}: {
  title?: string;
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
        <header className="flex h-8 shrink-0 items-center justify-between border-b border-edge px-3">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">{title}</h2>
          {actions}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${contentClassName}`}>{children}</div>
    </section>
  );
}

/** Row of controls inside a panel. */
export function ControlRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-start gap-x-4 gap-y-3 ${className}`}>{children}</div>;
}
