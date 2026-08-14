import { describe, expect, it } from "vitest";
import { validatePatch, validateRequest, GROUP_ORDER } from "@/lib/ai/validate";
import { defaultSynthState } from "@/lib/schema/factories";

function fullPatch() {
  return defaultSynthState();
}

describe("validatePatch", () => {
  it("applies every valid group of a complete patch", () => {
    const result = validatePatch(fullPatch());
    expect(result.appliedGroups).toEqual([...GROUP_ORDER]);
    expect(result.rejectedGroups).toEqual([]);
    expect(result.patch.filter?.cutoff).toBe(8000);
  });

  it("discards an invalid group but keeps the valid ones", () => {
    const input = {
      filter: { mode: "lowpass", cutoff: 8000, resonance: 0.8 },
      lfo: "not an object", // garbage the model should never produce
      output: { gain: 0.5, velocitySensitivity: 0.4 },
    };
    const result = validatePatch(input);
    expect(result.appliedGroups).toEqual(["filter", "output"]);
    expect(result.rejectedGroups).toEqual(["lfo"]);
    expect(result.patch.filter).toBeDefined();
    expect(result.patch.output).toBeDefined();
    expect(result.patch.lfo).toBeUndefined();
  });

  it("skips groups that are absent (relative patch)", () => {
    const result = validatePatch({ osc1: fullPatch().osc1 });
    expect(result.appliedGroups).toEqual(["osc1"]);
    expect(result.rejectedGroups).toEqual([]);
  });

  it("clamps out-of-range numbers to the schema bounds", () => {
    const result = validatePatch({
      filter: { mode: "lowpass", cutoff: 999999, resonance: -5 },
      ampEnvelope: { attack: 42, decay: 0.15, sustain: 2, release: 0.2 },
      lfo: { waveform: "sine", destination: "filter", rate: 0, depth: 0, sync: false, syncBeats: 100 },
    });
    expect(result.appliedGroups).toEqual(["filter", "ampEnvelope", "lfo"]);
    expect(result.rejectedGroups).toEqual([]);
    expect(result.patch.filter?.cutoff).toBe(20000);
    expect(result.patch.filter?.resonance).toBe(0.1);
    expect(result.patch.ampEnvelope?.attack).toBe(10);
    expect(result.patch.ampEnvelope?.sustain).toBe(1);
    expect(result.patch.lfo?.rate).toBe(0.01);
    expect(result.patch.lfo?.syncBeats).toBe(16);
  });

  it("rounds fractional values of integer fields", () => {
    const result = validatePatch({
      osc1: { ...fullPatch().osc1, octave: 2.6, unison: 3.2 },
    });
    expect(result.appliedGroups).toEqual(["osc1"]);
    expect(result.patch.osc1?.octave).toBe(3);
    expect(result.patch.osc1?.unison).toBe(3);
  });

  it("coerces numeric strings, clamping them like numbers", () => {
    const result = validatePatch({
      filter: { mode: "lowpass", cutoff: "3000", resonance: 2 },
      output: { gain: "1.5", velocitySensitivity: 0.5 },
    });
    expect(result.appliedGroups).toEqual(["filter", "output"]);
    expect(result.patch.filter?.cutoff).toBe(3000);
    expect(result.patch.output?.gain).toBe(1); // clamped
  });

  it("rejects a group whose numeric field is not coercible", () => {
    const result = validatePatch({
      filter: { mode: "lowpass", cutoff: "loud", resonance: 0.8 },
    });
    expect(result.appliedGroups).toEqual([]);
    expect(result.rejectedGroups).toEqual(["filter"]);
    expect(result.patch.filter).toBeUndefined();
  });

  it("rejects a group with an unknown enum value (enums stay strict)", () => {
    const result = validatePatch({
      filter: { mode: "bandstop", cutoff: 8000, resonance: 0.8 },
    });
    expect(result.rejectedGroups).toEqual(["filter"]);
  });

  it("applies a non-object value to a numeric-only group after coercion", () => {
    const result = validatePatch({ filterEnvAmount: "0.5" });
    expect(result.appliedGroups).toEqual(["filterEnvAmount"]);
    expect(result.patch.filterEnvAmount).toBe(0.5);
  });
});

describe("validatePatch effects group", () => {
  it("applies a complete effects chain following EFFECT_ORDER", () => {
    const result = validatePatch({ effects: fullPatch().effects });
    expect(result.appliedGroups).toEqual(["effects"]);
    expect(result.rejectedGroups).toEqual([]);
    expect(result.patch.effects?.map((fx) => fx.kind)).toEqual([
      "distortion",
      "chorus",
      "delay",
      "reverb",
    ]);
  });

  it("rejects an effects chain in the wrong order", () => {
    const wrongOrder = [...fullPatch().effects].reverse();
    const result = validatePatch({ effects: wrongOrder });
    expect(result.rejectedGroups).toEqual(["effects"]);
    expect(result.patch.effects).toBeUndefined();
  });

  it("rejects an effects chain with the wrong length", () => {
    const result = validatePatch({ effects: fullPatch().effects.slice(0, 2) });
    expect(result.rejectedGroups).toEqual(["effects"]);
  });

  it("clamps out-of-range effect params and keeps the group", () => {
    const effects = fullPatch().effects.map((fx) =>
      fx.kind === "delay" ? { ...fx, params: { ...fx.params, feedback: 5 } } : fx,
    );
    const result = validatePatch({ effects });
    expect(result.appliedGroups).toEqual(["effects"]);
    expect(result.patch.effects?.find((fx) => fx.kind === "delay")?.params.feedback).toBe(0.95);
  });
});

describe("validateRequest", () => {
  it("accepts a valid request", () => {
    const result = validateRequest({ prompt: "a warm bass" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.prompt).toBe("a warm bass");
      expect(result.data.currentPatch).toBeUndefined();
    }
  });

  it("accepts an optional currentPatch and promptVersion", () => {
    const result = validateRequest({ prompt: "x", currentPatch: fullPatch(), promptVersion: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.currentPatch?.filter).toBeDefined();
      expect(result.data.promptVersion).toBe(1);
    }
  });

  it("rejects a prompt that is missing, empty or too long", () => {
    expect(validateRequest({}).ok).toBe(false);
    expect(validateRequest({ prompt: "" }).ok).toBe(false);
    expect(validateRequest({ prompt: "x".repeat(2001) }).ok).toBe(false);
  });

  it("rejects a non-integer or zero promptVersion", () => {
    expect(validateRequest({ prompt: "x", promptVersion: 0 }).ok).toBe(false);
    expect(validateRequest({ prompt: "x", promptVersion: 1.5 }).ok).toBe(false);
  });

  it("rejects a malformed currentPatch", () => {
    const result = validateRequest({ prompt: "x", currentPatch: { filter: { cutoff: "nope" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});
