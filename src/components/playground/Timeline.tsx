"use client";

/**
 * Arrangement timeline: bar grid, clips, playhead.
 *
 * Clips are dragged and resized with pointer capture and snapped to the grid.
 * Dragging across lanes moves a clip to another track, which is how a pattern
 * changes instrument — there is no instrument selector anywhere, only where
 * the clip sits.
 *
 * A pattern clip draws its own notes, tiled once per repetition, so the
 * arrangement is readable as music rather than as a row of labelled boxes.
 *
 * The playhead is a single absolutely positioned element driven by the
 * store's display-rate position, so moving it never re-renders the clip list.
 */
import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import { Plus, Waveform } from "@phosphor-icons/react";
import { Button } from "@/components/controls";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { createId } from "@/lib/schema/factories";
import { PatternPreview } from "./PatternPreview";
import { clipRepeats } from "./patternGeometry";
import { createPatternOnTrack, insertBeatFor, placePatternClip } from "./clipPlacement";
import { TIMELINE_RULER_HEIGHT, TRACK_ROW_HEIGHT } from "./layout";
import { strings } from "@/i18n";
import type { Clip } from "@/lib/schema/types";

const MIN_PX_PER_BEAT = 8;
const MAX_PX_PER_BEAT = 120;

type DragMode = "move" | "resize";

interface DragState {
  trackId: string;
  clipId: string;
  mode: DragMode;
  startX: number;
  startY: number;
  originStart: number;
  originLength: number;
  /** Whether this drag has already put its starting state on the undo stack. */
  undoPushed: boolean;
}

export function Timeline({
  pixelsPerBeat,
  onZoom,
  scrollRef,
  onScroll,
}: {
  pixelsPerBeat: number;
  onZoom: (next: number) => void;
  /** The scrolling lane container, so the track list can be kept in step. */
  scrollRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}) {
  const project = useProjectStore((s) => s.project);
  const tracks = project.tracks;
  const patterns = useProjectStore((s) => s.project.patterns);
  const assets = useProjectStore((s) => s.project.assets);
  const beatsPerBar = useProjectStore((s) => s.project.timeSignature.beatsPerBar);
  const updateClip = useProjectStore((s) => s.updateClip);
  const addClip = useProjectStore((s) => s.addClip);
  const deleteClip = useProjectStore((s) => s.deleteClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);

  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const setActivePatternId = useUiStore((s) => s.setActivePatternId);
  const position = useUiStore((s) => s.positionBeats);
  const engineRef = useEngineRef();

  const [snap, setSnap] = useState(1);
  const drag = useRef<DragState | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const lanesRef = useRef<HTMLDivElement | null>(null);

  const totalBeats = Math.max(
    64,
    ...tracks.flatMap((t) => t.clips.map((c) => c.startBeat + c.lengthBeats + 16)),
  );

  const quantize = useCallback((beats: number) => Math.round(beats / snap) * snap, [snap]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      const deltaBeats = (event.clientX - state.startX) / pixelsPerBeat;
      // One undo entry per gesture: the first frame snapshots where the clip
      // started, the rest are silent, so Undo does not replay the drag.
      const undoable = !state.undoPushed;
      state.undoPushed = true;

      if (state.mode === "resize") {
        const next = Math.max(snap, quantize(state.originLength + deltaBeats));
        updateClip(state.trackId, state.clipId, (clip) => void (clip.lengthBeats = next), {
          undoable,
        });
        return;
      }

      const next = Math.max(0, quantize(state.originStart + deltaBeats));
      updateClip(state.trackId, state.clipId, (clip) => void (clip.startBeat = next), {
        undoable,
      });

      // Vertical travel moves the clip between lanes: the lane it lands on
      // is the instrument it will play through.
      const lanes = lanesRef.current;
      if (!lanes) return;
      const laneIndex = Math.floor(
        (event.clientY - lanes.getBoundingClientRect().top) / TRACK_ROW_HEIGHT,
      );
      const targetTrack = tracks[laneIndex];
      if (!targetTrack || targetTrack.id === state.trackId) return;
      const source = tracks.find((t) => t.id === state.trackId);
      const clip = source?.clips.find((c) => c.id === state.clipId);
      if (!clip) return;
      const compatible =
        targetTrack.type === "instrument" ? clip.kind === "pattern" : clip.kind === "audio";
      if (!compatible) return;
      moveClipToTrack(state.trackId, targetTrack.id, state.clipId, { undoable: false });
      state.trackId = targetTrack.id;
      setSelection(
        clip.kind === "pattern"
          ? { kind: "pattern-clip", trackId: targetTrack.id, clipId: state.clipId }
          : { kind: "audio-clip", trackId: targetTrack.id, clipId: state.clipId },
      );
    },
    [moveClipToTrack, pixelsPerBeat, quantize, setSelection, snap, tracks, updateClip],
  );

  const beginDrag = (event: React.PointerEvent, clip: Clip, trackId: string, mode: DragMode) => {
    event.stopPropagation();
    // Capture keeps the drag alive outside the element; a missing pointer
    // (synthetic events, cancelled gestures) must not break the interaction.
    try {
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      /* no active pointer; pointermove on the surface still drives the drag */
    }
    drag.current = {
      trackId,
      clipId: clip.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originStart: clip.startBeat,
      originLength: clip.lengthBeats,
      undoPushed: false,
    };
    setSelection(
      clip.kind === "pattern"
        ? { kind: "pattern-clip", trackId, clipId: clip.id }
        : { kind: "audio-clip", trackId, clipId: clip.id },
    );
    if (clip.kind === "pattern") setActivePatternId(clip.patternId);
  };

  /** Put the active pattern (or a fresh one) on a track at `atBeat`. */
  const addPatternClip = (trackId: string, atBeat: number) => {
    const activePatternId = useUiStore.getState().activePatternId;
    const beat = Math.max(0, quantize(atBeat));
    const existing = patterns.find((p) => p.id === activePatternId);
    if (existing) {
      const clipId = placePatternClip(trackId, existing.id, beat);
      setSelection({ kind: "pattern-clip", trackId, clipId });
      setActivePatternId(existing.id);
      return;
    }
    const created = createPatternOnTrack(trackId, beat);
    setSelection({ kind: "pattern-clip", trackId, clipId: created.clipId });
    setActivePatternId(created.patternId);
  };

  /**
   * Place an audio clip for the sample sound assigned to the track. The clip
   * length defaults to the asset duration converted at the current tempo.
   */
  const createAudioClip = (trackId: string, atBeat: number) => {
    const state = useProjectStore.getState();
    const track = state.project.tracks.find((t) => t.id === trackId);
    const sound = state.project.sounds.find((s) => s.id === track?.soundId);
    const asset = state.project.assets.find((a) => a.id === sound?.sampleState?.assetId);
    if (!asset) return;
    const lengthBeats = Math.max(0.25, (asset.duration * state.project.tempo) / 60);
    const clip: Clip = {
      kind: "audio",
      id: createId(),
      assetId: asset.id,
      startBeat: Math.max(0, quantize(atBeat)),
      lengthBeats,
      offsetSeconds: 0,
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: asset.duration,
    };
    addClip(trackId, clip);
    setSelection({ kind: "audio-clip", trackId, clipId: clip.id });
  };

  /** Track that new clips are added to: the current selection. */
  const targetTrackId =
    selection?.kind === "track"
      ? selection.trackId
      : selection?.kind === "pattern-clip" || selection?.kind === "audio-clip"
        ? selection.trackId
        : tracks[0]?.id;
  const targetTrack = tracks.find((t) => t.id === targetTrackId);
  const targetSound = project.sounds.find((s) => s.id === targetTrack?.soundId);
  const canAddAudioClip = Boolean(targetSound?.sampleState?.assetId);

  const bars = Math.ceil(totalBeats / beatsPerBar);

  /** Click the ruler to move the playhead there. */
  const seekTo = (clientX: number, rulerLeft: number) => {
    const beat = Math.max(0, quantize((clientX - rulerLeft) / pixelsPerBeat));
    engineRef.current?.seek(beat);
    useUiStore.getState().setPositionBeats(beat);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <div className="flex h-9 shrink-0 items-center gap-3 overflow-x-auto border-b border-edge bg-surface px-3">
        <label className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.timeline.snap}
          <select
            value={snap}
            onChange={(e) => setSnap(Number(e.target.value))}
            aria-label={strings.playground.timeline.snap}
            className="material-sunken rounded-[var(--radius-control)] px-1 py-0.5 text-[11px] text-ink"
          >
            <option value={4}>1 {strings.playground.timeline.bar.toLowerCase()}</option>
            <option value={1}>1/4</option>
            <option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option>
          </select>
        </label>
        <label className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.timeline.zoom}
          <input
            type="range"
            min={MIN_PX_PER_BEAT}
            max={MAX_PX_PER_BEAT}
            value={pixelsPerBeat}
            aria-label={strings.playground.timeline.zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            className="w-28 accent-[var(--accent)]"
          />
        </label>

        <span aria-hidden className="h-5 w-px shrink-0 bg-edge" />

        <Button
          size="sm"
          className="shrink-0 whitespace-nowrap"
          icon={<Plus size={12} weight="bold" />}
          disabled={!targetTrack || targetTrack.type !== "instrument"}
          title={strings.playground.pattern.addPatternClip}
          onClick={() =>
            targetTrack && addPatternClip(targetTrack.id, insertBeatFor(targetTrack, position))
          }
        >
          {strings.playground.pattern.addPatternClip}
        </Button>
        <Button
          size="sm"
          className="shrink-0 whitespace-nowrap"
          icon={<Waveform size={12} weight="bold" />}
          disabled={!canAddAudioClip}
          title={
            canAddAudioClip
              ? strings.playground.pattern.addAudioClip
              : strings.playground.pattern.addAudioClipHint
          }
          onClick={() =>
            targetTrack && createAudioClip(targetTrack.id, insertBeatFor(targetTrack, position))
          }
        >
          {strings.playground.pattern.addAudioClip}
        </Button>

        {selection && (selection.kind === "pattern-clip" || selection.kind === "audio-clip") && (
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              className="whitespace-nowrap"
              onClick={() => duplicateClip(selection.trackId, selection.clipId)}
            >
              {strings.playground.timeline.duplicateClip}
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="whitespace-nowrap"
              onClick={() => {
                deleteClip(selection.trackId, selection.clipId);
                // Fall back to the clip's track rather than to nothing: it is
                // where the next action (a new clip, a re-placed pattern) will
                // almost certainly go.
                setSelection({ kind: "track", trackId: selection.trackId });
              }}
            >
              {strings.playground.timeline.deleteClip}
            </Button>
          </div>
        )}

        {/* Guidance while there is nothing to look at; it retires as soon
            as the arrangement has clips of its own. */}
        {tracks.every((track) => track.clips.length === 0) && (
          <span className="shrink-0 pl-1 font-mono text-[10px] text-ink-faint">
            {strings.playground.pattern.addClipHint}
          </span>
        )}
      </div>

      <div
        ref={scrollRef ?? surfaceRef}
        className="relative min-h-0 flex-1 overflow-auto"
        onScroll={onScroll}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <div style={{ width: totalBeats * pixelsPerBeat, minWidth: "100%" }}>
          {/* Bar ruler. Clicking it moves the playhead: the fastest way to
              hear a specific bar, and the thing every DAW user tries first. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={strings.playground.transport.position}
            aria-valuemin={0}
            aria-valuemax={Math.round(totalBeats)}
            aria-valuenow={Math.round(position)}
            title={strings.playground.timeline.seekHint}
            style={{ height: TIMELINE_RULER_HEIGHT }}
            className="sticky top-0 z-10 flex cursor-pointer border-b border-edge bg-surface-sunken"
            onPointerDown={(event) =>
              seekTo(event.clientX, event.currentTarget.getBoundingClientRect().left)
            }
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const next = Math.max(0, position + (event.key === "ArrowRight" ? snap : -snap));
              engineRef.current?.seek(next);
              useUiStore.getState().setPositionBeats(next);
            }}
          >
            {Array.from({ length: bars }, (_, bar) => (
              <div
                key={bar}
                className="shrink-0 border-r border-edge font-mono text-[10px] text-ink-faint"
                style={{ width: beatsPerBar * pixelsPerBeat }}
              >
                <span className="pl-1">{bar + 1}</span>
              </div>
            ))}
            {/* The head itself sits above the sticky ruler. */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 z-20 size-[9px] rounded-b-[2px] bg-accent"
              style={{
                left: position * pixelsPerBeat - 4,
                clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              }}
            />
          </div>

          {/* Track lanes */}
          <div ref={lanesRef}>
            {tracks.map((track) => (
              <div
                key={track.id}
                className="relative border-b border-edge"
                style={{ height: TRACK_ROW_HEIGHT }}
                onPointerDown={() => setSelection({ kind: "track", trackId: track.id })}
                onDoubleClick={(event) => {
                  if (track.type !== "instrument") return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  addPatternClip(track.id, (event.clientX - rect.left) / pixelsPerBeat);
                }}
              >
                {/* Grid lines */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to right, var(--edge) 0 1px, transparent 1px ${
                      beatsPerBar * pixelsPerBeat
                    }px), repeating-linear-gradient(to right, var(--surface-sunken) 0 1px, transparent 1px ${pixelsPerBeat}px)`,
                  }}
                />

                {track.clips.map((clip) => {
                  const selected =
                    (selection?.kind === "pattern-clip" || selection?.kind === "audio-clip") &&
                    selection.clipId === clip.id;
                  const pattern =
                    clip.kind === "pattern"
                      ? patterns.find((p) => p.id === clip.patternId)
                      : undefined;
                  const label =
                    clip.kind === "pattern"
                      ? pattern?.name ?? strings.playground.editors.pattern
                      : assets.find((a) => a.id === clip.assetId)?.originalFilename ??
                        strings.playground.editors.clip;
                  return (
                    <div
                      key={clip.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${label} ${strings.playground.inspector.start} ${clip.startBeat}`}
                      onKeyDown={(event) => {
                        if (event.key === "Delete" || event.key === "Backspace") {
                          deleteClip(track.id, clip.id);
                          setSelection({ kind: "track", trackId: track.id });
                        }
                        if (event.key === "ArrowRight") {
                          updateClip(track.id, clip.id, (c) => void (c.startBeat = c.startBeat + snap));
                        }
                        if (event.key === "ArrowLeft") {
                          updateClip(
                            track.id,
                            clip.id,
                            (c) => void (c.startBeat = Math.max(0, c.startBeat - snap)),
                          );
                        }
                      }}
                      onPointerDown={(event) => beginDrag(event, clip, track.id, "move")}
                      className={`motion-ui absolute top-1 flex h-[calc(100%-8px)] cursor-grab flex-col overflow-hidden rounded-[var(--radius-clip)] border text-[10px] ${
                        selected ? "border-ink ring-1 ring-ink" : "border-edge-strong"
                      }`}
                      style={{
                        left: clip.startBeat * pixelsPerBeat,
                        width: Math.max(6, clip.lengthBeats * pixelsPerBeat),
                        background: `color-mix(in srgb, var(--${track.colorToken}) 22%, var(--surface-raised))`,
                      }}
                    >
                      <span className="relative z-10 truncate px-1 pt-0.5 font-mono text-ink">
                        {label}
                      </span>
                      {/* The clip's own notes, tiled once per repetition. */}
                      {pattern && (
                        <PatternPreview
                          pattern={pattern}
                          color={`var(--${track.colorToken})`}
                          repeats={clipRepeats(
                            clip.lengthBeats,
                            pattern.lengthBeats,
                            clip.kind === "pattern" && clip.loopEnabled,
                          )}
                          className="min-h-0 flex-1 px-px pb-px text-ink-faint"
                        />
                      )}
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        onPointerDown={(event) => beginDrag(event, clip, track.id, "resize")}
                        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-edge-strong/40"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Playhead. One element, positioned from the store's display-rate
              value; the glow is pseudo-free decoration on the same node, so
              following it still costs nothing per frame. */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-accent"
            style={{
              left: position * pixelsPerBeat,
              boxShadow: "0 0 8px 0 color-mix(in srgb, var(--accent) 70%, transparent)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
