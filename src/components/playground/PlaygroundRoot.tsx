"use client";

/**
 * Playground: tracks, arrangement, and the two note editors over one
 * canonical pattern model. Sound design stays in the Studio.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, CaretUp, MusicNotes, SlidersHorizontal, Sparkle } from "@phosphor-icons/react";
import { Button, SegmentedControl } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { SoundLibraryPanel } from "@/components/studio/SoundLibraryPanel";
import { RightPanel } from "@/components/studio/RightPanel";
import { AIConnectorPanel } from "@/components/ai/AIConnectorPanel";
import { HelpTip } from "@/components/guide/HelpTip";
import { buildStarterLoop } from "@/lib/presets/starterLoop";
import { PlaygroundEmptyState } from "./PlaygroundEmptyState";
import { Transport } from "./Transport";
import { TrackList } from "./TrackList";
import { Timeline } from "./Timeline";
import { PatternEditor } from "./PatternEditor";
import { PianoRoll } from "./PianoRoll";
import { Inspector } from "./Inspector";
import { usePlaybackSync } from "./usePlaybackSync";
import { strings } from "@/i18n";
import type { PlaygroundEditor, PlaygroundRightTab } from "@/lib/state/ui-store";

const EDITORS: { value: PlaygroundEditor; label: string }[] = [
  { value: "pattern", label: strings.playground.editors.pattern },
  { value: "piano-roll", label: strings.playground.editors.pianoRoll },
];

export function PlaygroundRoot() {
  usePlaybackSync();

  const patterns = useProjectStore((s) => s.project.patterns);
  const tracks = useProjectStore((s) => s.project.tracks);
  const addPattern = useProjectStore((s) => s.addPattern);

  const pendingSoundId = useUiStore((s) => s.pendingPlaygroundSoundId);
  const setPendingPlaygroundSound = useUiStore((s) => s.setPendingPlaygroundSound);
  const editor = useUiStore((s) => s.playgroundEditor);
  const setEditor = useUiStore((s) => s.setPlaygroundEditor);
  const bottomPanel = useUiStore((s) => s.bottomPanel);
  const setBottomPanel = useUiStore((s) => s.setBottomPanel);
  const activePatternId = useUiStore((s) => s.activePatternId);
  const setActivePatternId = useUiStore((s) => s.setActivePatternId);
  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const rightTab = useUiStore((s) => s.playgroundRightTab);
  const setRightTab = useUiStore((s) => s.setPlaygroundRightTab);
  const rightOpen = useUiStore((s) => s.playgroundRightOpen);
  const setRightOpen = useUiStore((s) => s.setPlaygroundRightOpen);

  const addTrack = useProjectStore((s) => s.addTrack);

  const [pixelsPerBeat, setPixelsPerBeat] = useState(32);

  /* Track rows and timeline lanes are two scrollers showing one thing, so
     each mirrors the other's vertical position. The equality check is what
     stops the mirroring from bouncing back and forth. */
  const trackScrollRef = useRef<HTMLUListElement | null>(null);
  const laneScrollRef = useRef<HTMLDivElement | null>(null);
  const mirrorScroll = (from: HTMLElement | null, to: HTMLElement | null) => {
    if (!from || !to || to.scrollTop === from.scrollTop) return;
    to.scrollTop = from.scrollTop;
  };

  /** Confirmation shown after the starter loop is built, then retired. */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
  };

  const buildStarter = () => {
    const [firstTrackId] = buildStarterLoop();
    if (firstTrackId) setSelection({ kind: "track", trackId: firstTrackId });
    // The starter loop creates its patterns; open the first one so the
    // editor below the timeline is showing something real.
    const [firstPattern] = useProjectStore.getState().project.patterns;
    if (firstPattern) setActivePatternId(firstPattern.id);
    showNotice(strings.playground.starter.done);
  };

  /** Target of the AI Connector: the selected track's sound (ADR-005: tracks
   * reference soundId, so patching it live-updates the track). */
  const aiSoundId = useMemo(() => {
    if (!selection || selection.kind === "note") return null;
    const track = tracks.find((t) => t.id === selection.trackId);
    return track?.soundId ?? null;
  }, [selection, tracks]);

  /** Toolbar "Sound Library" button: opens the library tab (or closes the
   * panel when the library tab is already showing). */
  const libraryActive = rightOpen && rightTab === "library";
  const toggleLibrary = () => {
    if (libraryActive) {
      setRightOpen(false);
    } else {
      setRightTab("library");
      setRightOpen(true);
    }
  };

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

  /* Nothing to arrange yet: offer to build something real instead of
     showing an empty grid the user has no way to fill. */
  if (tracks.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Transport />
        <PlaygroundEmptyState
          onBuildStarter={buildStarter}
          onAddEmptyTrack={() => {
            const trackId = addTrack("instrument");
            setSelection({ kind: "track", trackId });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Transport />

      {notice && (
        <div
          role="status"
          className="anim-rise-sm flex items-center gap-2 border-b border-accent/25 bg-accent-wash px-3 py-1.5 text-[11px] text-ink-soft"
        >
          <Sparkle size={12} weight="fill" aria-hidden className="text-accent" />
          {notice}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-[420px] shrink-0">
          <TrackList
            scrollRef={trackScrollRef}
            onScroll={() => mirrorScroll(trackScrollRef.current, laneScrollRef.current)}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Timeline
            pixelsPerBeat={pixelsPerBeat}
            onZoom={setPixelsPerBeat}
            scrollRef={laneScrollRef}
            onScroll={() => mirrorScroll(laneScrollRef.current, trackScrollRef.current)}
          />

          <div className="shrink-0 border-t border-edge bg-surface">
            <div className="flex items-center gap-2 overflow-x-auto px-3 py-1.5">
              <SegmentedControl
                label="Editor"
                options={EDITORS}
                value={editor === "clip" ? "pattern" : editor}
                size="sm"
                onChange={setEditor}
              />
              <HelpTip term="pianoRoll" placement="top" />
              <div className="h-4 w-px bg-edge" aria-hidden />
              <select
                value={activePatternId ?? ""}
                aria-label={strings.playground.editors.pattern}
                onChange={(e) => setActivePatternId(e.target.value || null)}
                className="material-sunken motion-ui rounded-[var(--radius-control)] px-2 py-1 text-[11px] text-ink outline-none focus:shadow-[var(--halo)]"
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
              <HelpTip term="pattern" placement="top" />
              <Button
                size="sm"
                variant="ghost"
                className={libraryActive ? "text-accent-ink" : undefined}
                onClick={toggleLibrary}
              >
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

        <RightPanel<PlaygroundRightTab>
          widthClass="w-[280px]"
          tabs={[
            {
              value: "inspector",
              label: strings.rightPanel.inspector,
              icon: <SlidersHorizontal size={14} weight="bold" />,
              content: <Inspector />,
            },
            {
              value: "library",
              label: strings.rightPanel.library,
              icon: <MusicNotes size={14} weight="bold" />,
              content: <SoundLibraryPanel />,
            },
            {
              value: "ai",
              label: strings.ai.title,
              icon: <Sparkle size={14} weight="bold" />,
              // Keyed by target so switching tracks resets connector state.
              content: (
                <AIConnectorPanel key={aiSoundId ?? "none"} soundId={aiSoundId} inPlayground />
              ),
            },
          ]}
          activeTab={rightTab}
          onTabChange={(tab) => {
            setRightTab(tab);
            setRightOpen(true);
          }}
          open={rightOpen}
          onOpenChange={setRightOpen}
        />
      </div>
    </div>
  );
}
