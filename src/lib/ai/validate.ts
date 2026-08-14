/**
 * Validation boundary for the AI Sound Connector (text-to-patch).
 *
 * Spec (docs/BACKLOG-AI-CONNECTOR.md, "Validation boundary"): reuse
 * lib/schema/schemas.ts and parse the model output GROUP BY GROUP — a bad
 * group is discarded (marked "not applied") instead of failing the whole
 * proposal. Per-group authority stays with the zod schemas (ADR-009); the
 * JSON Schema only guided the model.
 *
 * Clamping: out-of-range numbers are clamped to the schema bounds and
 * string numbers are coerced; enums, booleans and literals stay strict. If
 * the clamped group still fails validation, the group is rejected.
 */
import { z } from "zod";
import {
  adsrSchema,
  effectsSchema,
  filterEnvAmountSchema,
  filterSchema,
  lfoSchema,
  mixerSchema,
  noiseSchema,
  oscillatorSchema,
  outputSchema,
  synthStateSchema,
} from "../schema/schemas";
import type { SynthState } from "../schema/types";
import type { AIPatchRequest, PatchGroupName } from "./types";

/** Deterministic order in which groups are validated and reported. */
export const GROUP_ORDER: readonly PatchGroupName[] = [
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
];

/** One schema per group — the exact schemas that guard persisted projects. */
type GroupSchema = z.ZodType<unknown, unknown>;

const GROUP_SCHEMAS: Readonly<Record<PatchGroupName, GroupSchema>> = {
  osc1: oscillatorSchema,
  osc2: oscillatorSchema,
  noise: noiseSchema,
  mixer: mixerSchema,
  filter: filterSchema,
  ampEnvelope: adsrSchema,
  filterEnvelope: adsrSchema,
  filterEnvAmount: filterEnvAmountSchema,
  lfo: lfoSchema,
  effects: effectsSchema,
  output: outputSchema,
};

export interface PatchValidationResult {
  patch: Partial<SynthState>;
  /** Groups accepted from the model output (directly or after clamping). */
  appliedGroups: PatchGroupName[];
  /** Groups the model DID return but that failed validation after clamping. */
  rejectedGroups: PatchGroupName[];
}

export function validatePatch(input: unknown): PatchValidationResult {
  const source = isRecord(input) ? input : {};
  // Collected as a string-keyed record, then narrowed once: assigning through
  // a union-typed key on Partial<SynthState> would force TS to demand the
  // intersection of every group type (each group parses independently here).
  const patchValues: Record<string, unknown> = {};
  const appliedGroups: PatchGroupName[] = [];
  const rejectedGroups: PatchGroupName[] = [];

  for (const group of GROUP_ORDER) {
    // Absent groups are simply not touched — the proposal is relative.
    if (!(group in source)) continue;
    const raw = source[group];
    const schema = GROUP_SCHEMAS[group];

    const direct = schema.safeParse(raw);
    if (direct.success) {
      patchValues[group] = direct.data;
      appliedGroups.push(group);
      continue;
    }

    const clamped = clampToSchema(schema, raw);
    const reparsed = schema.safeParse(clamped);
    if (reparsed.success) {
      patchValues[group] = reparsed.data;
      appliedGroups.push(group);
    } else {
      rejectedGroups.push(group);
    }
  }

  return { patch: patchValues as Partial<SynthState>, appliedGroups, rejectedGroups };
}

/* ------------------------------------------------------------------ */
/* Request boundary                                                    */
/* ------------------------------------------------------------------ */

const aiPatchRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  currentPatch: synthStateSchema.optional(),
  promptVersion: z.number().int().min(1).optional(),
});

export type ValidateRequestResult = { ok: true; data: AIPatchRequest } | { ok: false; message: string };

export function validateRequest(input: unknown): ValidateRequestResult {
  const result = aiPatchRequestSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
  return { ok: false, message };
}

/* ------------------------------------------------------------------ */
/* Clamping (best effort; zod re-validation is the final authority)    */
/* ------------------------------------------------------------------ */

/** Integer formats zod assigns via .int() (see zod core $ZodNumberFormats). */
const INTEGER_FORMATS: readonly string[] = ["safeint", "int32", "uint32"];

function clampToSchema(schema: GroupSchema, value: unknown): unknown {
  switch (schema.type) {
    case "object":
      return clampObject(schema, value);
    case "array":
      return clampArray(schema, value);
    case "number":
      return clampNumber(schema, value);
    case "union":
      // Discriminated unions report type "union" in zod 4.
      return clampUnion(schema, value);
    default:
      // enums, literals, booleans, strings: strict — the re-parse decides.
      return value;
  }
}

function clampObject(schema: GroupSchema, value: unknown): unknown {
  if (!isRecord(value)) return value; // e.g. a number where an object was expected.
  // The classic ZodType interface doesn't expose .shape statically, but every
  // object schema has it at runtime.
  const shape = (schema as unknown as { shape: Readonly<Record<string, GroupSchema>> }).shape;
  const clamped: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const fieldSchema = shape[key];
    // Unknown keys pass through unchanged; zod strips them on parse.
    clamped[key] = fieldSchema ? clampToSchema(fieldSchema, entry) : entry;
  }
  return clamped;
}

function clampArray(schema: GroupSchema, value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const element = (schema as unknown as { element: GroupSchema }).element;
  return value.map((item) => clampToSchema(element, item));
}

function clampNumber(schema: GroupSchema, value: unknown): unknown {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return value; // unclampable -> group rejected

  const { minValue, maxValue, format } = schema as unknown as {
    minValue: number | null;
    maxValue: number | null;
    format: string | null;
  };
  let clamped = numeric;
  if (minValue !== null && clamped < minValue) clamped = minValue;
  if (maxValue !== null && clamped > maxValue) clamped = maxValue;
  if (format !== null && INTEGER_FORMATS.includes(format)) clamped = Math.round(clamped);
  return clamped;
}

function clampUnion(schema: GroupSchema, value: unknown): unknown {
  if (!isRecord(value)) return value;
  const options = (schema as unknown as { options: readonly GroupSchema[] }).options;

  // Prefer the branch that already accepts the value, then clamp with it.
  for (const option of options) {
    if (option.safeParse(value).success) return clampToSchema(option, value);
  }
  // Otherwise clamp against every branch and keep the first that parses.
  for (const option of options) {
    const clamped = clampToSchema(option, value);
    if (option.safeParse(clamped).success) return clamped;
  }
  return value; // no branch matched — the group re-parse will reject it
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
