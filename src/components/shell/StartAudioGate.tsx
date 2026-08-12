"use client";

/**
 * Start Audio gate. Shown once until the AudioContext is running.
 * Explains why the gesture is needed, is keyboard-activatable, never looks
 * like an error, and never reappears on route changes (the engine is a
 * singleton that survives navigation).
 */
import { useState } from "react";
import { SpeakerHigh } from "@phosphor-icons/react";
import { getAudioEngine } from "@/lib/audio";
import { useUiStore } from "@/lib/state/ui-store";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/85 backdrop-blur-[2px]"
    >
      <div className="material-raised w-[400px] rounded-[var(--radius-panel)] p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent-wash text-accent">
          <SpeakerHigh size={26} weight="bold" aria-hidden />
        </div>
        <h1 id="start-audio-title" className="text-lg font-semibold text-ink">
          {strings.audio.startTitle}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{strings.audio.startBody}</p>

        {status === "unsupported" ? (
          <p role="alert" className="mt-4 text-sm text-error">
            {strings.audio.unsupported}
          </p>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={starting}
            autoFocus
            className="material-raised motion-ui mt-6 w-full rounded-[var(--radius-control)] bg-accent px-4 py-2.5 text-sm font-medium text-accent-on hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-60"
          >
            {starting ? strings.common.loading : strings.audio.startButton}
          </button>
        )}
      </div>
    </div>
  );
}
