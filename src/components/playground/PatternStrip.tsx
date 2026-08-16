"use client";

/**
 * The patterns of the project, as cards.
 *
 * This replaces a dropdown of names. A name means nothing until you have
 * heard the pattern once, so every card carries the two facts that identify
 * it: the shape of its notes, and the track it plays on — which is also the
 * instrument it will be heard through. The play button auditions it through
 * exactly that instrument, layered over whatever the transport is doing.
 *
 * Patterns that are not placed anywhere are drawn with a dashed edge and
 * cannot be auditioned: there is no instrument to audition them with, and
 * saying so is more honest than picking one silently.
 */
import { useEffect, useRef, useState } from "react";
import { Play, Plus, Stop } from "@phosphor-icons/react";
import { Button } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { PatternPreview } from "./PatternPreview";
import { resolvePatternTarget } from "./patternTarget";
import { useTrackPreview } from "./useTrackPreview";
import { strings } from "@/i18n";
import type { ID } from "@/lib/schema/types";

export function PatternStrip({ onCreatePattern }: { onCreatePattern: () => void }) {
  const project = useProjectStore((s) => s.project);
  const patterns = project.patterns;
  const selection = useUiStore((s) => s.selection);
  const activePatternId = useUiStore((s) => s.activePatternId);
  const setActivePatternId = useUiStore((s) => s.setActivePatternId);
  const setSelection = useUiStore((s) => s.setSelection);
  const preview = useTrackPreview();

  /** Pattern currently being auditioned, cleared when the audition ends. */
  const [auditioning, setAuditioning] = useState<ID | null>(null);
  const auditionTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (auditionTimer.current !== null) window.clearTimeout(auditionTimer.current);
    },
    [],
  );

  const stopAudition = (trackId?: ID) => {
    if (auditionTimer.current !== null) window.clearTimeout(auditionTimer.current);
    auditionTimer.current = null;
    preview.stop(trackId);
    setAuditioning(null);
  };

  const audition = (patternId: ID, trackId: ID) => {
    const pattern = patterns.find((p) => p.id === patternId);
    if (!pattern) return;
    stopAudition();
    const seconds = preview.notes(trackId, pattern.notes);
    if (seconds === null) return;
    setAuditioning(patternId);
    auditionTimer.current = window.setTimeout(
      () => {
        auditionTimer.current = null;
        setAuditioning(null);
      },
      Math.round(seconds * 1000) + 120,
    );
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
      {patterns.map((pattern) => {
        const target = resolvePatternTarget(project, pattern.id, selection);
        const active = pattern.id === activePatternId;
        const placed = target.placements.length > 0;
        const colorToken = target.track?.colorToken;
        const color = colorToken ? `var(--${colorToken})` : "var(--accent)";
        const playing = auditioning === pattern.id;
        const canHear = placed && Boolean(target.sound);

        return (
          <div
            key={pattern.id}
            className={`motion-ui group relative flex w-[132px] shrink-0 flex-col gap-1 rounded-[var(--radius-control)] border p-1.5 ${
              active
                ? "border-accent bg-accent-wash shadow-[var(--shadow-ambient)]"
                : placed
                  ? "border-edge bg-surface-raised hover:border-edge-strong"
                  : "border-dashed border-edge bg-surface hover:border-edge-strong"
            }`}
          >
            <button
              type="button"
              aria-pressed={active}
              aria-label={`${pattern.name} — ${
                target.track ? target.track.name : strings.playground.pattern.unplaced
              }`}
              onClick={() => {
                setActivePatternId(pattern.id);
                // Selecting the card also selects its placement, so the
                // inspector and the editors are looking at the same thing.
                if (target.active) {
                  setSelection({
                    kind: "pattern-clip",
                    trackId: target.active.trackId,
                    clipId: target.active.clipId,
                  });
                }
              }}
              className="flex flex-col gap-1 text-left"
            >
              <PatternPreview
                pattern={pattern}
                color={color}
                className="h-7 w-full rounded-[var(--radius-clip)] bg-surface-sunken text-ink-faint"
              />
              <span className="truncate text-[11px] font-medium leading-none text-ink">
                {pattern.name}
              </span>
              <span
                className="flex items-center gap-1 truncate font-mono text-[9px] uppercase tracking-wider text-ink-faint"
                title={
                  placed
                    ? `${strings.playground.pattern.playsOn} ${target.track?.name ?? ""}`
                    : strings.playground.pattern.unplacedHint
                }
              >
                {placed && (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                )}
                <span className="truncate">
                  {placed ? target.track?.name : strings.playground.pattern.unplaced}
                </span>
              </span>
            </button>

            {/* Audition: the instrument comes from the placement above. */}
            <button
              type="button"
              disabled={!canHear}
              title={
                canHear
                  ? playing
                    ? strings.playground.pattern.auditionStop
                    : strings.playground.pattern.audition
                  : placed
                    ? strings.playground.pattern.trackHasNoSound
                    : strings.playground.pattern.unplacedHint
              }
              aria-label={`${
                playing ? strings.playground.pattern.auditionStop : strings.playground.pattern.audition
              }: ${pattern.name}`}
              onClick={() =>
                playing
                  ? stopAudition(target.active?.trackId)
                  : target.active && audition(pattern.id, target.active.trackId)
              }
              className={`material-raised motion-ui absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-ink-soft ${
                canHear ? "opacity-0 group-hover:opacity-100 focus:opacity-100" : "opacity-0"
              } ${playing ? "!opacity-100 bg-accent text-accent-on" : ""}`}
            >
              {playing ? <Stop size={10} weight="fill" /> : <Play size={10} weight="fill" />}
            </button>
          </div>
        );
      })}

      <Button
        size="sm"
        icon={<Plus size={12} weight="bold" />}
        className="shrink-0"
        onClick={onCreatePattern}
        title={strings.playground.pattern.newPatternHere}
      >
        {strings.playground.pattern.newPattern}
      </Button>
    </div>
  );
}
