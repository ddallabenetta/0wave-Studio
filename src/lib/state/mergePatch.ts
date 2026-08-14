/**
 * Pure patch-merging for the AI Sound Connector (text-to-patch).
 *
 * A model proposal is a Partial<SynthState>: only the groups the model
 * touched. Applying it must never clobber the untouched groups, and must
 * never mutate the caller's objects. This is the single implementation used
 * by both the undoable store action (applyPatchToSound) and the engine
 * preview, so the auditioned patch and the committed patch can never drift
 * apart (ADR-006: Apply is one store mutation; the preview must match it).
 */
import type { SynthState } from "../schema/types";

/**
 * Deep partial of one SynthState group: nested parameters may be patched
 * individually (`{ filter: { cutoff: 500 } }`). Effects stay wholesale —
 * they are an ordered chain, not a parameter bag. The contract type
 * Partial<SynthState> (full groups) is assignable to this.
 */
type DeepGroup<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepGroup<T[K]> }
    : T;

/** Accepted patch shape: any subset of groups, each possibly partial. */
export type SynthPatch = { [K in keyof SynthState]?: DeepGroup<SynthState[K]> };

/** Object groups merged parameter-wise; scalars and effects are direct. */
type ObjectGroupKey = keyof Omit<SynthState, "effects" | "filterEnvAmount">;

/**
 * Merge a patch into a full SynthState, returning a NEW object.
 *
 * - Object groups present in `patch` are spread onto the current group, so a
 *   partial group keeps the untouched parameters of the current one.
 * - `effects` is replaced wholesale when present: an index-wise merge would
 *   resurrect stale chain entries the model never validated.
 * - Scalar groups (filterEnvAmount) are assigned directly.
 * - `current` is never mutated.
 */
export function mergePatch(current: SynthState, patch: SynthPatch): SynthState {
  const merged: SynthState = { ...current };

  if (patch.effects !== undefined) merged.effects = patch.effects;
  if (patch.filterEnvAmount !== undefined) merged.filterEnvAmount = patch.filterEnvAmount;

  // Explicit per-key merges: an indexed assignment through a union key would
  // resolve to an intersection target, so each group is merged with the key
  // narrowed to a single literal. The compiler checks every spread.
  mergeGroup("osc1");
  mergeGroup("osc2");
  mergeGroup("noise");
  mergeGroup("mixer");
  mergeGroup("filter");
  mergeGroup("ampEnvelope");
  mergeGroup("filterEnvelope");
  mergeGroup("lfo");
  mergeGroup("output");

  return merged;

  function mergeGroup<K extends ObjectGroupKey>(key: K): void {
    const value = patch[key];
    if (value === undefined) return;
    // Nested group: keep untouched parameters, apply the patched ones only.
    merged[key] = { ...current[key], ...value };
  }
}
