"use client";

/**
 * App shell: top bar + Start Audio gate + project bootstrap + engine bridge.
 * Wraps both creative sections so navigation between Studio and Playground
 * never recreates the AudioContext or loses project state.
 */
import { useEffect } from "react";
import { getAudioEngine } from "@/lib/audio";
import { useUiStore } from "@/lib/state/ui-store";
import { useProjectStore } from "@/lib/state/project-store";
import { parseProject } from "@/lib/schema/migrations";
// Browser-only modules: safe to import statically here because they touch
// IndexedDB / window only inside functions, never at module top level.
import { localRepository } from "@/lib/persistence/local";
import { startAutosave } from "@/lib/persistence/autosave";
import { SYSTEM_PRESETS } from "@/lib/presets";
import { TopBar } from "./TopBar";
import { StartAudioGate } from "./StartAudioGate";

/**
 * Restore the last project from IndexedDB; seed system presets on first run.
 *
 * The guard is module-scoped, not per-component: React StrictMode mounts
 * effects twice in development, and route changes remount the shell. Seeding
 * is additionally guarded on an empty library so it can never duplicate.
 */
let bootstrapped = false;

function useProjectBootstrap() {
  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;
    void (async () => {
      try {
        const raw = await localRepository.loadLatestProject();
        const project = raw ? parseProject(raw) : null;
        if (project) {
          useProjectStore.getState().loadProject(project);
          return;
        }
        // First run or unrecoverable save: seed the curated presets once.
        if (useProjectStore.getState().project.sounds.length === 0) {
          for (const preset of SYSTEM_PRESETS) {
            useProjectStore.getState().addSound(structuredClone(preset));
          }
          useProjectStore.getState().markSaved();
        }
      } finally {
        startAutosave();
      }
    })();
  }, []);
}

/** Bridge engine events into the UI store for the app lifetime. */
function useEngineBridge() {
  useEffect(() => {
    let detach: (() => void) | undefined;
    void getAudioEngine().then((engine) => {
      // Wired after resolution: a child component may have created the
      // singleton first, so creation-time events cannot be relied on.
      engine.setEvents({
        onStatusChange: (status) => useUiStore.getState().setAudioStatus(status),
        onClip: () => {
          useUiStore.getState().setMasterClipping(true);
          window.setTimeout(() => useUiStore.getState().setMasterClipping(false), 600);
        },
        onPosition: (beats) => useUiStore.getState().setPositionBeats(beats),
      });
      useUiStore.getState().setAudioStatus(engine.status);
      const onVisibility = () => useUiStore.getState().setAudioStatus(engine.status);
      document.addEventListener("visibilitychange", onVisibility);
      detach = () => document.removeEventListener("visibilitychange", onVisibility);
    });
    return () => detach?.();
  }, []);
}

/** Global undo/redo. Ignored while typing so text fields keep native undo. */
function useUndoShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      const store = useProjectStore.getState();
      if (event.shiftKey) store.redo();
      else store.undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useProjectBootstrap();
  useEngineBridge();
  useUndoShortcuts();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <StartAudioGate />
    </div>
  );
}
