"use client";

/**
 * Guided new-sound dialog.
 *
 * The blank-patch problem: an empty synthesizer is only a starting point if
 * you already know what to do with one. So this offers curated categories
 * described in plain language ("Short hits: kicks, snares, hats"), lets
 * every preset be auditioned before it is chosen, and never asks the user
 * to name or configure anything before they hear something.
 *
 * Categories are a filter strip rather than a long scroll of sections, so
 * the whole catalogue is reachable without reading all of it, and each
 * preset is a card with its own play button.
 */
import { useMemo, useState } from "react";
import { Play, Shuffle, X } from "@phosphor-icons/react";
import { Button, IconButton } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { useEngineRef } from "@/components/hooks/useEngine";
import {
  PRESET_CATALOG,
  PRESET_CATEGORY_ORDER,
  SYSTEM_PRESETS,
  createSoundFromPreset,
} from "@/lib/presets";
import { PresetSparkline } from "./PresetSparkline";
import { strings } from "@/i18n";
import type { SoundDefinition } from "@/lib/schema/types";

type Category = (typeof PRESET_CATEGORY_ORDER)[number];

const CATEGORY_LABELS: Record<string, string> = {
  percussive: strings.studio.presetCategories.percussive,
  pad: strings.studio.presetCategories.pad,
  bass: strings.studio.presetCategories.bass,
  pluck: strings.studio.presetCategories.pluck,
  lead: strings.studio.presetCategories.lead,
  texture: strings.studio.presetCategories.texture,
  blank: strings.studio.presetCategories.blank,
};

const CATEGORY_HINTS: Record<string, string> = {
  percussive: strings.studio.presetCategoryHints.percussive,
  pad: strings.studio.presetCategoryHints.pad,
  bass: strings.studio.presetCategoryHints.bass,
  pluck: strings.studio.presetCategoryHints.pluck,
  lead: strings.studio.presetCategoryHints.lead,
  texture: strings.studio.presetCategoryHints.texture,
  blank: strings.studio.presetCategoryHints.blank,
};

function categoryOf(preset: SoundDefinition): Category {
  return PRESET_CATALOG[preset.name]?.category ?? "blank";
}

export function NewSoundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engineRef = useEngineRef();
  const addSound = useProjectStore((s) => s.addSound);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);
  const setStudioMode = useUiStore((s) => s.setStudioMode);
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | "all">("all");

  /** Categories that actually have presets, in the catalogue's own order. */
  const categories = useMemo(() => {
    const present = new Set(SYSTEM_PRESETS.map(categoryOf));
    return PRESET_CATEGORY_ORDER.filter((c) => present.has(c));
  }, []);

  const visible = useMemo(
    () =>
      category === "all"
        ? SYSTEM_PRESETS
        : SYSTEM_PRESETS.filter((preset) => categoryOf(preset) === category),
    [category],
  );

  if (!open) return null;

  const audition = (preset: SoundDefinition) => {
    const engine = engineRef.current;
    if (!engine || !preset.synthState) return;
    engine.loadSound(createSoundFromPreset(preset.name));
    engine.noteOn(60, 100);
    window.setTimeout(() => engine.noteOff(60), 650);
  };

  const create = (name: string | null) => {
    const sound = createSoundFromPreset(name ?? "Init Patch");
    addSound(sound);
    setEditingSoundId(sound.id);
    setStudioMode("synth");
    engineRef.current?.loadSound(sound);
    onClose();
  };

  /** Pick one at random and select it, so "Surprise me" is still a choice
   *  the user confirms rather than an action that happens to them. */
  const surprise = () => {
    const pool = visible.filter((preset) => preset.name !== "Init Patch");
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? visible[0];
    if (!pick) return;
    setSelected(pick.name);
    audition(pick);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-sound-title"
      onClick={onClose}
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur-md"
    >
      <div
        className="material-glass anim-pop flex max-h-[86dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-panel)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-edge/70 px-5 py-4">
          <div>
            <h2 id="new-sound-title" className="text-base font-semibold tracking-tight text-ink">
              {strings.studio.newSoundTitle}
            </h2>
            <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-ink-faint">
              {strings.studio.newSoundBody}
            </p>
          </div>
          <IconButton
            aria-label={strings.common.close}
            size="sm"
            variant="ghost"
            icon={<X size={16} />}
            onClick={onClose}
          />
        </header>

        {/* Category strip. "All" first so the default is never a filtered
            view somebody has to notice they are in. */}
        <div
          role="radiogroup"
          aria-label={strings.studio.newSoundTitle}
          className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-edge/70 px-5 py-2.5"
        >
          {(["all", ...categories] as const).map((value) => {
            const active = category === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                title={value === "all" ? undefined : CATEGORY_HINTS[value]}
                onClick={() => setCategory(value)}
                className={`motion-ui rounded-full border px-3 py-1 text-[11px] ${
                  active
                    ? "border-accent bg-accent text-accent-on"
                    : "border-edge bg-surface-raised text-ink-soft hover:border-edge-strong hover:text-ink"
                }`}
              >
                {value === "all" ? strings.library.filterAll : CATEGORY_LABELS[value]}
              </button>
            );
          })}

          <button
            type="button"
            onClick={surprise}
            className="motion-ui ml-auto flex items-center gap-1.5 rounded-full border border-edge px-3 py-1 text-[11px] text-accent-ink hover:border-accent hover:bg-accent-wash"
          >
            <Shuffle size={12} weight="bold" aria-hidden />
            {strings.studio.surpriseMe}
          </button>
        </div>

        {category !== "all" && (
          <p className="shrink-0 px-5 pt-3 text-[11px] text-ink-faint">{CATEGORY_HINTS[category]}</p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <ul className="stagger grid grid-cols-2 gap-2.5">
            {visible.map((preset) => {
              const info = PRESET_CATALOG[preset.name];
              const active = selected === preset.name;
              return (
                <li key={preset.name}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(preset.name)}
                    onDoubleClick={() => create(preset.name)}
                    className={`hover-lift group flex w-full items-center gap-3 rounded-[var(--radius-panel)] border p-3 text-left ${
                      active
                        ? "border-accent bg-accent-wash shadow-[var(--halo)]"
                        : "border-edge bg-surface-raised hover:border-edge-strong"
                    }`}
                  >
                    {/* A real drawing of the patch's own waveform, not a
                        stock icon: two presets never look the same. */}
                    <PresetSparkline
                      state={preset.synthState}
                      className="h-10 w-16 shrink-0"
                      active={active}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {preset.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">
                        {info
                          ? strings.studio.presets[
                              info.description as keyof typeof strings.studio.presets
                            ]
                          : ""}
                      </span>
                    </span>

                    {/* Audition is a nested button rather than a hover
                        behaviour: hearing a sound must be deliberate. */}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${strings.import.preview}: ${preset.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        audition(preset);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        audition(preset);
                      }}
                      className="material-raised motion-ui flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-soft hover:text-accent-ink group-hover:shadow-[var(--halo)]"
                    >
                      <Play size={12} weight="fill" aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-edge/70 px-5 py-3">
          <span className="text-[11px] text-ink-faint">{strings.studio.auditionHint}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button size="sm" variant="primary" disabled={!selected} onClick={() => create(selected)}>
              {strings.studio.choosePreset}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
