"use client";

/**
 * Top bar: wordmark, the two creative destinations (Studio / Playground),
 * project identity, guidance, audio status. No third creative section.
 *
 * The two destinations carry a one-line description of what each is for,
 * because "Studio" and "Playground" mean nothing to somebody opening the
 * app for the first time. Project file actions are grouped behind their
 * own hairline so they read as chrome rather than as creative tools.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DownloadSimple, FilePlus, UploadSimple } from "@phosphor-icons/react";
import { exportProject, importProject } from "@/lib/persistence/transfer";
import { useProjectStore } from "@/lib/state/project-store";
import { GuideMenu } from "@/components/guide/GuideMenu";
import { AudioStatusPill } from "./AudioStatusPill";
import { ThemeMenu } from "./ThemeMenu";
import { strings } from "@/i18n";

const NAV = [
  { href: "/studio", label: strings.nav.studio, hint: strings.nav.studioHint, tour: undefined },
  {
    href: "/playground",
    label: strings.nav.playground,
    hint: strings.nav.playgroundHint,
    tour: "arrange",
  },
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

  const fileActionClass =
    "material-raised motion-ui flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-xs text-ink-soft hover:text-ink";

  return (
    <header className="relative z-40 flex h-14 items-center gap-4 border-b border-edge bg-surface px-4">
      {/* Hairline of accent light along the bottom edge: the one place the
          product signs itself without shouting. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 45%, transparent) 22%, transparent 60%)",
        }}
      />

      <Link
        href="/studio"
        className="motion-ui group flex items-center text-sm font-semibold tracking-tight text-ink"
      >
        {/* Mono for the wordmark: its slashed zero keeps "0wave" from being
            misread as "Owave". */}
        <span className="font-mono text-accent-ink">0wave</span>
        <span className="ml-1">Studio</span>
      </Link>

      <nav aria-label="Main" className="flex items-center gap-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={item.tour}
              aria-current={active ? "page" : undefined}
              title={item.hint}
              className={`motion-ui relative flex flex-col rounded-[var(--radius-control)] px-3 py-1 ${
                active ? "bg-surface-raised text-ink" : "text-ink-soft hover:bg-surface-raised/60 hover:text-ink"
              }`}
            >
              <span className={`text-sm leading-tight ${active ? "font-medium" : ""}`}>
                {item.label}
              </span>
              <span className="text-[10px] leading-tight text-ink-faint">{item.hint}</span>
              {/* Underline marker: present for the active destination only,
                  and animated in so switching sections has a direction. */}
              <span
                aria-hidden
                className="motion-ui absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent"
                style={{ opacity: active ? 1 : 0, transform: active ? "none" : "scaleX(0.4)" }}
              />
            </Link>
          );
        })}
      </nav>

      <div className="mx-1 h-6 w-px bg-edge" aria-hidden />

      <input
        aria-label={strings.common.name}
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="motion-ui w-44 rounded-[var(--radius-control)] border border-transparent bg-transparent px-2 py-1 text-sm text-ink-soft hover:border-edge focus:border-edge focus:bg-surface-raised focus:text-ink focus:outline-none"
      />

      {/* Save state: a dot plus a word, so it is legible at a glance and
          does not shift the layout as it changes. */}
      {SAVE_LABEL[saveState] && (
        <span
          role="status"
          className={`anim-fade flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${
            saveState === "error" || saveState === "quota-error" ? "text-error" : "text-ink-faint"
          }`}
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${
              saveState === "saving"
                ? "bg-warning anim-breathe"
                : saveState === "saved"
                  ? "bg-success"
                  : "bg-error"
            }`}
          />
          {SAVE_LABEL[saveState]}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (!dirty || window.confirm(strings.project.unsavedConfirm)) newProject();
            }}
            className={fileActionClass}
          >
            <FilePlus size={13} aria-hidden />
            {strings.project.new}
          </button>
          <button
            type="button"
            onClick={() => void exportProject(useProjectStore.getState().project)}
            className={fileActionClass}
          >
            <DownloadSimple size={13} aria-hidden />
            {strings.project.export}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={fileActionClass}
          >
            <UploadSimple size={13} aria-hidden />
            {strings.project.import}
          </button>
        </div>

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

        <div className="mx-1 h-6 w-px bg-edge" aria-hidden />

        <GuideMenu />
        <ThemeMenu />
        <AudioStatusPill />
      </div>
    </header>
  );
}
