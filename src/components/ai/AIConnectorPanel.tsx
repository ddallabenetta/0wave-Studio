"use client";

/**
 * AIConnectorPanel: the AI Sound Connector body (text-to-patch).
 *
 * Targets a single sound, resolved by the host section (Studio: the sound
 * open in the editor; Playground: the selected track's sound) and passed in:
 * the resolution differs per route and a route switch must not leak a stale
 * target across sections. Everything else is read from the stores.
 *
 * Flow (docs/BACKLOG-AI-CONNECTOR.md): prompt -> Generate -> proposal card
 * with rationale, usage, parameter diff and action buttons. Preview loads the
 * merged patch into the engine WITHOUT committing (a cloned sound object,
 * never the store's); Apply is one undoable store mutation and then reloads
 * the engine with the committed sound; Revert reloads the current sound; A/B
 * alternates the engine between current and proposal. On failure: localized
 * error card (by code), the original prompt, Retry when retryable, and
 * manual creation (Studio: switch to synth mode; Playground: hint).
 */
import { useState } from "react";
import { Button, Spinner } from "@/components/controls";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { mergePatch } from "@/lib/state/mergePatch";
import { Panel } from "@/components/studio/Panel";
import { PatchDiff } from "./PatchDiff";
import { usePatchRequest } from "./usePatchRequest";
import { strings } from "@/i18n";
import type { ID, SoundDefinition } from "@/lib/schema/types";

/** Audition note: middle C, ~0.7 s — same gesture as the Studio space bar. */
const AUDITION_NOTE = 60;
const AUDITION_VELOCITY = 100;
const AUDITION_MS = 700;

export interface AIConnectorPanelProps {
  /** Target sound id; null shows the "no target" hint. */
  soundId: ID | null;
  /** True when hosted in the Playground (manual-creation affordance differs). */
  inPlayground: boolean;
}

export function AIConnectorPanel({ soundId, inPlayground }: AIConnectorPanelProps) {
  const sounds = useProjectStore((s) => s.project.sounds);
  const applyPatchToSound = useProjectStore((s) => s.applyPatchToSound);
  const setStudioMode = useUiStore((s) => s.setStudioMode);
  const engineRef = useEngineRef();

  const [prompt, setPrompt] = useState("");
  const [abMode, setAbMode] = useState(false);
  const { state, submit } = usePatchRequest();

  const target = soundId ? sounds.find((sound) => sound.id === soundId) : undefined;
  const currentState = target?.synthState;
  const response = state.status === "success" ? state.response : null;
  /** The merged patch used by both the diff preview and the A/B side. */
  const merged = response && currentState ? mergePatch(currentState, response.proposal.patch) : null;

  /** Fresh copy of the target sound from the store (never a render capture). */
  const readCurrent = (): SoundDefinition | undefined =>
    useProjectStore.getState().project.sounds.find((sound) => sound.id === soundId);

  /** Short note so a preview is audible without touching the keyboard. */
  const audition = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.noteOn(AUDITION_NOTE, AUDITION_VELOCITY);
    window.setTimeout(() => engine.noteOff(AUDITION_NOTE), AUDITION_MS);
  };

  /** Load the proposal into the engine without committing anything. */
  const previewProposal = () => {
    const current = readCurrent();
    if (!current || !merged) return;
    // Cloned sound: the engine gets a standalone object; the store's sound
    // and the render-time object are never touched (no AudioNodes in state).
    const preview: SoundDefinition = { ...structuredClone(current), synthState: merged };
    engineRef.current?.loadSound(preview);
    audition();
  };

  /** Reload the committed sound so the engine matches the store again. */
  const revertToCurrent = () => {
    const current = readCurrent();
    if (!current) return;
    engineRef.current?.loadSound(current);
    audition();
  };

  /** One undoable store mutation, then reload the engine with the result. */
  const apply = () => {
    if (!response || !target) return;
    applyPatchToSound(target.id, response.proposal.patch);
    // The engine only auto-reloads when the edited sound's id changes, so a
    // patch application must reload explicitly to stop previewing.
    const updated = readCurrent();
    if (updated) engineRef.current?.loadSound(updated);
    audition();
  };

  const generate = () => {
    const current = readCurrent();
    if (!current?.synthState) return;
    submit(prompt.trim(), current.synthState);
  };

  const enterAB = () => {
    setAbMode(true);
    revertToCurrent(); // side A first; B is one click away
  };

  if (!target || !currentState) {
    return (
      <Panel title={strings.ai.title} className="shrink-0">
        <p className="p-4 text-xs leading-relaxed text-ink-faint">
          {target ? strings.ai.synthOnlyHint : strings.ai.noTargetHint}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={strings.ai.title} className="shrink-0">
      <div className="flex flex-col gap-2 p-3">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          aria-label={strings.ai.promptPlaceholder}
          placeholder={strings.ai.promptPlaceholder}
          className="material-sunken min-h-20 w-full resize-y rounded-[var(--radius-control)] p-2 text-xs leading-relaxed text-ink outline-none placeholder:text-ink-faint"
        />
        <Button
          size="sm"
          variant="primary"
          loading={state.status === "loading"}
          disabled={prompt.trim() === ""}
          onClick={generate}
        >
          {strings.ai.generate}
        </Button>

        {state.status === "loading" && (
          <p className="flex items-center gap-1.5 text-[10px] text-ink-faint">
            <Spinner /> {strings.ai.generating}
          </p>
        )}

        {state.status === "error" && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-error bg-surface p-2">
            <p className="text-xs leading-relaxed text-ink">
              {strings.ai.errors[state.error.code] ?? state.error.message}
            </p>
            <div className="material-sunken rounded-[var(--radius-control)] p-2">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
                {strings.ai.originalPrompt}
              </p>
              <p className="break-words font-mono text-[10px] leading-relaxed text-ink">
                {state.prompt}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {state.error.retryable && (
                <Button size="sm" onClick={generate}>
                  {strings.ai.retry}
                </Button>
              )}
              {inPlayground ? (
                <p className="text-[10px] text-ink-faint">{strings.ai.manualCreationHint}</p>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setStudioMode("synth")}>
                  {strings.ai.createManually}
                </Button>
              )}
            </div>
          </div>
        )}

        {response && merged && (
          <div className="material-raised flex flex-col gap-2 rounded-[var(--radius-panel)] p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {strings.ai.rationale}
              </h4>
              <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                {strings.ai.usageTokens.replace("{count}", String(response.usage.totalTokens))} ·{" "}
                {strings.ai.usageLatency.replace("{latency}", String(response.usage.latencyMs))}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-soft">{response.proposal.rationale}</p>

            <PatchDiff
              current={currentState}
              proposal={response.proposal.patch}
              rejectedGroups={response.rejectedGroups}
            />
            {response.rejectedGroups.length > 0 && (
              <p className="text-[10px] text-warning">{strings.ai.invalidGroupsHint}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {abMode ? (
                <>
                  <Button size="sm" onClick={revertToCurrent}>
                    {strings.ai.compareA}
                  </Button>
                  <Button size="sm" onClick={previewProposal}>
                    {strings.ai.compareB}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={previewProposal}>
                    {strings.ai.preview}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={revertToCurrent}>
                    {strings.ai.revert}
                  </Button>
                </>
              )}
              <Button size="sm" variant="primary" onClick={apply}>
                {strings.ai.apply}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={abMode ? "text-accent-ink" : undefined}
                onClick={() => {
                  if (abMode) setAbMode(false);
                  else enterAB();
                }}
              >
                {strings.ai.compareAB}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
