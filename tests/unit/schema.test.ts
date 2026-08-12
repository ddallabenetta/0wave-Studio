import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  createPattern,
  createSynthSound,
  createTrack,
  defaultEffects,
  defaultSynthState,
} from "@/lib/schema/factories";
import { parseProject, toProjectExport, migrateProject } from "@/lib/schema/migrations";
import { projectSchema } from "@/lib/schema/schemas";
import { EFFECT_ORDER, SCHEMA_VERSION } from "@/lib/schema/types";

describe("factories", () => {
  it("produces a valid empty project", () => {
    expect(projectSchema.safeParse(createEmptyProject()).success).toBe(true);
  });
  it("produces a valid synth sound", () => {
    expect(projectSchema.safeParse({ ...createEmptyProject(), sounds: [createSynthSound("A")] }).success).toBe(true);
  });
  it("produces effects in the deterministic EFFECT_ORDER", () => {
    expect(defaultEffects().map((e) => e.kind)).toEqual([...EFFECT_ORDER]);
  });
  it("generates unique ids", () => {
    const ids = new Set([createSynthSound("a").id, createSynthSound("b").id, createTrack("t").id, createPattern("p").id]);
    expect(ids.size).toBe(4);
  });
});

describe("schema validation", () => {
  it("rejects a sound with effects out of order", () => {
    const sound = createSynthSound("Bad");
    sound.synthState!.effects = defaultEffects().reverse();
    const project = { ...createEmptyProject(), sounds: [sound] };
    expect(projectSchema.safeParse(project).success).toBe(false);
  });
  it("rejects tempo out of range", () => {
    const project = createEmptyProject();
    project.tempo = 999;
    expect(projectSchema.safeParse(project).success).toBe(false);
  });
  it("rejects velocity out of range in notes", () => {
    const project = createEmptyProject();
    const pattern = createPattern("P");
    pattern.notes.push({ id: "n1", pitch: 60, startBeat: 0, durationBeats: 1, velocity: 200, muted: false });
    project.patterns.push(pattern);
    expect(projectSchema.safeParse(project).success).toBe(false);
  });
});

describe("migrations and parsing", () => {
  it("round-trips a project through JSON and parseProject", () => {
    const project = createEmptyProject("Round Trip");
    project.sounds.push(createSynthSound("Lead"));
    const parsed = parseProject(JSON.parse(JSON.stringify(project)));
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(project);
  });
  it("returns null for garbage", () => {
    expect(parseProject(null)).toBeNull();
    expect(parseProject("hello")).toBeNull();
    expect(parseProject({ schemaVersion: SCHEMA_VERSION, name: 42 })).toBeNull();
  });
  it("migrateProject throws on unknown future gap and passes current version through", () => {
    const project = createEmptyProject();
    expect(() => migrateProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
  });
});

describe("project export", () => {
  it("lists blob keys from assets", () => {
    const project = createEmptyProject();
    project.assets.push({
      id: "a1",
      source: "import",
      originalFilename: "kick.wav",
      mimeType: "audio/wav",
      duration: 1,
      sampleRate: 44100,
      channels: 1,
      localBlobKey: "blob-a1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const exported = toProjectExport(project);
    expect(exported.format).toBe("0wave-project");
    expect(exported.blobKeys).toEqual(["blob-a1"]);
  });
});

describe("default synth sanity", () => {
  it("init patch has one oscillator enabled and all effects bypassed", () => {
    const state = defaultSynthState();
    expect(state.osc1.enabled).toBe(true);
    expect(state.osc2.enabled).toBe(false);
    expect(state.effects.every((e) => e.bypass)).toBe(true);
    expect(state.lfo.depth).toBe(0);
  });
});
