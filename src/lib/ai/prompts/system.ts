/**
 * System prompt for the AI Sound Connector (text-to-patch).
 *
 * The prompt lives here so the version constant in lib/ai/types.ts is the
 * single version marker; bump AI_PROMPT_VERSION whenever this text changes.
 *
 * The synth-model description mirrors the zod schemas in
 * src/lib/schema/schemas.ts (same ranges as jsonSchema.ts).
 */
import { AI_PROMPT_VERSION } from "../types";
import type { SynthState } from "../../schema/types";

const SYNTH_MODEL_DESCRIPTION = `
The synthesizer state (SynthState) is made of these groups:
- osc1, osc2 (oscillators): enabled (boolean), waveform (sine|triangle|sawtooth|square), octave (-4..+4), semitone (-12..+12), detuneCents (-100..+100), phase (0..1), unison (1..8), unisonSpreadCents (0..100).
- noise: enabled (boolean), color (0..1, 0 = white, 1 = pink).
- mixer: linear gains osc1, osc2, noise (each 0..1).
- filter: mode (lowpass|highpass|bandpass), cutoff (Hz, 20..20000), resonance (Q, 0.1..24).
- ampEnvelope, filterEnvelope (ADSR): attack, decay (seconds, 0..10), sustain (0..1), release (seconds, 0..30).
- filterEnvAmount: bipolar filter-envelope amount (-1..+1).
- lfo: waveform (sine|triangle|sawtooth|square), destination (pitch|filter|amplitude), rate (Hz, 0.01..40), depth (0..1), sync (boolean), syncBeats (0.0625..16, beats per cycle when sync is true).
- effects: exactly 4 entries in this order: distortion, chorus, delay, reverb. Each entry is { kind, bypass (boolean), params } with params specific to the kind.
- output: gain (0..1), velocitySensitivity (0..1).
`.trim();

export function buildSystemPrompt(jsonSchema: string, currentPatch?: SynthState): string {
  const currentPatchJson =
    currentPatch === undefined ? "none provided — you may propose any groups." : JSON.stringify(currentPatch, null, 2);

  return [
    "You turn a short text description of a sound into a synthesizer patch.",
    SYNTH_MODEL_DESCRIPTION,
    "",
    "Rules:",
    "- Respond with ONLY a single JSON object — no prose around it, no markdown code fences, no code, no audio.",
    "- The object MUST match this JSON Schema exactly:",
    jsonSchema,
    "",
    "- The 'patch' object is RELATIVE to the current patch below: include only the groups that must change; groups you omit stay as they are.",
    "- If you include a group, you MUST include ALL of its fields (see the schema).",
    "- Prefer the fewest groups needed to express the sound. Do not echo the current patch back unchanged.",
    "- 'rationale' is a short 1-2 sentence explanation of the design choices.",
    "",
    `Current patch (JSON): ${currentPatchJson}`,
    "",
    `promptVersion: ${AI_PROMPT_VERSION}`,
  ].join("\n");
}
