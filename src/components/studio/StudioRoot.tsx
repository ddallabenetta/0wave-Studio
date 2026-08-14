"use client";

/**
 * Studio: the environment where sounds are created and prepared.
 *
 * Modes (Synth / Record / Import / Sample Editor / Sound Library) are internal
 * to the Studio, never top-level destinations. The composition timeline lives
 * in the Playground, not here.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkle, Waveform } from "@phosphor-icons/react";
import { Button, SegmentedControl } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { useEngineRef } from "@/components/hooks/useEngine";
import { SynthEditor } from "./SynthEditor";
import { SampleEditor } from "./SampleEditor";
import { RecordPanel } from "./RecordPanel";
import { ImportPanel } from "./ImportPanel";
import { SoundLibraryPanel } from "./SoundLibraryPanel";
import { NewSoundDialog } from "./NewSoundDialog";
import { Analyzer } from "./Analyzer";
import { Keyboard } from "./Keyboard";
import { RightPanel } from "./RightPanel";
import { AIConnectorPanel } from "@/components/ai/AIConnectorPanel";
import { strings } from "@/i18n";
import type { StudioMode, Complexity } from "@/lib/state/ui-store";

const MODES: { value: StudioMode; label: string }[] = [
  { value: "synth", label: strings.studio.modes.synth },
  { value: "record", label: strings.studio.modes.record },
  { value: "import", label: strings.studio.modes.import },
  { value: "sample", label: strings.studio.modes.sample },
  { value: "library", label: strings.studio.modes.library },
];

const COMPLEXITY: { value: Complexity; label: string }[] = [
  { value: "basic", label: strings.studio.complexity.basic },
  { value: "advanced", label: strings.studio.complexity.advanced },
];

export function StudioRoot() {
  const router = useRouter();
  const mode = useUiStore((s) => s.studioMode);
  const setMode = useUiStore((s) => s.setStudioMode);
  const complexity = useUiStore((s) => s.complexity);
  const setComplexity = useUiStore((s) => s.setComplexity);
  const editingSoundId = useUiStore((s) => s.editingSoundId);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);
  const setPendingPlaygroundSound = useUiStore((s) => s.setPendingPlaygroundSound);
  const audioStatus = useUiStore((s) => s.audioStatus);
  const studioRightTab = useUiStore((s) => s.studioRightTab);
  const setStudioRightTab = useUiStore((s) => s.setStudioRightTab);
  const studioRightOpen = useUiStore((s) => s.studioRightOpen);
  const setStudioRightOpen = useUiStore((s) => s.setStudioRightOpen);

  const sounds = useProjectStore((s) => s.project.sounds);
  const tracks = useProjectStore((s) => s.project.tracks);
  const duplicateSound = useProjectStore((s) => s.duplicateSound);
  const renameSound = useProjectStore((s) => s.renameSound);
  const engineRef = useEngineRef();

  const sound = sounds.find((s) => s.id === editingSoundId);
  const inUse = Boolean(sound && tracks.some((t) => t.soundId === sound.id));
  const setNewSoundDialogOpen = useUiStore((s) => s.setNewSoundDialogOpen);
  const newSoundDialogOpen = useUiStore((s) => s.newSoundDialogOpen);

  /* Select a sound on first paint so the editor is never empty. */
  useEffect(() => {
    if (editingSoundId && sounds.some((s) => s.id === editingSoundId)) return;
    const first = sounds[0];
    if (first) setEditingSoundId(first.id);
  }, [editingSoundId, sounds, setEditingSoundId]);

  /* Space bar previews the edited sound. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const engine = engineRef.current;
      if (!engine || useUiStore.getState().audioStatus !== "running") return;
      const current = useProjectStore
        .getState()
        .project.sounds.find((s) => s.id === editingSoundId);
      if (!current) return;
      event.preventDefault();
      engine.noteOn(60, 100);
      window.setTimeout(() => engine.noteOff(60), 700);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingSoundId, engineRef]);

  /* Keep the engine's active patch in sync with the edited sound.
   * Only the identity of the sound triggers a reload: a full reload calls
   * allNotesOff, so depending on the sound object itself would cut every held
   * note on each knob turn. Live tweaks go through setParameter instead, so
   * the current state is read imperatively here. */
  useEffect(() => {
    if (!editingSoundId || audioStatus !== "running") return;
    const current = useProjectStore
      .getState()
      .project.sounds.find((s) => s.id === editingSoundId);
    if (current) engineRef.current?.loadSound(current);
  }, [editingSoundId, audioStatus, engineRef]);

  const showKeyboard = mode === "synth" || mode === "sample";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-edge bg-surface px-3 py-2">
        <SegmentedControl label="Studio mode" options={MODES} value={mode} onChange={setMode} size="sm" />
        {mode === "synth" && (
          <SegmentedControl
            label="Complexity"
            options={COMPLEXITY}
            value={complexity}
            onChange={setComplexity}
            size="sm"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {sound && (
            <input
              aria-label={strings.common.name}
              value={sound.name}
              onChange={(e) => renameSound(sound.id, e.target.value)}
              className="material-sunken w-48 rounded-[var(--radius-control)] px-2 py-1 text-xs text-ink outline-none"
            />
          )}
          <Button size="sm" onClick={() => setNewSoundDialogOpen(true)}>
            {strings.studio.newSound}
          </Button>
          {sound && (
            <Button
              size="sm"
              onClick={() => {
                const id = duplicateSound(sound.id);
                if (id) setEditingSoundId(id);
              }}
            >
              {inUse ? strings.studio.duplicateBeforeEditing : strings.studio.saveAsNew}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            icon={<ArrowRight size={14} weight="bold" />}
            disabled={!sound}
            onClick={() => {
              if (!sound) return;
              setPendingPlaygroundSound(sound.id);
              router.push("/playground");
            }}
          >
            {strings.studio.useInPlayground}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {mode !== "library" && (
          <aside className="w-[248px] shrink-0 border-r border-edge bg-base p-2">
            <SoundLibraryPanel />
          </aside>
        )}

        <div className="flex min-h-0 flex-1 flex-col bg-base">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {mode === "synth" && <SynthEditor soundId={editingSoundId} />}
            {mode === "sample" && <SampleEditor soundId={editingSoundId} />}
            {mode === "record" && <RecordPanel />}
            {mode === "import" && <ImportPanel />}
            {mode === "library" && <SoundLibraryPanel variant="full" />}
          </div>
          {showKeyboard && <Keyboard />}
        </div>

        <RightPanel
          widthClass="w-[300px]"
          tabs={[
            {
              value: "analyzer",
              label: strings.rightPanel.analyzer,
              icon: <Waveform size={14} weight="bold" />,
              content: <Analyzer />,
            },
            {
              value: "ai",
              label: strings.ai.title,
              icon: <Sparkle size={14} weight="bold" />,
              // Keyed by target so switching sounds resets connector state.
              content: (
                <AIConnectorPanel
                  key={editingSoundId ?? "none"}
                  soundId={editingSoundId}
                  inPlayground={false}
                />
              ),
            },
          ]}
          activeTab={studioRightTab}
          onTabChange={(tab) => {
            setStudioRightTab(tab);
            setStudioRightOpen(true);
          }}
          open={studioRightOpen}
          onOpenChange={setStudioRightOpen}
        />
      </div>

      <NewSoundDialog open={newSoundDialogOpen} onClose={() => setNewSoundDialogOpen(false)} />
    </div>
  );
}
