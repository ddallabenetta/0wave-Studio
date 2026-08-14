"use client";

/**
 * Sound library: the Studio's browser for every sound in the project, and
 * the entry point for creating new ones. Also mounted in the Playground's
 * right panel.
 *
 * A row is one click target: the whole row selects the sound, not just its
 * name. Everything a single sound can do beyond that — rename, duplicate,
 * send to the Playground, delete — lives in the row's own menu, and the "+"
 * at the foot of the list asks which kind of sound is being added (built,
 * recorded, or imported).
 */
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MagnifyingGlass,
  Play,
  Plus,
  ArrowRight,
  Copy,
  DotsThreeVertical,
  FileArrowUp,
  Microphone,
  PencilSimple,
  Trash,
  WaveSine,
} from "@phosphor-icons/react";
import { Button, IconButton, MenuButton, SegmentedControl } from "@/components/controls";
import type { MenuAction } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { useEngineRef } from "@/components/hooks/useEngine";
import { loadSampleBuffer } from "./sampleBuffers";
import { Panel } from "./Panel";
import { PresetSparkline } from "./PresetSparkline";
import { strings } from "@/i18n";
import type { SoundDefinition } from "@/lib/schema/types";
import type { StudioMode } from "@/lib/state/ui-store";

type Filter = "all" | "synth" | "sample";

const FILTERS = [
  { value: "all" as const, label: strings.library.filterAll },
  { value: "synth" as const, label: strings.library.filterSynth },
  { value: "sample" as const, label: strings.library.filterSample },
];

export function SoundLibraryPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const sounds = useProjectStore((s) => s.project.sounds);
  const assets = useProjectStore((s) => s.project.assets);
  const duplicateSound = useProjectStore((s) => s.duplicateSound);
  const renameSound = useProjectStore((s) => s.renameSound);
  const deleteSound = useProjectStore((s) => s.deleteSound);
  const tracks = useProjectStore((s) => s.project.tracks);
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

  /** Capture and import happen in the Studio's central view. */
  const openInStudio = (mode: StudioMode) => {
    setStudioMode(mode);
    if (pathname !== "/studio") router.push("/studio");
  };

  const durationFor = (sound: SoundDefinition) => {
    if (sound.type !== "sample") return null;
    const asset = assets.find((a) => a.id === sound.sampleState?.assetId);
    return asset ? `${asset.duration.toFixed(2)}s` : null;
  };

  const addActions: MenuAction[] = [
    {
      id: "synth",
      label: strings.library.addSound,
      icon: <WaveSine size={14} aria-hidden />,
      onSelect: () => setNewSoundDialogOpen(true),
    },
    {
      id: "record",
      label: strings.library.addRecording,
      icon: <Microphone size={14} aria-hidden />,
      onSelect: () => openInStudio("record"),
    },
    {
      id: "import",
      label: strings.library.addSample,
      icon: <FileArrowUp size={14} aria-hidden />,
      onSelect: () => openInStudio("import"),
    },
  ];

  const actionsFor = (sound: SoundDefinition): MenuAction[] => {
    const inUse = tracks.some((t) => t.soundId === sound.id);
    return [
      {
        id: "rename",
        label: strings.library.rename,
        icon: <PencilSimple size={14} aria-hidden />,
        onSelect: () => setRenamingId(sound.id),
      },
      {
        id: "duplicate",
        // A sound used by a track is shared, not copied (ADR-005): the copy
        // is how you edit it without changing that track.
        label: inUse ? strings.studio.duplicateBeforeEditing : strings.library.duplicate,
        title: inUse ? strings.studio.duplicateBeforeEditingHint : undefined,
        icon: <Copy size={14} aria-hidden />,
        onSelect: () => {
          const id = duplicateSound(sound.id);
          if (id) setEditingSoundId(id);
        },
      },
      {
        id: "playground",
        label: strings.studio.useInPlayground,
        icon: <ArrowRight size={14} aria-hidden />,
        onSelect: () => sendToPlayground(sound),
      },
      {
        id: "delete",
        label: strings.library.delete,
        icon: <Trash size={14} aria-hidden />,
        danger: true,
        onSelect: () => {
          if (window.confirm(`${strings.library.delete}: ${sound.name}`)) {
            deleteSound(sound.id);
            if (editingSoundId === sound.id) setEditingSoundId(null);
          }
        },
      },
    ];
  };

  return (
    <Panel
      title={strings.library.title}
      className="h-full"
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
        {visible.length === 0 && (
          <li className="anim-rise flex flex-col items-center gap-3 p-6 text-center">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-full bg-accent-wash text-accent-ink"
            >
              <MagnifyingGlass size={18} weight="duotone" />
            </span>
            <p className="text-[11px] leading-relaxed text-ink-faint">{strings.library.empty}</p>
            <Button size="sm" variant="primary" onClick={() => setNewSoundDialogOpen(true)}>
              {strings.library.newSound}
            </Button>
          </li>
        )}
        {visible.map((sound) => {
          const active = sound.id === editingSoundId;
          const renaming = renamingId === sound.id;
          return (
            <li
              key={sound.id}
              className={`motion-ui relative border-b border-edge px-2 py-2 ${
                active ? "bg-accent-wash" : "hover:bg-surface-raised/50"
              }`}
            >
              {/* The whole row opens the sound. It is one stretched button
                  behind the content, so every part of the row that is not
                  itself a control is a click target — the name alone is far
                  too small a one. */}
              {!renaming && (
                <button
                  type="button"
                  onClick={() => select(sound)}
                  aria-current={active ? "true" : undefined}
                  className="absolute inset-0 z-0 cursor-pointer rounded-[var(--radius-control)] outline-none focus-visible:shadow-[var(--halo)]"
                >
                  <span className="sr-only">{sound.name}</span>
                </button>
              )}

              {/* Content sits above the stretched button but lets pointer
                  events through, so only the real controls intercept them. */}
              <div className="pointer-events-none relative z-10">
                {/* Accent spine on the open sound: readable at a glance down a
                    long list, and not carried by colour alone (the row is also
                    washed and its name is marked aria-current). */}
                <span
                  aria-hidden
                  className="motion-ui absolute -inset-y-1 -left-2 w-[3px] rounded-full bg-accent"
                  style={{ opacity: active ? 1 : 0, transform: active ? "none" : "scaleY(0.3)" }}
                />
                <div className="flex items-center gap-1.5">
                  {/* Thumbnail of the patch itself, so the list can be scanned
                      by shape as well as by name. */}
                  {sound.type === "synth" && sound.synthState && (
                    <PresetSparkline
                      state={sound.synthState}
                      active={active}
                      className="h-6 w-9 shrink-0"
                    />
                  )}
                  {renaming ? (
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
                      className="material-sunken pointer-events-auto w-full rounded-[var(--radius-control)] px-1 py-0.5 text-xs text-ink outline-none"
                    />
                  ) : (
                    <span className="flex-1 truncate text-xs font-medium text-ink">{sound.name}</span>
                  )}
                  <IconButton
                    aria-label={`${strings.import.preview}: ${sound.name}`}
                    title={strings.import.preview}
                    size="sm"
                    variant="ghost"
                    className="pointer-events-auto"
                    icon={<Play size={13} weight="fill" />}
                    onClick={() => void preview(sound)}
                  />
                  <MenuButton
                    label={`${strings.library.actions}: ${sound.name}`}
                    menuLabel={sound.name}
                    className="pointer-events-auto"
                    icon={<DotsThreeVertical size={14} weight="bold" />}
                    actions={actionsFor(sound)}
                  />
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-ink-faint">
                  <span>{sound.type === "synth" ? strings.library.typeSynth : strings.library.typeSample}</span>
                  {sound.metadata.origin === "system-preset" && <span>{strings.library.preset}</span>}
                  {durationFor(sound) && <span>{durationFor(sound)}</span>}
                  <span>{sound.metadata.syncState === "cloud" ? strings.library.cloud : strings.library.local}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* One way in for every kind of sound: built, recorded, or imported. */}
      <div className="shrink-0 border-t border-edge p-2">
        <MenuButton
          label={strings.library.add}
          align="start"
          variant="default"
          icon={<Plus size={13} weight="bold" />}
          className="w-full"
          actions={addActions}
        >
          {strings.library.add}
        </MenuButton>
      </div>
    </Panel>
  );
}
