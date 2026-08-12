import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { defaultSynthState } from "@/lib/schema/factories";
import {
  applyMacro,
  applyPadX,
  applyPadY,
  isSustainedSound,
  readMacro,
  readPadX,
  readPadY,
} from "@/lib/audio/macros";
import { renderWaveformPreview } from "@/lib/audio/waveformPreview";
import { setAtPath } from "@/components/studio/useSynthBinding";
import { WaveformPreview } from "@/components/studio/WaveformPreview";

function cloneState() {
  return structuredClone(defaultSynthState());
}

/** Apply a patch write onto a state object (mirrors the store recipe). */
function applyWrite(state: ReturnType<typeof cloneState>, path: string, value: number | string | boolean) {
  setAtPath(state as unknown as Record<string, unknown>, path, value);
}

describe("macros", () => {
  it("readMacro returns 0..1 for every slider on the init patch", () => {
    const state = cloneState();
    for (const id of ["punch", "vivace", "body", "space"] as const) {
      const value = readMacro(state, id);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("applying a macro writes deterministic paths and reads back close to the input", () => {
    const state = cloneState();
    const target = 0.35;
    for (const id of ["punch", "vivace", "body", "space"] as const) {
      const writes = applyMacro(id, target);
      expect(writes.length).toBeGreaterThan(0);
      for (const w of writes) applyWrite(state, w.path, w.value);
      expect(readMacro(state, id)).toBeCloseTo(target, 1);
    }
  });

  it("punch macro maps to a fast attack at 1 and a soft one at 0", () => {
    const hard = applyMacro("punch", 1);
    const soft = applyMacro("punch", 0);
    const hardAttack = hard.find((w) => w.path === "ampEnvelope.attack");
    const softAttack = soft.find((w) => w.path === "ampEnvelope.attack");
    expect(hardAttack?.value).toBeLessThan(0.01);
    expect(softAttack?.value).toBeGreaterThan(0.05);
  });

  it("body macro enables osc2 when raised and disables it at zero", () => {
    const on = applyMacro("body", 0.5);
    expect(on).toContainEqual({ path: "osc2.enabled", value: true });
    const off = applyMacro("body", 0);
    expect(off).toContainEqual({ path: "osc2.enabled", value: false });
  });

  it("space macro bypasses the reverb when the slider is at zero", () => {
    const writes = applyMacro("space", 0);
    expect(writes).toContainEqual({ path: "effects.3.bypass", value: true });
  });

  it("vivace macro forces the LFO off sync so the rate is audible", () => {
    const writes = applyMacro("vivace", 0.8);
    expect(writes).toContainEqual({ path: "lfo.sync", value: false });
  });

  it("pad readback stays within bounds and pad applies are invertible", () => {
    const state = cloneState();
    expect(readPadX(state)).toBeGreaterThanOrEqual(0);
    expect(readPadX(state)).toBeLessThanOrEqual(1);
    expect(readPadY(state)).toBeGreaterThanOrEqual(0);
    expect(readPadY(state)).toBeLessThanOrEqual(1);

    const [xWrite] = applyPadX(0.7);
    const [yWrite] = applyPadY(0.4);
    applyWrite(state, xWrite.path, xWrite.value);
    applyWrite(state, yWrite.path, yWrite.value);
    expect(readPadX(state)).toBeCloseTo(0.7, 3);
    expect(readPadY(state)).toBeCloseTo(0.4, 3);
  });

  it("classifies a slow-attack sustaining patch as sustained and a kick as percussive", () => {
    const pad = cloneState();
    pad.ampEnvelope.attack = 0.9;
    pad.ampEnvelope.sustain = 0.8;
    expect(isSustainedSound(pad)).toBe(true);

    const kick = cloneState();
    kick.ampEnvelope.attack = 0.001;
    kick.ampEnvelope.sustain = 0;
    expect(isSustainedSound(kick)).toBe(false);
  });
});

describe("waveform preview", () => {
  it("renders finite SVG paths for the default patch", () => {
    const { wavePath, envelopePath, windowSeconds } = renderWaveformPreview(cloneState());
    expect(wavePath.startsWith("M")).toBe(true);
    expect(wavePath.length).toBeGreaterThan(10);
    expect(envelopePath.startsWith("M")).toBe(true);
    expect(envelopePath.length).toBeGreaterThan(10);
    expect(windowSeconds).toBeGreaterThan(0);
  });

  it("is deterministic for the same state", () => {
    const a = renderWaveformPreview(cloneState());
    const b = renderWaveformPreview(cloneState());
    expect(a).toEqual(b);
  });

  it("changes with the patch (kick renders a different wave than a pad)", () => {
    const kick = cloneState();
    kick.osc1.waveform = "sine";
    kick.osc1.octave = -2;
    kick.ampEnvelope = { attack: 0.001, decay: 0.28, sustain: 0, release: 0.12 };
    const pad = cloneState();
    pad.osc1.waveform = "triangle";
    pad.ampEnvelope = { attack: 0.9, decay: 1.2, sustain: 0.8, release: 1.8 };
    expect(renderWaveformPreview(kick)).not.toEqual(renderWaveformPreview(pad));
  });

  it("keeps all wave samples within the -1..1 band", () => {
    const { wavePath } = renderWaveformPreview(cloneState());
    const ys = [...wavePath.matchAll(/-?\d+\.\d+(?= [LM])/g)].map((m) => Number(m[0]));
    for (const y of ys) {
      expect(Math.abs(y)).toBeLessThanOrEqual(1.001);
    }
  });

  it("renders the wave across the full viewport when the component draws it", () => {
    const { container } = render(<WaveformPreview state={cloneState()} />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(2);
    // The wave viewBox must cover x 0..1 and y -1..1, matching the path
    // coordinate space; a mismatch squeezes the wave into a corner.
    expect(svgs[0].getAttribute("viewBox")).toBe("0 -1 1 2");
    expect(svgs[1].getAttribute("viewBox")).toBe("0 0 1 1");
    const wave = svgs[0].querySelector("path");
    expect(wave?.getAttribute("d")?.startsWith("M")).toBe(true);
    const envelope = svgs[1].querySelector("path");
    expect(envelope?.getAttribute("d")?.startsWith("M")).toBe(true);
  });
});
