"use client";

/**
 * Global audio status indicator: uninitialized / running / suspended /
 * error / unsupported, plus master clipping. Clicking a suspended engine
 * resumes it.
 */
import { useUiStore } from "@/lib/state/ui-store";
import { getAudioEngine } from "@/lib/audio";
import { strings } from "@/i18n";

const STATUS_LABEL: Record<string, string> = {
  uninitialized: strings.audio.statusUninitialized,
  running: strings.audio.statusRunning,
  suspended: strings.audio.statusSuspended,
  error: strings.audio.statusError,
  unsupported: strings.audio.statusUnsupported,
};

const STATUS_DOT: Record<string, string> = {
  uninitialized: "bg-ink-faint",
  running: "bg-success",
  suspended: "bg-warning",
  error: "bg-error",
  unsupported: "bg-error",
};

export function AudioStatusPill() {
  const status = useUiStore((s) => s.audioStatus);
  const clipping = useUiStore((s) => s.masterClipping);

  return (
    <button
      type="button"
      disabled={status !== "suspended"}
      onClick={() => void getAudioEngine().then((e) => e.resume())}
      aria-label={`${STATUS_LABEL[status]}${status === "suspended" ? ` - ${strings.audio.resume}` : ""}`}
      className="material-raised motion-ui flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1 text-xs text-ink-soft disabled:cursor-default"
    >
      <span aria-hidden className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
      <span className="font-mono">{STATUS_LABEL[status]}</span>
      {clipping && status === "running" && (
        <span className="font-mono text-error">{strings.audio.clipping}</span>
      )}
    </button>
  );
}
