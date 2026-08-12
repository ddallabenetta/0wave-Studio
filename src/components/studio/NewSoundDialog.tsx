"use client";

/**
 * Guided new-sound dialog. Instead of a blank patch, the user picks a
 * starting point from curated categories (Kick, Snare, Pad, Bass, …), can
 * audition each one, and creates a fresh editable user sound from it.
 */
import { useMemo, useState } from "react";
import { Play, X } from "@phosphor-icons/react";
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
import { strings } from "@/i18n";
import type { SoundDefinition } from "@/lib/schema/types";

const CATEGORY_LABELS: Record<string, string> = {
  percussive: strings.studio.presetCategories.percussive,
  pad: strings.studio.presetCategories.pad,
  bass: strings.studio.presetCategories.bass,
  pluck: strings.studio.presetCategories.pluck,
  lead: strings.studio.presetCategories.lead,
  texture: strings.studio.presetCategories.texture,
  blank: strings.studio.presetCategories.blank,
};

export function NewSoundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engineRef = useEngineRef();
  const addSound = useProjectStore((s) => s.addSound);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);
  const setStudioMode = useUiStore((s) => s.setStudioMode);
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byCategory = new Map<string, SoundDefinition[]>();
    for (const preset of SYSTEM_PRESETS) {
      const info = PRESET_CATALOG[preset.name];
      const category = info?.category ?? "blank";
      const list = byCategory.get(category) ?? [];
      list.push(preset);
      byCategory.set(category, list);
    }
    return PRESET_CATEGORY_ORDER.map((category) => ({
      category,
      presets: byCategory.get(category) ?? [],
    })).filter((g) => g.presets.length > 0);
  }, []);

  if (!open) return null;

  const audition = (preset: SoundDefinition) => {
    const engine = engineRef.current;
    if (!engine || !preset.synthState) return;
    const clone = createSoundFromPreset(preset.name);
    engine.loadSound(clone);
    engine.noteOn(60, 100);
    window.setTimeout(() => engine.noteOff(60), 650);
  };

  const create = () => {
    const sound = createSoundFromPreset(selected ?? "Init Patch");
    addSound(sound);
    setEditingSoundId(sound.id);
    setStudioMode("synth");
    engineRef.current?.loadSound(sound);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-sound-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/85 p-4 backdrop-blur-[2px]"
    >
      <div
        className="material-raised flex max-h-[85dvh] w-full max-w-lg flex-col rounded-[var(--radius-panel)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3">
          <div>
            <h2 id="new-sound-title" className="font-mono text-[11px] uppercase tracking-wider text-ink">
              {strings.studio.newSoundTitle}
            </h2>
            <p className="text-[11px] text-ink-faint">{strings.studio.newSoundBody}</p>
          </div>
          <IconButton
            aria-label={strings.common.close}
            size="sm"
            variant="ghost"
            icon={<X size={16} />}
            onClick={onClose}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {groups.map(({ category, presets }) => (
            <section key={category} className="mb-4">
              <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {CATEGORY_LABELS[category]}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {presets.map((preset) => {
                  const info = PRESET_CATALOG[preset.name];
                  const active = selected === preset.name;
                  return (
                    <li
                      key={preset.name}
                      className={`group flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-2.5 py-2 transition-colors ${
                        active
                          ? "border-accent bg-accent-wash"
                          : "border-edge bg-surface hover:border-edge-strong"
                      }`}
                      onClick={() => setSelected(preset.name)}
                    >
                      <button
                        type="button"
                        aria-label={`${strings.import.preview}: ${preset.name}`}
                        className="material-raised motion-ui flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-ink-soft hover:text-ink"
                        onClick={(e) => {
                          e.stopPropagation();
                          audition(preset);
                        }}
                      >
                        <Play size={12} weight="fill" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-ink">{preset.name}</div>
                        <div className="truncate text-[10px] text-ink-faint">
                          {info
                            ? strings.studio.presets[
                                info.description as keyof typeof strings.studio.presets
                              ]
                            : ""}
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="new-sound-preset"
                        checked={active}
                        onChange={() => setSelected(preset.name)}
                        aria-label={preset.name}
                        className="accent-[var(--accent)]"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-edge px-4 py-3">
          <span className="font-mono text-[10px] text-ink-faint">{strings.studio.spaceHint}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button size="sm" variant="primary" disabled={!selected} onClick={create}>
              {strings.studio.choosePreset}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
