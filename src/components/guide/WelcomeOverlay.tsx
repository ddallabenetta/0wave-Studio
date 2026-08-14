"use client";

/**
 * First-run welcome.
 *
 * The old first screen was the Studio with an oscillator already open,
 * which assumes the visitor knows what an oscillator is. This asks the one
 * question a newcomer can actually answer — what do you want to do? — and
 * puts them somewhere useful with real content already in place.
 *
 * Shown once (persisted in the guide store) and reopenable from the top
 * bar. It renders nothing until the store has hydrated, so returning users
 * never see it flash.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, MusicNotes, WaveSine, X } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useGuideStore } from "@/lib/state/guide-store";
import { useUiStore } from "@/lib/state/ui-store";
import { useProjectStore } from "@/lib/state/project-store";
import { buildStarterLoop } from "@/lib/presets/starterLoop";
import { AmbientField } from "./AmbientField";
import { WaveMark } from "./WaveMark";
import { strings } from "@/i18n";

interface Path {
  id: string;
  icon: Icon;
  title: string;
  body: string;
  action: string;
  run: () => void;
}

export function WelcomeOverlay() {
  const router = useRouter();
  const hydrated = useGuideStore((s) => s.hydrated);
  const welcomeSeen = useGuideStore((s) => s.welcomeSeen);
  const dismissWelcome = useGuideStore((s) => s.dismissWelcome);
  const startTour = useGuideStore((s) => s.startTour);
  const firstCardRef = useRef<HTMLButtonElement | null>(null);

  // Wait for the audio gate to be satisfied: two stacked overlays on first
  // load would be one decision too many, and every path offered here makes
  // a sound the moment it is taken.
  const audioReady = useUiStore(
    (s) => s.audioStatus === "running" || s.audioStatus === "suspended",
  );
  const open = hydrated && !welcomeSeen && audioReady;

  useEffect(() => {
    if (!open) return;
    firstCardRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissWelcome();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismissWelcome]);

  if (!open) return null;

  const copy = strings.guide.welcome;

  const paths: Path[] = [
    {
      id: "sound",
      icon: WaveSine,
      title: copy.pathSound.title,
      body: copy.pathSound.body,
      action: copy.pathSound.action,
      run: () => {
        const ui = useUiStore.getState();
        ui.setStudioMode("synth");
        ui.setComplexity("basic");
        ui.setNewSoundDialogOpen(true);
        dismissWelcome();
        router.push("/studio");
      },
    },
    {
      id: "beat",
      icon: MusicNotes,
      title: copy.pathBeat.title,
      body: copy.pathBeat.body,
      action: copy.pathBeat.action,
      run: () => {
        // Only build when there is nothing to lose: someone who already has
        // tracks asked to go to the Playground, not to have four more.
        if (useProjectStore.getState().project.tracks.length === 0) {
          const [firstTrackId] = buildStarterLoop();
          if (firstTrackId) {
            useUiStore.getState().setSelection({ kind: "track", trackId: firstTrackId });
          }
        }
        dismissWelcome();
        router.push("/playground");
      },
    },
    {
      id: "explore",
      icon: Compass,
      title: copy.pathExplore.title,
      body: copy.pathExplore.body,
      action: copy.pathExplore.action,
      run: dismissWelcome,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="anim-fade fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-base/80 p-6 backdrop-blur-md"
    >
      <AmbientField />

      <div className="material-glass anim-pop relative w-[min(940px,94vw)] overflow-hidden rounded-[var(--radius-panel)]">
        <button
          type="button"
          onClick={dismissWelcome}
          aria-label={strings.common.close}
          className="motion-ui absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-faint hover:bg-surface hover:text-ink"
        >
          <X size={15} weight="bold" aria-hidden />
        </button>

        <header className="relative flex flex-col items-center px-10 pb-6 pt-10 text-center">
          <WaveMark className="mb-5 h-14 w-[300px]" />

          <span className="anim-rise flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-accent-ink">
            <span aria-hidden className="relative flex size-1.5">
              <span className="anim-ring absolute inset-0 rounded-full text-accent" />
              <span className="relative size-1.5 rounded-full bg-accent" />
            </span>
            {copy.eyebrow}
          </span>

          <h1
            id="welcome-title"
            className="anim-rise text-gradient mt-3 max-w-xl text-[28px] font-semibold leading-tight tracking-tight"
            style={{ animationDelay: "60ms" }}
          >
            {copy.title}
          </h1>

          <p
            className="anim-rise mt-3 max-w-xl text-sm leading-relaxed text-ink-soft"
            style={{ animationDelay: "120ms" }}
          >
            {copy.body}
          </p>
        </header>

        <div className="stagger grid grid-cols-3 gap-3 px-6 pb-5" style={{ animationDelay: "180ms" }}>
          {paths.map((path, index) => {
            const Icon = path.icon;
            return (
              <button
                key={path.id}
                ref={index === 0 ? firstCardRef : undefined}
                type="button"
                onClick={path.run}
                className="material-raised hover-lift sheen group flex flex-col items-start gap-2 rounded-[var(--radius-panel)] p-4 text-left"
                style={{ animationDelay: `${200 + index * 60}ms` }}
              >
                <span
                  aria-hidden
                  className="motion-ui flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-accent-wash text-accent-ink group-hover:bg-accent group-hover:text-accent-on"
                >
                  <Icon size={20} weight="duotone" />
                </span>
                <span className="text-sm font-semibold text-ink">{path.title}</span>
                <span className="text-[11px] leading-relaxed text-ink-soft">{path.body}</span>
                <span className="motion-ui mt-auto flex items-center gap-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-accent-ink group-hover:gap-2">
                  {path.action}
                  <ArrowRight size={11} weight="bold" aria-hidden />
                </span>
              </button>
            );
          })}
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-edge/60 px-6 py-3">
          <p className="text-[11px] text-ink-faint">{copy.footnote}</p>
          <button
            type="button"
            onClick={() => {
              dismissWelcome();
              startTour();
            }}
            className="motion-ui rounded-[var(--radius-control)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-accent-ink hover:bg-accent-wash"
          >
            {strings.guide.tour.start}
          </button>
        </footer>
      </div>
    </div>
  );
}
