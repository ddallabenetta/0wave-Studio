"use client";

/**
 * Playground: tracks, arrangement, and the two note editors over one
 * canonical pattern model. Sound design stays in the Studio.
 *
 * Three rules hold the section together:
 *
 * - a pattern is heard through the track it is placed on, so no view asks
 *   which instrument to use (see patternTarget.ts);
 * - every pattern is visible as a thumbnail before it is chosen, so the
 *   picker is a strip of cards rather than a list of names;
 * - the space bar is play/pause, the way it is in every other music tool.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, CaretUp, MusicNotes, SlidersHorizontal, Sparkle } from "@phosphor-icons/react";
import { IconButton, SegmentedControl } from "@/components/controls";
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
import { PatternStrip } from "./PatternStrip";
import { PianoRoll } from "./PianoRoll";
import { Inspector } from "./Inspector";
import { createPatternOnTrack, insertBeatFor } from "./clipPlacement";
import { usePlaybackSync } from "./usePlaybackSync";
import { useTransportControls } from "./useTransportControls";
import { strings } from "@/i18n";
import type { PlaygroundEditor, PlaygroundRightTab } from "@/lib/state/ui-store";

const EDITORS: { value: PlaygroundEditor; label: string }[] = [
  { value: "pattern", label: strings.playground.editors.pattern },
  { value: "piano-roll", label: strings.playground.editors.pianoRoll },
];

/** Height of the open note editor. */
const EDITOR_HEIGHT = 300;

export function PlaygroundRoot() {
  usePlaybackSync();

  const patterns = useProjectStore((s) => s.project.patterns);
  const tracks = useProjectStore((s) => s.project.tracks);

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
  const { toggle, ready } = useTransportControls();

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

  /**
   * Space is play/pause, as it is in every DAW. It is claimed for the whole
   * section — including while a step button has focus, where the browser
   * would otherwise re-toggle that step — and released only to text fields
   * and selects, where space is a character or a menu.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const element = event.target as HTMLElement | null;
      const tag = element?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element?.isContentEditable) {
        return;
      }
      event.preventDefault();
      if (ready) toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ready, toggle]);

  /** Target of the AI Connector: the selected track's sound (ADR-005: tracks
   * reference soundId, so patching it live-updates the track). */
  const aiSoundId = useMemo(() => {
    if (!selection || selection.kind === "note") return null;
    const track = tracks.find((t) => t.id === selection.trackId);
    return track?.soundId ?? null;
  }, [selection, tracks]);

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
    setActivePatternId(patterns[0]?.id ?? null);
  }, [activePatternId, patterns, setActivePatternId]);

  /**
   * A new pattern is created where it will play: on the selected track, at
   * the playhead. A pattern with no home has no instrument, which is the
   * confusion this whole section is built to avoid.
   */
  const createPattern = () => {
    const state = useProjectStore.getState();
    const selected = useUiStore.getState().selection;
    const selectedTrack =
      selected && selected.kind !== "note"
        ? state.project.tracks.find((t) => t.id === selected.trackId && t.type === "instrument")
        : undefined;
    const track = selectedTrack ?? state.project.tracks.find((t) => t.type === "instrument");
    const trackId = track?.id ?? state.addTrack("instrument");
    const position = useUiStore.getState().positionBeats;
    const created = createPatternOnTrack(trackId, insertBeatFor(track, position));
    setActivePatternId(created.patternId);
    setSelection({ kind: "pattern-clip", trackId, clipId: created.clipId });
    setBottomPanel("editor");
  };

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
        <div className="w-[360px] shrink-0">
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
            {/* The patterns themselves, always visible — even with the editor
                closed, so the arrangement can be built from the cards. */}
            <div className="flex items-center gap-2 px-3">
              <PatternStrip onCreatePattern={createPattern} />

              <div className="flex shrink-0 items-center gap-2 pl-2">
                <SegmentedControl
                  label={strings.playground.editors.pattern}
                  options={EDITORS}
                  value={editor}
                  size="sm"
                  onChange={(value) => {
                    setEditor(value);
                    setBottomPanel("editor");
                  }}
                />
                <HelpTip term="pianoRoll" placement="top" />
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={
                    bottomPanel === "editor"
                      ? strings.common.close
                      : strings.playground.editors.pattern
                  }
                  icon={
                    bottomPanel === "editor" ? <CaretDown size={14} /> : <CaretUp size={14} />
                  }
                  onClick={() => setBottomPanel(bottomPanel === "editor" ? "closed" : "editor")}
                />
              </div>
            </div>

            {bottomPanel === "editor" && (
              <div style={{ height: EDITOR_HEIGHT }} className="border-t border-edge bg-base">
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
