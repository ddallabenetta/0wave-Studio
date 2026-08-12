"use client";

/**
 * Top bar: wordmark, the two creative destinations (Studio / Playground),
 * audio status, save state, project actions. No third creative section.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { exportProject, importProject } from "@/lib/persistence/transfer";
import { useProjectStore } from "@/lib/state/project-store";
import { AudioStatusPill } from "./AudioStatusPill";
import { strings } from "@/i18n";

const NAV = [
  { href: "/studio", label: strings.nav.studio },
  { href: "/playground", label: strings.nav.playground },
] as const;

const SAVE_LABEL: Record<string, string | null> = {
  idle: null,
  saving: strings.project.saving,
  saved: strings.project.saved,
  error: strings.project.saveError,
  "quota-error": strings.project.quotaError,
};

export function TopBar() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const pathname = usePathname();
  const saveState = useProjectStore((s) => s.saveState);
  const projectName = useProjectStore((s) => s.project.name);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const newProject = useProjectStore((s) => s.newProject);
  const dirty = useProjectStore((s) => s.dirty);

  return (
    <header className="flex h-12 items-center gap-4 border-b border-edge bg-surface px-4">
      <Link href="/studio" className="text-sm font-semibold tracking-tight text-ink">
        {/* Mono for the wordmark: its slashed zero keeps "0wave" from being
            misread as "Owave". */}
        <span className="font-mono text-accent-ink">0wave</span> Studio
      </Link>

      <nav aria-label="Main" className="flex items-center gap-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`motion-ui rounded-[var(--radius-control)] px-3 py-1.5 text-sm ${
                active
                  ? "material-sunken font-medium text-ink"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-2 h-5 w-px bg-edge" aria-hidden />

      <input
        aria-label={strings.common.name}
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="w-44 rounded-[var(--radius-control)] border border-transparent bg-transparent px-2 py-1 text-sm text-ink-soft hover:border-edge focus:border-edge focus:bg-surface-raised focus:outline-none"
      />

      <div className="ml-auto flex items-center gap-3">
        {SAVE_LABEL[saveState] && (
          <span
            role="status"
            className={`font-mono text-xs ${
              saveState === "error" || saveState === "quota-error" ? "text-error" : "text-ink-faint"
            }`}
          >
            {SAVE_LABEL[saveState]}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            if (!dirty || window.confirm(strings.project.unsavedConfirm)) newProject();
          }}
          className="material-raised motion-ui rounded-[var(--radius-control)] px-2.5 py-1 text-xs text-ink-soft"
        >
          {strings.project.new}
        </button>
        <button
          type="button"
          onClick={() => void exportProject(useProjectStore.getState().project)}
          className="material-raised motion-ui rounded-[var(--radius-control)] px-2.5 py-1 text-xs text-ink-soft"
        >
          {strings.project.export}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="material-raised motion-ui rounded-[var(--radius-control)] px-2.5 py-1 text-xs text-ink-soft"
        >
          {strings.project.import}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={strings.project.import}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (dirty && !window.confirm(strings.project.unsavedConfirm)) return;
            try {
              const imported = await importProject(file);
              useProjectStore.getState().loadProject(imported);
              setImportError(null);
            } catch (cause) {
              setImportError(cause instanceof Error ? cause.message : strings.project.loadFailed);
            }
          }}
        />
        {importError && (
          <span role="alert" className="max-w-48 truncate font-mono text-xs text-error" title={importError}>
            {importError}
          </span>
        )}
        <AudioStatusPill />
      </div>
    </header>
  );
}
