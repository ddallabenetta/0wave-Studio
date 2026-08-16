"use client";

/**
 * "This pattern plays on <track>, through <sound>."
 *
 * The note editors used to be silent about which instrument they were
 * previewing with — it was whatever the Studio happened to have open. Here
 * the answer is stated in the editor's own header and comes from the
 * arrangement: the clip being edited, its track, that track's sound. Moving
 * the clip to another track changes this line, and changes what the editor
 * sounds like, without any instrument selector existing anywhere.
 *
 * When the same pattern is placed more than once, each placement is a chip:
 * picking one is picking which copy you are hearing and editing against.
 */
import { useEffect, useRef, useState } from "react";
import { Play, Stop } from "@phosphor-icons/react";
import { Button } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { usePatternTarget } from "./patternTarget";
import { useTrackPreview } from "./useTrackPreview";
import { insertBeatFor, placePatternClip } from "./clipPlacement";
import { strings } from "@/i18n";
import type { ID } from "@/lib/schema/types";

export function PatternTargetChip({ patternId }: { patternId: ID | null }) {
  const project = useProjectStore((s) => s.project);
  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const positionBeats = useUiStore((s) => s.positionBeats);
  const target = usePatternTarget(patternId);
  const preview = useTrackPreview();

  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const pattern = project.patterns.find((p) => p.id === patternId);
  if (!pattern) return null;

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (target.active) preview.stop(target.active.trackId);
    setPlaying(false);
  };

  const audition = () => {
    if (!target.active) return;
    stop();
    const seconds = preview.notes(target.active.trackId, pattern.notes);
    if (seconds === null) return;
    setPlaying(true);
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        setPlaying(false);
      },
      Math.round(seconds * 1000) + 120,
    );
  };

  /* Unplaced: offer the one action that gives it an instrument. */
  if (!target.active) {
    const fallbackTrackId =
      selection && selection.kind !== "note"
        ? selection.trackId
        : project.tracks.find((t) => t.type === "instrument")?.id;
    const track = project.tracks.find((t) => t.id === fallbackTrackId);
    return (
      <div className="flex items-center gap-2">
        <span
          className="rounded-full border border-dashed border-edge-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint"
          title={strings.playground.pattern.unplacedHint}
        >
          {strings.playground.pattern.unplaced}
        </span>
        <Button
          size="sm"
          disabled={!track || track.type !== "instrument"}
          title={strings.playground.pattern.unplacedHint}
          onClick={() => {
            if (!track) return;
            const clipId = placePatternClip(
              track.id,
              pattern.id,
              insertBeatFor(track, positionBeats),
            );
            setSelection({ kind: "pattern-clip", trackId: track.id, clipId });
          }}
        >
          {strings.playground.pattern.placeHere}
        </Button>
      </div>
    );
  }

  const canHear = Boolean(target.sound);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        className="shrink-0 cursor-help font-mono text-[10px] uppercase tracking-wider text-ink-faint"
        title={strings.playground.pattern.playsOnHint}
      >
        {strings.playground.pattern.playsOn}
      </span>

      <div className="flex min-w-0 items-center gap-1">
        {target.placements.map((placement) => {
          const track = project.tracks.find((t) => t.id === placement.trackId);
          if (!track) return null;
          const active = placement.clipId === target.active?.clipId;
          const sound = project.sounds.find((s) => s.id === track.soundId);
          return (
            <button
              key={placement.clipId}
              type="button"
              aria-pressed={active}
              title={
                sound
                  ? `${track.name} — ${sound.name}`
                  : `${track.name} — ${strings.playground.pattern.trackHasNoSound}`
              }
              onClick={() =>
                setSelection({
                  kind: "pattern-clip",
                  trackId: placement.trackId,
                  clipId: placement.clipId,
                })
              }
              className={`motion-ui flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
                active
                  ? "border-accent bg-accent-wash text-ink"
                  : "border-edge bg-surface-raised text-ink-soft hover:border-edge-strong"
              }`}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: `var(--${track.colorToken})` }}
              />
              <span className="max-w-[110px] truncate whitespace-nowrap">{track.name}</span>
              {sound ? (
                <span className="max-w-[110px] truncate text-ink-faint">· {sound.name}</span>
              ) : (
                <span className="truncate text-warning">
                  · {strings.playground.pattern.trackHasNoSound}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Button
        size="sm"
        className="shrink-0 whitespace-nowrap"
        variant={playing ? "primary" : "default"}
        icon={playing ? <Stop size={12} weight="fill" /> : <Play size={12} weight="fill" />}
        disabled={!canHear || pattern.notes.length === 0}
        title={
          canHear
            ? strings.playground.pattern.audition
            : strings.playground.pattern.trackHasNoSound
        }
        onClick={() => (playing ? stop() : audition())}
      >
        {playing ? strings.playground.pattern.auditionStop : strings.playground.pattern.preview}
      </Button>
    </div>
  );
}
