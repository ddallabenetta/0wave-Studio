"use client";

/**
 * Sound library: the Studio's internal browser for every sound in the
 * project. Also reachable full width as the "library" Studio mode.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, Play, ArrowRight, Copy, PencilSimple, Trash } from "@phosphor-icons/react";
import { Button, IconButton, SegmentedControl } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { useEngineRef } from "@/components/hooks/useEngine";
import { loadSampleBuffer } from "./sampleBuffers";
import { Panel } from "./Panel";
import { strings } from "@/i18n";
import type { SoundDefinition } from "@/lib/schema/types";

type Filter = "all" | "synth" | "sample";

const FILTERS = [
  { value: "all" as const, label: strings.library.filterAll },
  { value: "synth" as const, label: strings.library.filterSynth },
  { value: "sample" as const, label: strings.library.filterSample },
];

export function SoundLibraryPanel({ variant = "panel" }: { variant?: "panel" | "full" }) {
  const router = useRouter();
  const sounds = useProjectStore((s) => s.project.sounds);
  const assets = useProjectStore((s) => s.project.assets);
  const duplicateSound = useProjectStore((s) => s.duplicateSound);
  const renameSound = useProjectStore((s) => s.renameSound);
  const deleteSound = useProjectStore((s) => s.deleteSound);
  const editingSoundId = useUiStore((s) => s.editingSoundId);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);
  const setStudioMode = useUiStore((s) => s.setStudioMode);
  const setPendingPlaygroundSound = useUiStore((s) => s.setPendingPlaygroundSound);
  const setNewSoundDialogOpen = useUiStore((s) => s.setNewSoundDialogOpen);
  const engineRef = useEngineRef();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sounds.filter(
      (sound) =>
        (filter === "all" || sound.type === filter) &&
        (q === "" || sound.name.toLowerCase().includes(q)),
    );
  }, [sounds, query, filter]);

  const select = (sound: SoundDefinition) => {
    setEditingSoundId(sound.id);
    setStudioMode(sound.type === "sample" ? "sample" : "synth");
    engineRef.current?.loadSound(sound);
  };

  const preview = async (sound: SoundDefinition) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (sound.type === "synth") {
      engine.loadSound(sound);
      engine.noteOn(60, 100);
      window.setTimeout(() => engine.noteOff(60), 500);
      return;
    }
    const asset = assets.find((a) => a.id === sound.sampleState?.assetId);
    if (!asset) return;
    const buffer = await loadSampleBuffer(engine, asset);
    if (buffer) engine.playSample(sound, buffer, sound.sampleState?.rootNote ?? 60, 100);
  };

  const sendToPlayground = (sound: SoundDefinition) => {
    setPendingPlaygroundSound(sound.id);
    router.push("/playground");
  };

  const durationFor = (sound: SoundDefinition) => {
    if (sound.type !== "sample") return null;
    const asset = assets.find((a) => a.id === sound.sampleState?.assetId);
    return asset ? `${asset.duration.toFixed(2)}s` : null;
  };

  return (
    <Panel
      title={strings.library.title}
      className={variant === "full" ? "m-3" : "h-full"}
      actions={
        <Button size="sm" variant="ghost" onClick={() => setNewSoundDialogOpen(true)}>
          {strings.library.newSound}
        </Button>
      }
      contentClassName="flex flex-col"
    >
      <div className="flex flex-col gap-2 border-b border-edge p-2">
        <label className="material-sunken flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1">
          <MagnifyingGlass size={14} aria-hidden className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={strings.library.search}
            aria-label={strings.library.search}
            className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-ink-faint"
          />
        </label>
        <SegmentedControl label={strings.library.filterAll} options={FILTERS} value={filter} size="sm" onChange={setFilter} />
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && <li className="p-4 text-xs leading-relaxed text-ink-faint">{strings.library.empty}</li>}
        {visible.map((sound) => {
          const active = sound.id === editingSoundId;
          return (
            <li
              key={sound.id}
              className={`border-b border-edge px-2 py-2 ${active ? "bg-accent-wash" : ""}`}
            >
              <div className="flex items-center gap-1">
                {renamingId === sound.id ? (
                  <input
                    autoFocus
                    defaultValue={sound.name}
                    aria-label={strings.library.rename}
                    onBlur={(e) => {
                      renameSound(sound.id, e.target.value);
                      setRenamingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="material-sunken w-full rounded-[var(--radius-control)] px-1 py-0.5 text-xs text-ink outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => select(sound)}
                    aria-current={active ? "true" : undefined}
                    className="flex-1 truncate text-left text-xs font-medium text-ink"
                  >
                    {sound.name}
                  </button>
                )}
                <IconButton
                  aria-label={strings.import.preview}
                  size="sm"
                  variant="ghost"
                  icon={<Play size={13} weight="fill" />}
                  onClick={() => void preview(sound)}
                />
                <IconButton
                  aria-label={strings.studio.useInPlayground}
                  size="sm"
                  variant="ghost"
                  icon={<ArrowRight size={13} weight="bold" />}
                  onClick={() => sendToPlayground(sound)}
                />
              </div>
              <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-ink-faint">
                <span>{sound.type === "synth" ? strings.library.typeSynth : strings.library.typeSample}</span>
                {sound.metadata.origin === "system-preset" && <span>{strings.library.preset}</span>}
                {durationFor(sound) && <span>{durationFor(sound)}</span>}
                <span>{sound.metadata.syncState === "cloud" ? strings.library.cloud : strings.library.local}</span>
                <span className="ml-auto flex gap-0.5">
                  <IconButton
                    aria-label={strings.library.rename}
                    size="sm"
                    variant="ghost"
                    icon={<PencilSimple size={12} />}
                    onClick={() => setRenamingId(sound.id)}
                  />
                  <IconButton
                    aria-label={strings.library.duplicate}
                    size="sm"
                    variant="ghost"
                    icon={<Copy size={12} />}
                    onClick={() => {
                      const id = duplicateSound(sound.id);
                      if (id) setEditingSoundId(id);
                    }}
                  />
                  <IconButton
                    aria-label={strings.library.delete}
                    size="sm"
                    variant="ghost"
                    icon={<Trash size={12} />}
                    onClick={() => {
                      if (window.confirm(`${strings.library.delete}: ${sound.name}`)) {
                        deleteSound(sound.id);
                        if (editingSoundId === sound.id) setEditingSoundId(null);
                      }
                    }}
                  />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
