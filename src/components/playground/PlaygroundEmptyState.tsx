"use client";

/**
 * What the Playground shows before there is anything to play.
 *
 * An empty timeline is technically correct and practically useless: it
 * asks for a track, a sound, a pattern, a clip and a set of notes before
 * it will make any sound at all, and every one of those words is jargon.
 * So the empty state offers to build a real four-bar loop, and explains
 * the model in one sentence while it does.
 *
 * The manual route is kept, one step down in emphasis, for people who know
 * exactly what they want and do not want four tracks they did not ask for.
 */
import { MusicNotes, Plus, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/controls";
import { AmbientField } from "@/components/guide/AmbientField";
import { strings } from "@/i18n";

export function PlaygroundEmptyState({
  onBuildStarter,
  onAddEmptyTrack,
}: {
  onBuildStarter: () => void;
  onAddEmptyTrack: () => void;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-base p-8">
      <AmbientField />

      <div className="material-glass anim-pop relative w-[min(560px,90%)] rounded-[var(--radius-panel)] p-8 text-center">
        <span
          aria-hidden
          className="anim-bob mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-accent-wash text-accent-ink"
        >
          <MusicNotes size={26} weight="duotone" />
        </span>

        <h2 className="text-lg font-semibold tracking-tight text-ink">
          {strings.playground.empty.title}
        </h2>
        <p className="anim-rise mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          {strings.playground.empty.body}
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            variant="primary"
            icon={<Sparkle size={14} weight="fill" />}
            onClick={onBuildStarter}
          >
            {strings.playground.empty.action}
          </Button>
          <Button icon={<Plus size={13} weight="bold" />} onClick={onAddEmptyTrack}>
            {strings.playground.empty.manual}
          </Button>
        </div>

        <p className="mt-4 text-[11px] text-ink-faint">{strings.playground.empty.hint}</p>
      </div>
    </div>
  );
}
