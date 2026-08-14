/**
 * JSON Schema for the model's response wrapper:
 *   { "patch": <SynthState>, "rationale": "<short explanation>" }
 *
 * NOTE: this is a hand-maintained mirror of the zod schemas in
 * src/lib/schema/schemas.ts. zod-to-json-schema 3.25.2 (latest) was
 * installed per the spec but only supports zod v3 (it dispatches on
 * `def.typeName`, which zod 4 removed), so it emits empty schemas for our
 * schemas. Per the backlog spec, the JSON Schema only GUIDES the model —
 * the authority is the zod validation in validate.ts — so we keep this
 * plain object in sync with schemas.ts instead of depending on broken
 * generation. When touching schemas.ts, update this file too.
 */

const unit = { type: "number", minimum: 0, maximum: 1 };
const waveform = { type: "string", enum: ["sine", "triangle", "sawtooth", "square"] };

const oscillator: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "enabled",
    "waveform",
    "octave",
    "semitone",
    "detuneCents",
    "phase",
    "unison",
    "unisonSpreadCents",
  ],
  properties: {
    enabled: { type: "boolean" },
    waveform,
    octave: { type: "integer", minimum: -4, maximum: 4 },
    semitone: { type: "integer", minimum: -12, maximum: 12 },
    detuneCents: { type: "number", minimum: -100, maximum: 100 },
    phase: unit,
    unison: { type: "integer", minimum: 1, maximum: 8 },
    unisonSpreadCents: { type: "number", minimum: 0, maximum: 100 },
  },
};

const adsr: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["attack", "decay", "sustain", "release"],
  properties: {
    attack: { type: "number", minimum: 0, maximum: 10 },
    decay: { type: "number", minimum: 0, maximum: 10 },
    sustain: unit,
    release: { type: "number", minimum: 0, maximum: 30 },
  },
};

const filter: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "cutoff", "resonance"],
  properties: {
    mode: { type: "string", enum: ["lowpass", "highpass", "bandpass"] },
    cutoff: { type: "number", minimum: 20, maximum: 20000 },
    resonance: { type: "number", minimum: 0.1, maximum: 24 },
  },
};

const effectKinds = ["distortion", "chorus", "delay", "reverb"] as const;
const effects: Record<string, unknown> = {
  type: "array",
  minItems: effectKinds.length,
  maxItems: effectKinds.length,
  // Deterministic order, same as EFFECT_ORDER in lib/schema/types.ts.
  items: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "bypass", "params"],
        properties: {
          kind: { const: "distortion" },
          bypass: { type: "boolean" },
          params: {
            type: "object",
            additionalProperties: false,
            required: ["drive", "tone"],
            properties: { drive: unit, tone: unit },
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "bypass", "params"],
        properties: {
          kind: { const: "chorus" },
          bypass: { type: "boolean" },
          params: {
            type: "object",
            additionalProperties: false,
            required: ["rate", "depth", "mix"],
            properties: {
              rate: { type: "number", minimum: 0.01, maximum: 20 },
              depth: unit,
              mix: unit,
            },
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "bypass", "params"],
        properties: {
          kind: { const: "delay" },
          bypass: { type: "boolean" },
          params: {
            type: "object",
            additionalProperties: false,
            required: ["timeBeats", "feedback", "mix", "sync", "timeSeconds"],
            properties: {
              timeBeats: { type: "number", minimum: 0.0625, maximum: 8 },
              feedback: { type: "number", minimum: 0, maximum: 0.95 },
              mix: unit,
              sync: { type: "boolean" },
              timeSeconds: { type: "number", minimum: 0.01, maximum: 2 },
            },
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "bypass", "params"],
        properties: {
          kind: { const: "reverb" },
          bypass: { type: "boolean" },
          params: {
            type: "object",
            additionalProperties: false,
            required: ["decay", "mix"],
            properties: {
              decay: { type: "number", minimum: 0.1, maximum: 20 },
              mix: unit,
            },
          },
        },
      },
    ],
  },
};

const synthState: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "osc1",
    "osc2",
    "noise",
    "mixer",
    "filter",
    "ampEnvelope",
    "filterEnvelope",
    "filterEnvAmount",
    "lfo",
    "effects",
    "output",
  ],
  properties: {
    osc1: oscillator,
    osc2: oscillator,
    noise: {
      type: "object",
      additionalProperties: false,
      required: ["enabled", "color"],
      properties: {
        enabled: { type: "boolean" },
        // 0 = white, 1 = pink.
        color: unit,
      },
    },
    mixer: {
      type: "object",
      additionalProperties: false,
      required: ["osc1", "osc2", "noise"],
      properties: { osc1: unit, osc2: unit, noise: unit },
    },
    filter,
    ampEnvelope: adsr,
    filterEnvelope: adsr,
    filterEnvAmount: { type: "number", minimum: -1, maximum: 1 },
    lfo: {
      type: "object",
      additionalProperties: false,
      required: ["waveform", "destination", "rate", "depth", "sync", "syncBeats"],
      properties: {
        waveform,
        destination: { type: "string", enum: ["pitch", "filter", "amplitude"] },
        rate: { type: "number", minimum: 0.01, maximum: 40 },
        depth: unit,
        sync: { type: "boolean" },
        syncBeats: { type: "number", minimum: 0.0625, maximum: 16 },
      },
    },
    effects,
    output: {
      type: "object",
      additionalProperties: false,
      required: ["gain", "velocitySensitivity"],
      properties: { gain: unit, velocitySensitivity: unit },
    },
  },
};

/** Response wrapper the model must produce, verbatim. */
export const AI_PATCH_JSON_SCHEMA: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["patch", "rationale"],
  properties: {
    patch: synthState,
    rationale: { type: "string", minLength: 1, maxLength: 1000 },
  },
};

/** Serialized schema, embedded in the system prompt. */
export function getPatchJsonSchema(): string {
  return JSON.stringify(AI_PATCH_JSON_SCHEMA, null, 2);
}
