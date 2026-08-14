"use client";

/**
 * Studio: the environment where sounds are created and prepared.
 *
 * There is no mode bar. What the central view shows follows from what is
 * selected: a synth sound opens the synth editor, a sample opens the sample
 * editor, and recording or importing is a temporary state entered from the
 * library's "+" and left as soon as the new sound is saved. The library is
 * the left panel, and everything a single sound can do lives in its row's
 * menu. The composition timeline lives in the Playground, not here.
 */
import { useEffect } from "react";
import { Sparkle, Waveform } from "@phosphor-icons/react";
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

export function StudioRoot() {
  const mode = useUiStore((s) => s.studioMode);
  const setMode = useUiStore((s) => s.setStudioMode);
  const editingSoundId = useUiStore((s) => s.editingSoundId);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);
  const audioStatus = useUiStore((s) => s.audioStatus);
  const studioRightTab = useUiStore((s) => s.studioRightTab);
  const setStudioRightTab = useUiStore((s) => s.setStudioRightTab);
  const studioRightOpen = useUiStore((s) => s.studioRightOpen);
  const setStudioRightOpen = useUiStore((s) => s.setStudioRightOpen);

  const sounds = useProjectStore((s) => s.project.sounds);
  const engineRef = useEngineRef();

  const sound = sounds.find((s) => s.id === editingSoundId);
  const newSoundDialogOpen = useUiStore((s) => s.newSoundDialogOpen);
  const setNewSoundDialogOpen = useUiStore((s) => s.setNewSoundDialogOpen);

  /* Select a sound on first paint so the editor is never empty. */
  useEffect(() => {
    if (editingSoundId && sounds.some((s) => s.id === editingSoundId)) return;
    const first = sounds[0];
    if (first) setEditingSoundId(first.id);
  }, [editingSoundId, sounds, setEditingSoundId]);

  /* The editor follows the open sound: a sample can never be shown in the
   * synth editor, whichever route selected it. Capture and import are
   * deliberate states of their own and are left untouched. */
  useEffect(() => {
    if (mode === "record" || mode === "import") return;
    const next = sound?.type === "sample" ? "sample" : "synth";
    if (next !== mode) setMode(next);
  }, [sound?.type, mode, setMode]);

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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          data-tour="library"
          className="w-[248px] shrink-0 border-r border-edge bg-base p-2"
        >
          <SoundLibraryPanel />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-base">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {mode === "synth" && <SynthEditor soundId={editingSoundId} />}
            {mode === "sample" && <SampleEditor soundId={editingSoundId} />}
            {mode === "record" && <RecordPanel />}
            {mode === "import" && <ImportPanel />}
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
