"use client";

/**
 * React access to the audio engine singleton.
 *
 * The engine is created lazily and survives route changes; these hooks only
 * hand out the instance. Audio-rate work never goes through React state.
 */
import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/lib/audio";
import type { IAudioEngine } from "@/lib/audio/api";

export function useEngine(): IAudioEngine | null {
  const [engine, setEngine] = useState<IAudioEngine | null>(null);
  useEffect(() => {
    let alive = true;
    void getAudioEngine().then((e) => {
      if (alive) setEngine(e);
    });
    return () => {
      alive = false;
    };
  }, []);
  return engine;
}

/**
 * Stable callback that runs against the engine without re-rendering when the
 * engine resolves. Use for event handlers (knob drags, key presses).
 */
export function useEngineRef(): React.RefObject<IAudioEngine | null> {
  const ref = useRef<IAudioEngine | null>(null);
  useEffect(() => {
    let alive = true;
    void getAudioEngine().then((e) => {
      if (alive) ref.current = e;
    });
    return () => {
      alive = false;
    };
  }, []);
  return ref;
}

/** Run a callback on every animation frame while `active`, with cleanup. */
export function useAnimationFrame(active: boolean, callback: () => void): void {
  const cbRef = useRef(callback);
  // Synced in an effect: refs must not be written during render.
  useEffect(() => {
    cbRef.current = callback;
  });
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      cbRef.current();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!stopped) {
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);
}
