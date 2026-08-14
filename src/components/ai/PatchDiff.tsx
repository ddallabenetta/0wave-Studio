"use client";

/**
 * PatchDiff: parameter-level diff of the current patch vs the AI proposal.
 *
 * Shows one section per group present in the proposal, listing the changed
 * parameters as `label: old → new`. Groups the server rejected (validation
 * boundary, see docs/BACKLOG-AI-CONNECTOR.md) are shown with a "not applied"
 * badge instead of parameters, because their values were discarded.
 * Unchanged groups are skipped entirely.
 */
import { useMemo } from "react";
import type { PatchGroupName } from "@/lib/ai/types";
import type { SynthState } from "@/lib/schema/types";
import { strings } from "@/i18n";

/** Display order of SynthState groups (spec order, mirrored from the schema). */
const GROUP_ORDER: Array<{ key: PatchGroupName; label: string }> = [
  { key: "osc1", label: strings.synth.osc1 },
  { key: "osc2", label: strings.synth.osc2 },
  { key: "noise", label: strings.synth.noise },
  { key: "mixer", label: strings.synth.mixer },
  { key: "filter", label: strings.synth.filter },
  { key: "ampEnvelope", label: strings.synth.ampEnv },
  { key: "filterEnvelope", label: strings.synth.filterEnv },
  { key: "filterEnvAmount", label: strings.synth.envAmount },
  { key: "lfo", label: strings.synth.lfo },
  { key: "effects", label: strings.synth.effects },
  { key: "output", label: strings.synth.output },
];

interface DiffRow {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Collect leaf changes by walking the patch against the baseline. Only keys
 * present in the patch are visited; nested objects recurse, so a partial
 * group like `{ filter: { cutoff: 500 } }` yields a single row.
 */
function flattenDiff(current: unknown, patch: unknown, path: string, rows: DiffRow[]): void {
  if (patch === null || typeof patch !== "object") {
    if (!Object.is(current, patch)) rows.push({ path, oldValue: current, newValue: patch });
    return;
  }
  if (Array.isArray(patch)) {
    if (!Array.isArray(current)) return; // no baseline to diff against
    patch.forEach((entry, index) => {
      const base = current[index];
      if (entry !== null && typeof entry === "object" && base !== null && typeof base === "object") {
        flattenDiff(base, entry, `${path}[${index}]`, rows);
      } else if (!Object.is(base, entry)) {
        rows.push({ path: `${path}[${index}]`, oldValue: base, newValue: entry });
      }
    });
    return;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const base = current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
    if (value !== null && typeof value === "object" && base !== null && typeof base === "object") {
      flattenDiff(base, value, `${path}.${key}`, rows);
    } else if (!Object.is(base, value)) {
      rows.push({ path: `${path}.${key}`, oldValue: base, newValue: value });
    }
  }
}

/* Parameter labels. Index-qualified effect paths normalize to the shared key,
 * e.g. "effects[2].params.feedback" -> "effects.params.feedback". */
const PARAM_LABELS: Record<string, string> = {
  "osc1.enabled": strings.common.enabled,
  "osc2.enabled": strings.common.enabled,
  "noise.enabled": strings.common.enabled,
  "osc1.waveform": strings.synth.waveform,
  "osc2.waveform": strings.synth.waveform,
  "osc1.octave": strings.synth.octave,
  "osc2.octave": strings.synth.octave,
  "osc1.semitone": strings.synth.semitone,
  "osc2.semitone": strings.synth.semitone,
  "osc1.detuneCents": strings.synth.detune,
  "osc2.detuneCents": strings.synth.detune,
  "osc1.phase": strings.synth.phase,
  "osc2.phase": strings.synth.phase,
  "osc1.unison": strings.synth.unison,
  "osc2.unison": strings.synth.unison,
  "osc1.unisonSpreadCents": strings.synth.spread,
  "osc2.unisonSpreadCents": strings.synth.spread,
  "mixer.osc1": strings.synth.osc1,
  "mixer.osc2": strings.synth.osc2,
  "mixer.noise": strings.synth.noise,
  "filter.cutoff": strings.synth.cutoff,
  "filter.resonance": strings.synth.resonance,
  "ampEnvelope.attack": strings.synth.attack,
  "ampEnvelope.decay": strings.synth.decay,
  "ampEnvelope.sustain": strings.synth.sustain,
  "ampEnvelope.release": strings.synth.release,
  "filterEnvelope.attack": strings.synth.attack,
  "filterEnvelope.decay": strings.synth.decay,
  "filterEnvelope.sustain": strings.synth.sustain,
  "filterEnvelope.release": strings.synth.release,
  "filterEnvAmount": strings.synth.envAmount,
  "lfo.waveform": strings.synth.waveform,
  "lfo.destination": strings.synth.destination,
  "lfo.rate": strings.synth.rate,
  "lfo.depth": strings.synth.depth,
  "lfo.sync": strings.synth.sync,
  "effects.bypass": strings.synth.bypass,
  "effects.params.drive": strings.synth.drive,
  "effects.params.tone": strings.synth.tone,
  "effects.params.rate": strings.synth.rate,
  "effects.params.depth": strings.synth.depth,
  "effects.params.mix": strings.synth.mix,
  "effects.params.timeBeats": strings.synth.time,
  "effects.params.feedback": strings.synth.feedback,
  "effects.params.sync": strings.synth.sync,
  "effects.params.decay": strings.synth.decayTime,
  "output.gain": strings.synth.gain,
  "output.velocitySensitivity": strings.synth.velocity,
};

/** Human label for a parameter path; falls back to the readable path. */
function labelForPath(path: string): string {
  return PARAM_LABELS[path.replace(/\[\d+\]/g, "")] ?? path;
}

/** Compact, round-trip-safe value formatting for the diff rows. */
function formatValue(value: unknown): string {
  if (typeof value === "number") return String(Math.round(value * 1000) / 1000);
  if (typeof value === "boolean") return value ? strings.common.on : strings.common.off;
  if (typeof value === "string") return value;
  if (value === undefined) return "—";
  return JSON.stringify(value);
}

export interface PatchDiffProps {
  /** The sound's current, full SynthState. */
  current: SynthState;
  /** The model's proposal: only the groups it touched. */
  proposal: Partial<SynthState>;
  /** Groups the server rejected; shown with a "not applied" badge. */
  rejectedGroups: PatchGroupName[];
}

export function PatchDiff({ current, proposal, rejectedGroups }: PatchDiffProps) {
  const sections = useMemo(() => {
    const rejected = new Set(rejectedGroups);
    return GROUP_ORDER.filter(
      (group) => rejected.has(group.key) || group.key in proposal,
    ).map((group) => {
      const rows: DiffRow[] = [];
      if (!rejected.has(group.key) && group.key in proposal) {
        flattenDiff(current[group.key], proposal[group.key], group.key, rows);
      }
      return { key: group.key, label: group.label, rejected: rejected.has(group.key), rows };
    });
  }, [current, proposal, rejectedGroups]);

  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {sections.map((section) =>
        section.rejected || section.rows.length > 0 ? (
          <section key={section.key} className="rounded-[var(--radius-control)] border border-edge p-2">
            <header className="mb-1 flex items-center gap-2">
              <h4 className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {section.label}
              </h4>
              {section.rejected && (
                <span className="rounded-[var(--radius-control)] border border-warning bg-surface px-1 py-px font-mono text-[9px] uppercase tracking-wider text-warning">
                  {strings.ai.notApplied}
                </span>
              )}
            </header>
            {section.rows.length > 0 && (
              <ul className="flex flex-col gap-0.5">
                {section.rows.map((row) => (
                  <li key={row.path} className="flex items-baseline gap-1 font-mono text-[10px]">
                    <span className="text-ink-soft">{labelForPath(row.path)}</span>
                    <span className="text-ink-faint">{formatValue(row.oldValue)}</span>
                    <span aria-hidden className="text-ink-faint">→</span>
                    <span className="text-ink">{formatValue(row.newValue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null,
      )}
    </div>
  );
}
