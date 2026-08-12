import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "@/lib/state/project-store";
import { createSynthSound, createEmptyProject } from "@/lib/schema/factories";

function fresh() {
  useProjectStore.getState().loadProject(createEmptyProject());
}

beforeEach(fresh);

describe("project store lifecycle", () => {
  it("loads a clean project", () => {
    expect(useProjectStore.getState().project.sounds).toHaveLength(0);
    expect(useProjectStore.getState().canUndo()).toBe(false);
  });

  it("adds and deletes sounds, cleaning track references", () => {
    const store = useProjectStore.getState();
    const sound = createSynthSound("Bass");
    store.addSound(sound);
    const trackId = store.addTrack("instrument", sound.id);
    expect(useProjectStore.getState().project.tracks[0].soundId).toBe(sound.id);

    store.deleteSound(sound.id);
    expect(useProjectStore.getState().project.sounds).toHaveLength(0);
    expect(useProjectStore.getState().project.tracks.find((t) => t.id === trackId)?.soundId).toBeUndefined();
  });
});

describe("undo/redo", () => {
  it("undoes and redoes sound additions", () => {
    const store = useProjectStore.getState();
    store.addSound(createSynthSound("X"));
    expect(useProjectStore.getState().project.sounds).toHaveLength(1);
    expect(useProjectStore.getState().canUndo()).toBe(true);

    store.undo();
    expect(useProjectStore.getState().project.sounds).toHaveLength(0);
    store.redo();
    expect(useProjectStore.getState().project.sounds).toHaveLength(1);
  });

  it("does not snapshot non-undoable updates", () => {
    const store = useProjectStore.getState();
    store.addSound(createSynthSound("A"));
    const before = useProjectStore.getState().past.length;
    store.setTempo(140);
    expect(useProjectStore.getState().past.length).toBe(before);
  });

  it("caps the undo stack", () => {
    const store = useProjectStore.getState();
    for (let i = 0; i < 120; i += 1) store.addSound(createSynthSound(`s${i}`));
    expect(useProjectStore.getState().past.length).toBeLessThanOrEqual(100);
  });
});

describe("NoteEvent is the single canonical model", () => {
  it("Pattern Editor and Piano Roll both see the same notes array", () => {
    const store = useProjectStore.getState();
    const patternId = store.addPattern(4, 4);
    const noteId = store.addNote(patternId, { pitch: 60, startBeat: 0, durationBeats: 0.5, velocity: 100, muted: false });

    // A Piano-Roll-style edit: move pitch and start off-grid.
    store.updateNote(patternId, noteId, (n) => {
      n.pitch = 64;
      n.startBeat = 0.3;
    });

    const pattern = useProjectStore.getState().project.patterns.find((p) => p.id === patternId)!;
    expect(pattern.notes).toHaveLength(1);
    expect(pattern.notes[0].pitch).toBe(64);
    expect(pattern.notes[0].startBeat).toBeCloseTo(0.3);

    // A Pattern-Editor-style edit through the same model.
    store.updateNote(patternId, noteId, (n) => void (n.velocity = 80));
    expect(useProjectStore.getState().project.patterns[0].notes[0].velocity).toBe(80);

    store.deleteNote(patternId, noteId);
    expect(useProjectStore.getState().project.patterns[0].notes).toHaveLength(0);
  });
});

describe("tracks", () => {
  it("duplicates tracks with fresh clip ids", () => {
    const store = useProjectStore.getState();
    const trackId = store.addTrack();
    store.addClip(trackId, {
      kind: "pattern",
      id: "clip-1",
      patternId: "p-1",
      startBeat: 0,
      lengthBeats: 4,
      loopEnabled: false,
      transpose: 0,
      velocityMultiplier: 1,
    });
    const copyId = store.duplicateTrack(trackId);
    const { tracks } = useProjectStore.getState().project;
    const copy = tracks.find((t) => t.id === copyId)!;
    expect(copy.clips[0].id).not.toBe("clip-1");
  });

  it("reorders tracks", () => {
    const store = useProjectStore.getState();
    const a = store.addTrack();
    const b = store.addTrack();
    store.renameTrack(a, "Alpha");
    store.renameTrack(b, "Beta");
    store.reorderTracks(1, 0);
    const names = useProjectStore.getState().project.tracks.map((t) => t.name);
    expect(names).toEqual(["Beta", "Alpha"]);
  });

  it("deleting a pattern also removes its clips from tracks", () => {
    const store = useProjectStore.getState();
    const patternId = store.addPattern();
    const trackId = store.addTrack();
    store.addClip(trackId, {
      kind: "pattern",
      id: "c1",
      patternId,
      startBeat: 0,
      lengthBeats: 4,
      loopEnabled: false,
      transpose: 0,
      velocityMultiplier: 1,
    });
    store.deletePattern(patternId);
    expect(useProjectStore.getState().project.patterns).toHaveLength(0);
    expect(useProjectStore.getState().project.tracks[0].clips).toHaveLength(0);
  });
});
