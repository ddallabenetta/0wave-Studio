"use client";

/**
 * Playground: tracks, arrangement, and the two note editors over one
 * canonical pattern model. Sound design stays in the Studio.
 */
import { useEffect, useState } from "react";
import { CaretDown, CaretUp, MusicNotes } from "@phosphor-icons/react";
import { Button, SegmentedControl } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { SoundLibraryPanel } from "@/components/studio/SoundLibraryPanel";
import { Transport } from "./Transport";
import { TrackList } from "./TrackList";
import { Timeline } from "./Timeline";
import { PatternEditor } from "./PatternEditor";
import { PianoRoll } from "./PianoRoll";
import { Inspector } from "./Inspector";
import { usePlaybackSync } from "./usePlaybackSync";
import { strings } from "@/i18n";
import type { PlaygroundEditor } from "@/lib/state/ui-store";

const EDITORS: { value: PlaygroundEditor; label: string }[] = [
  { value: "pattern", label: strings.playground.editors.pattern },
  { value: "piano-roll", label: strings.playground.editors.pianoRoll },
];

export function PlaygroundRoot() {
  usePlaybackSync();

  const patterns = useProjectStore((s) => s.project.patterns);
  const addPattern = useProjectStore((s) => s.addPattern);

  const pendingSoundId = useUiStore((s) => s.pendingPlaygroundSoundId);
  const setPendingPlaygroundSound = useUiStore((s) => s.setPendingPlaygroundSound);
  const editor = useUiStore((s) => s.playgroundEditor);
  const setEditor = useUiStore((s) => s.setPlaygroundEditor);
  const bottomPanel = useUiStore((s) => s.bottomPanel);
  const setBottomPanel = useUiStore((s) => s.setBottomPanel);
  const activePatternId = useUiStore((s) => s.activePatternId);
  const setActivePatternId = useUiStore((s) => s.setActivePatternId);
  const setSelection = useUiStore((s) => s.setSelection);
  const drawerOpen = useUiStore((s) => s.libraryDrawerOpen);
  const setDrawerOpen = useUiStore((s) => s.setLibraryDrawerOpen);

  const [pixelsPerBeat, setPixelsPerBeat] = useState(32);

  /* "Use in Playground": assign to a free track, or create one. */
  useEffect(() => {
    if (!pendingSoundId) return;
    // Clear the request first: StrictMode runs effects twice in development
    // and a second pass must not create a duplicate track. Reads use fresh
    // store state rather than the render snapshot.
    setPendingPlaygroundSound(null);
    const state = useProjectStore.getState();
    const sound = state.project.sounds.find((s) => s.id === pendingSoundId);
    if (!sound) return;

    const existing = state.project.tracks.find((t) => t.soundId === pendingSoundId);
    if (existing) {
      setSelection({ kind: "track", trackId: existing.id });
      return;
    }
    const empty = state.project.tracks.find((t) => t.type === "instrument" && !t.soundId);
    const trackId = empty?.id ?? state.addTrack("instrument");
    state.assignSoundToTrack(trackId, pendingSoundId);
    state.renameTrack(trackId, sound.name);
    setSelection({ kind: "track", trackId });
  }, [pendingSoundId, setSelection, setPendingPlaygroundSound]);

  /* Keep an active pattern selected so the editors always have a target. */
  useEffect(() => {
    if (activePatternId && patterns.some((p) => p.id === activePatternId)) return;
    if (patterns[0]) setActivePatternId(patterns[0].id);
  }, [activePatternId, patterns, setActivePatternId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Transport />

      <div className="flex min-h-0 flex-1">
        <div className="w-[420px] shrink-0">
          <TrackList />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <Timeline pixelsPerBeat={pixelsPerBeat} onZoom={setPixelsPerBeat} />

          <div className="shrink-0 border-t border-edge bg-surface">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <SegmentedControl
                label="Editor"
                options={EDITORS}
                value={editor === "clip" ? "pattern" : editor}
                size="sm"
                onChange={setEditor}
              />
              <select
                value={activePatternId ?? ""}
                aria-label={strings.playground.editors.pattern}
                onChange={(e) => setActivePatternId(e.target.value || null)}
                className="material-sunken rounded-[var(--radius-control)] px-2 py-1 text-[11px] text-ink outline-none"
              >
                <option value="">{strings.playground.pattern.select}</option>
                {patterns.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                icon={<MusicNotes size={13} weight="bold" />}
                onClick={() => setActivePatternId(addPattern(4, 4))}
              >
                {strings.playground.pattern.newPattern}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDrawerOpen(!drawerOpen)}>
                {strings.library.title}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={bottomPanel === "editor" ? <CaretDown size={13} /> : <CaretUp size={13} />}
                onClick={() => setBottomPanel(bottomPanel === "editor" ? "closed" : "editor")}
              >
                {bottomPanel === "editor" ? strings.common.close : strings.playground.editors.pattern}
              </Button>
            </div>

            {bottomPanel === "editor" && (
              <div className="h-[280px] border-t border-edge bg-base">
                {editor === "piano-roll" ? (
                  <PianoRoll patternId={activePatternId} />
                ) : (
                  <PatternEditor patternId={activePatternId} />
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="w-[280px] shrink-0 overflow-y-auto border-l border-edge bg-base p-2">
          {drawerOpen ? <SoundLibraryPanel /> : <Inspector />}
        </aside>
      </div>
    </div>
  );
}
