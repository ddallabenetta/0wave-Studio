/**
 * Curated system presets. Each one is a real, audibly distinct patch built by
 * editing the init state; they seed the library on first run and feed the
 * guided "new sound" picker.
 */
import { createId, createSynthSound, defaultSynthState } from "@/lib/schema/factories";
import type { SoundDefinition, SynthState } from "@/lib/schema/types";

function preset(name: string, edit: (s: SynthState) => void): SoundDefinition {
  const sound = createSynthSound(name, "system-preset");
  const state = defaultSynthState();
  edit(state);
  sound.synthState = state;
  return sound;
}

/**
 * Presentation metadata for the guided preset picker. Keyed by preset name so
 * seeded copies of the same patch keep working after a reload. `description`
 * is the leaf key under `strings.studio.presets`, `category` the leaf under
 * `strings.studio.presetCategories`.
 */
export interface PresetInfo {
  category: "percussive" | "bass" | "pad" | "pluck" | "lead" | "texture" | "blank";
  description: string;
}

export const PRESET_CATALOG: Record<string, PresetInfo> = {
  "Init Patch": { category: "blank", description: "initPatch" },
  Kick: { category: "percussive", description: "kick" },
  Snare: { category: "percussive", description: "snare" },
  "Noise Perc": { category: "percussive", description: "noisePerc" },
  "Round Bass": { category: "bass", description: "roundBass" },
  "Soft Pad": { category: "pad", description: "softPad" },
  "Glass Pluck": { category: "pluck", description: "glassPluck" },
  "Acid Lead": { category: "lead", description: "acidLead" },
  "Slow Texture": { category: "texture", description: "slowTexture" },
};

/** Order in which preset categories appear in the picker. */
export const PRESET_CATEGORY_ORDER: PresetInfo["category"][] = [
  "percussive",
  "pad",
  "bass",
  "pluck",
  "lead",
  "texture",
  "blank",
];

/**
 * Create a fresh user sound from a system preset patch. The resulting sound
 * shares the patch but gets a new id and a user origin, so it can be edited
 * and persisted without touching the seeded library entry.
 */
export function createSoundFromPreset(name: string): SoundDefinition {
  const source = SYSTEM_PRESETS.find((p) => p.name === name);
  if (!source || !source.synthState) return createSynthSound(name);
  return {
    id: createId(),
    type: "synth",
    name,
    metadata: { origin: "user", tags: [], syncState: "local" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    synthState: structuredClone(source.synthState),
  };
}

export const SYSTEM_PRESETS: SoundDefinition[] = [
  preset("Init Patch", () => {
    // Deliberately the raw default: one saw oscillator, open filter.
  }),

  preset("Kick", (s) => {
    s.osc1.waveform = "sine";
    s.osc1.octave = -2;
    s.osc2.enabled = false;
    s.mixer.osc1 = 1;
    s.mixer.osc2 = 0;
    s.filter.mode = "lowpass";
    s.filter.cutoff = 190;
    s.filter.resonance = 3;
    s.ampEnvelope = { attack: 0.001, decay: 0.28, sustain: 0, release: 0.12 };
    s.filterEnvelope = { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 };
    s.filterEnvAmount = 0.55;
    s.output.gain = 0.9;
    s.output.velocitySensitivity = 0.7;
  }),

  preset("Snare", (s) => {
    s.osc1.enabled = false;
    s.osc2.enabled = true;
    s.osc2.waveform = "square";
    s.osc2.octave = -2;
    s.mixer.osc1 = 0;
    s.mixer.osc2 = 0.35;
    s.noise = { enabled: true, color: 0.15 };
    s.mixer.noise = 0.9;
    s.filter.mode = "bandpass";
    s.filter.cutoff = 1900;
    s.filter.resonance = 5.5;
    s.ampEnvelope = { attack: 0.001, decay: 0.14, sustain: 0, release: 0.09 };
    s.filterEnvelope = { attack: 0.001, decay: 0.1, sustain: 0, release: 0.07 };
    s.filterEnvAmount = 0.5;
    s.output.gain = 0.85;
    s.output.velocitySensitivity = 0.85;
  }),

  preset("Round Bass", (s) => {
    s.osc1.waveform = "sawtooth";
    s.osc2.enabled = true;
    s.osc2.waveform = "square";
    s.osc2.octave = -1;
    s.osc2.detuneCents = -7;
    s.mixer.osc1 = 0.75;
    s.mixer.osc2 = 0.55;
    s.filter.mode = "lowpass";
    s.filter.cutoff = 420;
    s.filter.resonance = 6;
    s.ampEnvelope = { attack: 0.004, decay: 0.22, sustain: 0.55, release: 0.14 };
    s.filterEnvelope = { attack: 0.002, decay: 0.18, sustain: 0.12, release: 0.12 };
    s.filterEnvAmount = 0.55;
    s.output.gain = 0.85;
    s.effects[0] = { kind: "distortion", bypass: false, params: { drive: 0.22, tone: 0.45 } };
  }),

  preset("Soft Pad", (s) => {
    s.osc1.waveform = "triangle";
    s.osc1.unison = 4;
    s.osc1.unisonSpreadCents = 18;
    s.osc2.enabled = true;
    s.osc2.waveform = "sawtooth";
    s.osc2.detuneCents = 9;
    s.osc2.unison = 3;
    s.mixer.osc1 = 0.7;
    s.mixer.osc2 = 0.4;
    s.filter.cutoff = 2600;
    s.filter.resonance = 0.7;
    s.ampEnvelope = { attack: 0.9, decay: 1.2, sustain: 0.8, release: 1.8 };
    s.filterEnvelope = { attack: 1.4, decay: 2, sustain: 0.6, release: 1.6 };
    s.filterEnvAmount = 0.3;
    s.lfo = { waveform: "sine", destination: "filter", rate: 0.22, depth: 0.35, sync: false, syncBeats: 4 };
    s.effects[1] = { kind: "chorus", bypass: false, params: { rate: 0.5, depth: 0.55, mix: 0.4 } };
    s.effects[3] = { kind: "reverb", bypass: false, params: { decay: 4.5, mix: 0.42 } };
    s.output.gain = 0.65;
  }),

  preset("Glass Pluck", (s) => {
    s.osc1.waveform = "square";
    s.osc1.semitone = 12;
    s.osc2.enabled = true;
    s.osc2.waveform = "triangle";
    s.osc2.octave = 1;
    s.osc2.detuneCents = 4;
    s.mixer.osc1 = 0.5;
    s.mixer.osc2 = 0.65;
    s.filter.cutoff = 5200;
    s.filter.resonance = 3.2;
    s.ampEnvelope = { attack: 0.002, decay: 0.28, sustain: 0.05, release: 0.32 };
    s.filterEnvelope = { attack: 0.001, decay: 0.2, sustain: 0.02, release: 0.25 };
    s.filterEnvAmount = 0.7;
    s.effects[2] = {
      kind: "delay",
      bypass: false,
      params: { timeBeats: 0.375, feedback: 0.32, mix: 0.28, sync: true, timeSeconds: 0.2 },
    };
    s.effects[3] = { kind: "reverb", bypass: false, params: { decay: 2.4, mix: 0.22 } };
    s.output.gain = 0.7;
  }),

  preset("Acid Lead", (s) => {
    s.osc1.waveform = "sawtooth";
    s.osc2.enabled = true;
    s.osc2.waveform = "sawtooth";
    s.osc2.detuneCents = 14;
    s.mixer.osc1 = 0.8;
    s.mixer.osc2 = 0.6;
    s.filter.cutoff = 900;
    s.filter.resonance = 12;
    s.ampEnvelope = { attack: 0.003, decay: 0.3, sustain: 0.6, release: 0.18 };
    s.filterEnvelope = { attack: 0.004, decay: 0.32, sustain: 0.15, release: 0.2 };
    s.filterEnvAmount = 0.8;
    s.lfo = { waveform: "triangle", destination: "filter", rate: 1, depth: 0.25, sync: true, syncBeats: 1 };
    s.effects[0] = { kind: "distortion", bypass: false, params: { drive: 0.45, tone: 0.7 } };
    s.output.gain = 0.72;
  }),

  preset("Noise Perc", (s) => {
    s.osc1.enabled = false;
    s.osc2.enabled = true;
    s.osc2.waveform = "square";
    s.osc2.octave = -2;
    s.mixer.osc1 = 0;
    s.mixer.osc2 = 0.35;
    s.noise = { enabled: true, color: 0.15 };
    s.mixer.noise = 0.85;
    s.filter.mode = "bandpass";
    s.filter.cutoff = 3200;
    s.filter.resonance = 5;
    s.ampEnvelope = { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 };
    s.filterEnvelope = { attack: 0.001, decay: 0.08, sustain: 0, release: 0.06 };
    s.filterEnvAmount = 0.6;
    s.output.gain = 0.8;
    s.output.velocitySensitivity = 0.85;
  }),

  preset("Slow Texture", (s) => {
    s.osc1.waveform = "sine";
    s.osc1.unison = 2;
    s.osc1.unisonSpreadCents = 25;
    s.osc2.enabled = true;
    s.osc2.waveform = "triangle";
    s.osc2.semitone = 7;
    s.osc2.detuneCents = -12;
    s.noise = { enabled: true, color: 0.8 };
    s.mixer.osc1 = 0.6;
    s.mixer.osc2 = 0.45;
    s.mixer.noise = 0.12;
    s.filter.cutoff = 1400;
    s.filter.resonance = 1.4;
    s.ampEnvelope = { attack: 1.6, decay: 2.4, sustain: 0.75, release: 3 };
    s.filterEnvelope = { attack: 2.2, decay: 3, sustain: 0.5, release: 2.5 };
    s.filterEnvAmount = 0.45;
    s.lfo = { waveform: "sine", destination: "pitch", rate: 0.12, depth: 0.12, sync: false, syncBeats: 8 };
    s.effects[1] = { kind: "chorus", bypass: false, params: { rate: 0.28, depth: 0.7, mix: 0.5 } };
    s.effects[3] = { kind: "reverb", bypass: false, params: { decay: 7, mix: 0.55 } };
    s.output.gain = 0.6;
  }),
];
