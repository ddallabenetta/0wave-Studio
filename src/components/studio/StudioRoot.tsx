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
import {
  ArrowRight,
  FileArrowUp,
  Microphone,
  Scissors,
  Sparkle,
  Stack,
  WaveSine,
  Waveform,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Button, SegmentedControl } from "@/components/controls";
import { ExplainNote } from "@/components/guide/HelpTip";
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

/**
 * Studio modes carry an icon and a plain-language hint. "Sample Editor"
 * tells a newcomer nothing; "Trim, tune and loop a recorded sound" tells
 * them whether it is the thing they are looking for.
 */
const MODE_META: { value: StudioMode; label: string; hint: string; icon: Icon }[] = [
  { value: "synth", label: strings.studio.modes.synth, hint: strings.studio.modeHints.synth, icon: WaveSine },
  { value: "record", label: strings.studio.modes.record, hint: strings.studio.modeHints.record, icon: Microphone },
  { value: "import", label: strings.studio.modes.import, hint: strings.studio.modeHints.import, icon: FileArrowUp },
  { value: "sample", label: strings.studio.modes.sample, hint: strings.studio.modeHints.sample, icon: Scissors },
  { value: "library", label: strings.studio.modes.library, hint: strings.studio.modeHints.library, icon: Stack },
];

const MODES = MODE_META.map(({ value, label, hint, icon: ModeIcon }) => ({
  value,
  hint,
  label: (
    <span className="flex items-center gap-1.5">
      <ModeIcon size={13} weight="bold" aria-hidden />
      {label}
    </span>
  ),
}));

const COMPLEXITY: { value: Complexity; label: string; hint: string }[] = [
  {
    value: "basic",
    label: strings.studio.complexity.basic,
    hint: strings.studio.complexityHints.basic,
  },
  {
    value: "advanced",
    label: strings.studio.complexity.advanced,
    hint: strings.studio.complexityHints.advanced,
  },
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

  const activeMode = MODE_META.find((m) => m.value === mode);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-edge bg-surface px-3 py-2">
        <div className="flex items-center gap-3">
          <SegmentedControl label="Studio mode" options={MODES} value={mode} onChange={setMode} size="sm" />
          {mode === "synth" && (
            <>
              <div className="h-5 w-px bg-edge" aria-hidden />
              <SegmentedControl
                label="Complexity"
                options={COMPLEXITY}
                value={complexity}
                onChange={setComplexity}
                size="sm"
              />
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {sound && (
              <label className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  {strings.studio.editingLabel}
                </span>
                <input
                  aria-label={strings.common.name}
                  value={sound.name}
                  onChange={(e) => renameSound(sound.id, e.target.value)}
                  className="material-sunken motion-ui w-48 rounded-[var(--radius-control)] px-2 py-1 text-xs text-ink outline-none focus:shadow-[var(--halo)]"
                />
              </label>
            )}
            <Button size="sm" onClick={() => setNewSoundDialogOpen(true)}>
              {strings.studio.newSound}
            </Button>
            {sound && (
              <Button
                size="sm"
                title={inUse ? strings.studio.duplicateBeforeEditingHint : undefined}
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

        {/* One line saying what this mode is for. Disappears with hints. */}
        {activeMode && (
          <ExplainNote key={mode} className="self-start">
            {activeMode.hint}
            {mode === "synth" && complexity === "basic" && ` — ${strings.studio.simpleIntro}`}
          </ExplainNote>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {mode !== "library" && (
          <aside
            data-tour="library"
            className="w-[248px] shrink-0 border-r border-edge bg-base p-2"
          >
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
          {showKeyboard && (
            <div data-tour="hear">
              <Keyboard />
            </div>
          )}
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
