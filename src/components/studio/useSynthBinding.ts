"use client";

/**
 * Binds a Studio control to both the audio engine (immediate, audio-rate safe)
 * and the project store (persisted, coalesced as non-undoable).
 *
 * Paths are dot-paths into SynthState / SampleState, identical to the ones the
 * engine understands (see src/lib/audio/synth.ts setParameter).
 */
import { useCallback } from "react";
import { useProjectStore } from "@/lib/state/project-store";
import { useEngineRef } from "@/components/hooks/useEngine";
import type { ID, SampleState, SoundDefinition, SynthState } from "@/lib/schema/types";

type Primitive = number | string | boolean;

/** Write `value` at dot-path `path` inside `target`. */
export function setAtPath(target: Record<string, unknown>, path: string, value: Primitive): void {
  const parts = path.split(".");
  let node: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const next = node[parts[i]];
    if (typeof next !== "object" || next === null) return;
    node = next as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

/** Read the value at dot-path `path`. */
export function getAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[key];
  }, source);
}

export interface SynthBinding {
  sound: SoundDefinition | undefined;
  state: SynthState | undefined;
  /** Live update: engine first (audible), then store (persisted). */
  set(path: string, value: Primitive): void;
}

export function useSynthBinding(soundId: ID | null): SynthBinding {
  const sound = useProjectStore((s) => s.project.sounds.find((x) => x.id === soundId));
  const updateSound = useProjectStore((s) => s.updateSound);
  const engineRef = useEngineRef();

  const set = useCallback(
    (path: string, value: Primitive) => {
      if (!soundId) return;
      engineRef.current?.setParameter(path, value);
      updateSound(
        soundId,
        (draft) => {
          if (draft.synthState) setAtPath(draft.synthState as unknown as Record<string, unknown>, path, value);
        },
        { undoable: false },
      );
    },
    [soundId, updateSound, engineRef],
  );

  return { sound, state: sound?.synthState, set };
}

export interface SampleBinding {
  sound: SoundDefinition | undefined;
  state: SampleState | undefined;
  set(path: string, value: Primitive): void;
}

/**
 * Sample edits are non-destructive parameter writes. They follow the same
 * two-target rule as synth edits: the engine holds its own mutable copy of the
 * SampleState for playback, so it has to hear about every change, and the
 * store keeps the persisted version.
 */
export function useSampleBinding(soundId: ID | null): SampleBinding {
  const sound = useProjectStore((s) => s.project.sounds.find((x) => x.id === soundId));
  const updateSound = useProjectStore((s) => s.updateSound);
  const engineRef = useEngineRef();

  const set = useCallback(
    (path: string, value: Primitive) => {
      if (!soundId) return;
      engineRef.current?.setParameter(path, value);
      updateSound(
        soundId,
        (draft) => {
          if (draft.sampleState) setAtPath(draft.sampleState as unknown as Record<string, unknown>, path, value);
        },
        { undoable: false },
      );
    },
    [soundId, updateSound, engineRef],
  );

  return { sound, state: sound?.sampleState, set };
}
