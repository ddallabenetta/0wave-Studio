"use client";

/**
 * Arrangement timeline: bar grid, clips, playhead.
 *
 * Clips are dragged and resized with pointer capture and snapped to the grid.
 * The playhead is a single absolutely positioned element driven by the store's
 * display-rate position, so moving it never re-renders the clip list.
 */
import { useCallback, useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { createId } from "@/lib/schema/factories";
import { TRACK_ROW_HEIGHT } from "./TrackList";
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
  originStart: number;
  originLength: number;
}

export function Timeline({ pixelsPerBeat, onZoom }: { pixelsPerBeat: number; onZoom: (next: number) => void }) {
  const project = useProjectStore((s) => s.project);
  const tracks = project.tracks;
  const patterns = useProjectStore((s) => s.project.patterns);
  const assets = useProjectStore((s) => s.project.assets);
  const beatsPerBar = useProjectStore((s) => s.project.timeSignature.beatsPerBar);
  const updateClip = useProjectStore((s) => s.updateClip);
  const addClip = useProjectStore((s) => s.addClip);
  const deleteClip = useProjectStore((s) => s.deleteClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const addPattern = useProjectStore((s) => s.addPattern);

  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const setActivePatternId = useUiStore((s) => s.setActivePatternId);
  const setPlaygroundEditor = useUiStore((s) => s.setPlaygroundEditor);
  const position = useUiStore((s) => s.positionBeats);

  const [snap, setSnap] = useState(1);
  const drag = useRef<DragState | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

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
      if (state.mode === "move") {
        const next = Math.max(0, quantize(state.originStart + deltaBeats));
        updateClip(state.trackId, state.clipId, (clip) => void (clip.startBeat = next));
      } else {
        const next = Math.max(snap, quantize(state.originLength + deltaBeats));
        updateClip(state.trackId, state.clipId, (clip) => void (clip.lengthBeats = next));
      }
    },
    [pixelsPerBeat, quantize, snap, updateClip],
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
      originStart: clip.startBeat,
      originLength: clip.lengthBeats,
    };
    setSelection(
      clip.kind === "pattern"
        ? { kind: "pattern-clip", trackId, clipId: clip.id }
        : { kind: "audio-clip", trackId, clipId: clip.id },
    );
    if (clip.kind === "pattern") {
      setActivePatternId(clip.patternId);
      setPlaygroundEditor("pattern");
    } else {
      setPlaygroundEditor("clip");
    }
  };

  const createPatternClip = (trackId: string, atBeat: number) => {
    const patternId = patterns[0]?.id ?? addPattern(4, 4);
    const pattern = useProjectStore.getState().project.patterns.find((p) => p.id === patternId);
    const clip: Clip = {
      kind: "pattern",
      id: createId(),
      patternId,
      startBeat: Math.max(0, quantize(atBeat)),
      lengthBeats: pattern?.lengthBeats ?? 4,
      loopEnabled: false,
      transpose: 0,
      velocityMultiplier: 1,
    };
    addClip(trackId, clip);
    setSelection({ kind: "pattern-clip", trackId, clipId: clip.id });
    setActivePatternId(patternId);
    setPlaygroundEditor("pattern");
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
    setPlaygroundEditor("clip");
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

  /**
   * Where a new clip lands: at the playhead while playing, otherwise right
   * after the last clip on the track so repeated clicks never stack.
   */
  const insertBeatFor = (track: typeof targetTrack): number => {
    if (position > 0) return position;
    if (!track || track.clips.length === 0) return 0;
    return Math.max(...track.clips.map((c) => c.startBeat + c.lengthBeats));
  };

  const bars = Math.ceil(totalBeats / beatsPerBar);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-edge bg-surface px-3">
        <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          Snap
          <select
            value={snap}
            onChange={(e) => setSnap(Number(e.target.value))}
            aria-label="Snap"
            className="material-sunken rounded-[var(--radius-control)] px-1 py-0.5 text-[11px] text-ink"
          >
            <option value={4}>1 bar</option>
            <option value={1}>1/4</option>
            <option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option>
          </select>
        </label>
        <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          Zoom
          <input
            type="range"
            min={MIN_PX_PER_BEAT}
            max={MAX_PX_PER_BEAT}
            value={pixelsPerBeat}
            aria-label="Timeline zoom"
            onChange={(e) => onZoom(Number(e.target.value))}
            className="w-28 accent-[var(--accent)]"
          />
        </label>
        <Button
          size="sm"
          icon={<Plus size={12} weight="bold" />}
          disabled={!targetTrack || targetTrack.type !== "instrument"}
          title={strings.playground.pattern.addPatternClip}
          onClick={() => targetTrack && createPatternClip(targetTrack.id, insertBeatFor(targetTrack))}
        >
          {strings.playground.pattern.addPatternClip}
        </Button>
        <Button
          size="sm"
          disabled={!canAddAudioClip}
          title={
            canAddAudioClip
              ? strings.playground.pattern.addAudioClip
              : strings.playground.pattern.addAudioClipHint
          }
          onClick={() => targetTrack && createAudioClip(targetTrack.id, insertBeatFor(targetTrack))}
        >
          {strings.playground.pattern.addAudioClip}
        </Button>
        {selection && (selection.kind === "pattern-clip" || selection.kind === "audio-clip") && (
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => duplicateClip(selection.trackId, selection.clipId)}
            >
              {strings.library.duplicate}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                deleteClip(selection.trackId, selection.clipId);
                setSelection(null);
              }}
            >
              {strings.library.delete}
            </Button>
          </div>
        )}
      </div>

      <div
        ref={surfaceRef}
        className="relative min-h-0 flex-1 overflow-auto"
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <div style={{ width: totalBeats * pixelsPerBeat, minWidth: "100%" }}>
          {/* Bar ruler */}
          <div className="sticky top-0 z-10 flex h-6 border-b border-edge bg-surface-sunken">
            {Array.from({ length: bars }, (_, bar) => (
              <div
                key={bar}
                className="shrink-0 border-r border-edge font-mono text-[10px] text-ink-faint"
                style={{ width: beatsPerBar * pixelsPerBeat }}
              >
                <span className="pl-1">{bar + 1}</span>
              </div>
            ))}
          </div>

          {/* Track lanes */}
          {tracks.map((track) => (
            <div
              key={track.id}
              className="relative border-b border-edge"
              style={{ height: TRACK_ROW_HEIGHT }}
              onDoubleClick={(event) => {
                if (track.type !== "instrument") return;
                const rect = event.currentTarget.getBoundingClientRect();
                createPatternClip(track.id, (event.clientX - rect.left) / pixelsPerBeat);
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
                const label =
                  clip.kind === "pattern"
                    ? patterns.find((p) => p.id === clip.patternId)?.name ?? strings.playground.editors.pattern
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
                        setSelection(null);
                      }
                      if (event.key === "ArrowRight") {
                        updateClip(track.id, clip.id, (c) => void (c.startBeat = c.startBeat + snap));
                      }
                      if (event.key === "ArrowLeft") {
                        updateClip(track.id, clip.id, (c) => void (c.startBeat = Math.max(0, c.startBeat - snap)));
                      }
                    }}
                    onPointerDown={(event) => beginDrag(event, clip, track.id, "move")}
                    className={`absolute top-1 flex h-[calc(100%-8px)] cursor-grab items-start overflow-hidden rounded-[var(--radius-clip)] border text-[10px] ${
                      selected ? "border-ink ring-1 ring-ink" : "border-edge-strong"
                    }`}
                    style={{
                      left: clip.startBeat * pixelsPerBeat,
                      width: Math.max(6, clip.lengthBeats * pixelsPerBeat),
                      background: `color-mix(in srgb, var(--${track.colorToken}) 22%, var(--surface-raised))`,
                    }}
                  >
                    <span className="truncate px-1 pt-0.5 font-mono text-ink">{label}</span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      onPointerDown={(event) => beginDrag(event, clip, track.id, "resize")}
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-edge-strong/40"
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {/* Playhead */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-accent"
            style={{ left: position * pixelsPerBeat }}
          />
        </div>

        {tracks.length > 0 && (
          <p className="px-3 py-2 font-mono text-[10px] text-ink-faint">
            {strings.playground.pattern.newPattern}: double-click an instrument lane
          </p>
        )}
      </div>
    </div>
  );
}
