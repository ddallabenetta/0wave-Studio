import { describe, expect, it } from "vitest";
import { mergePatch } from "@/lib/state/mergePatch";
import { defaultSynthState } from "@/lib/schema/factories";

describe("mergePatch", () => {
  it("keeps groups absent from the patch untouched", () => {
    const current = defaultSynthState();
    const merged = mergePatch(current, { filter: { cutoff: 500, resonance: 3 } });

    expect(merged.filter.cutoff).toBe(500);
    expect(merged.filter.resonance).toBe(3);
    expect(merged.osc1).toEqual(current.osc1);
    expect(merged.lfo).toEqual(current.lfo);
    expect(merged.output).toEqual(current.output);
  });

  it("merges partial groups onto the current group", () => {
    const current = defaultSynthState();
    const merged = mergePatch(current, { filter: { cutoff: 250 } });

    expect(merged.filter.cutoff).toBe(250);
    // Untouched parameter of the same group survives the partial merge.
    expect(merged.filter.resonance).toBe(current.filter.resonance);
  });

  it("replaces the effects chain wholesale when present", () => {
    const current = defaultSynthState();
    const merged = mergePatch(current, { effects: [current.effects[0]] });

    expect(merged.effects).toHaveLength(1);
    expect(merged.effects[0]).toBe(current.effects[0]);
  });

  it("assigns scalar groups directly", () => {
    const current = defaultSynthState();
    const merged = mergePatch(current, { filterEnvAmount: 0.6 });

    expect(merged.filterEnvAmount).toBe(0.6);
    expect(merged.filterEnvAmount).not.toBe(current.filterEnvAmount);
  });

  it("does not mutate the current state", () => {
    const current = defaultSynthState();
    const before = structuredClone(current);

    mergePatch(current, { filter: { cutoff: 123 }, output: { gain: 0.1 }, filterEnvAmount: -0.5 });

    expect(current).toEqual(before);
  });

  it("returns a new object reference even for an empty patch", () => {
    const current = defaultSynthState();
    expect(mergePatch(current, {})).not.toBe(current);
  });
});
