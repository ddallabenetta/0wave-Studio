/**
 * Browser-only audio engine accessor.
 *
 * The engine module is loaded dynamically so no Web Audio code runs during
 * SSR. All callers must be client components or event handlers.
 */
import type { EngineEvents, IAudioEngine } from "./api";

let enginePromise: Promise<IAudioEngine> | null = null;

export function getAudioEngine(events?: EngineEvents): Promise<IAudioEngine> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Audio engine is browser-only"));
  }
  enginePromise ??= import("./engine").then((m) => m.createAudioEngine(events));
  return enginePromise;
}

/** Test seam: reset the singleton between tests. */
export function resetAudioEngineForTests(): void {
  enginePromise = null;
}
