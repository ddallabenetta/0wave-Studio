"use client";

/**
 * Start Audio gate. Shown once until the AudioContext is running.
 *
 * This is the first thing anybody sees, and browsers make it unavoidable:
 * no gesture, no sound. So it is treated as the product's title screen
 * rather than as an obstacle — it explains why the click is needed, says
 * plainly that nothing is being recorded (the most common worry when a
 * website asks to make noise), and never looks like an error.
 *
 * Keyboard-activatable, focused on mount, and never shown again on route
 * changes: the engine is a singleton that survives navigation.
 */
import { useState } from "react";
import { Play } from "@phosphor-icons/react";
import { getAudioEngine } from "@/lib/audio";
import { useUiStore } from "@/lib/state/ui-store";
import { AmbientField } from "@/components/guide/AmbientField";
import { WaveMark } from "@/components/guide/WaveMark";
import { strings } from "@/i18n";

export function StartAudioGate() {
  const status = useUiStore((s) => s.audioStatus);
  const setAudioStatus = useUiStore((s) => s.setAudioStatus);
  const [starting, setStarting] = useState(false);

  if (status === "running" || status === "suspended") return null;

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      if (typeof window === "undefined" || !("AudioContext" in window || "webkitAudioContext" in window)) {
        setAudioStatus("unsupported");
        return;
      }
      const engine = await getAudioEngine();
      await engine.initialize();
      setAudioStatus(engine.status);
    } catch (cause) {
      console.error("0wave Studio: audio engine failed to start", cause);
      setAudioStatus("error");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-audio-title"
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-base/90 backdrop-blur-md"
    >
      <AmbientField />

      <div className="material-glass anim-pop relative w-[440px] overflow-hidden rounded-[var(--radius-panel)] p-9 text-center">
        <WaveMark className="mx-auto mb-6 h-12 w-[260px]" />

        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-faint">
          {strings.audio.startEyebrow}
        </p>

        <h1
          id="start-audio-title"
          className="anim-rise mt-2 text-xl font-semibold tracking-tight text-ink"
          style={{ animationDelay: "80ms" }}
        >
          {strings.audio.startTitle}
        </h1>

        <p
          className="anim-rise mt-2.5 text-sm leading-relaxed text-ink-soft"
          style={{ animationDelay: "140ms" }}
        >
          {strings.audio.startBody}
        </p>

        {status === "unsupported" ? (
          <p role="alert" className="mt-5 text-sm text-error">
            {strings.audio.unsupported}
          </p>
        ) : (
          <>
            {/* A failed attempt is recoverable: the button stays, so the
                user can retry rather than reload. */}
            {status === "error" && (
              <p role="alert" className="mt-5 text-sm text-error">
                {strings.audio.statusError}
              </p>
            )}

            <button
              type="button"
              onClick={start}
              disabled={starting}
              autoFocus
              className="sheen motion-ui anim-rise mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-3 text-sm font-semibold text-accent-on shadow-[var(--shadow-ambient)] hover:bg-accent-hover active:translate-y-px active:bg-accent-pressed disabled:opacity-60"
              style={{ animationDelay: "200ms" }}
            >
              {/* The icon keeps its own pulse while idle so the primary
                  action reads as the live thing on an otherwise still screen. */}
              <Play
                size={15}
                weight="fill"
                aria-hidden
                className={starting ? "" : "anim-breathe"}
              />
              {starting ? strings.common.loading : strings.audio.startButton}
            </button>

            <p
              className="anim-rise mt-3 text-[11px] text-ink-faint"
              style={{ animationDelay: "260ms" }}
            >
              {strings.audio.startReassurance}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
