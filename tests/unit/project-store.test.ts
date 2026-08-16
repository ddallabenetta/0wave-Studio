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

describe("applyPatchToSound", () => {
  it("merges only the groups present in the patch", () => {
    const store = useProjectStore.getState();
    const sound = createSynthSound("Bass");
    store.addSound(sound);

    store.applyPatchToSound(sound.id, { filter: { mode: "lowpass", cutoff: 420, resonance: 0.8 } });
    const updated = useProjectStore.getState().project.sounds[0];

    expect(updated.synthState?.filter.cutoff).toBe(420);
    // Untouched groups survive untouched.
    expect(updated.synthState?.osc1).toEqual(sound.synthState?.osc1);
  });

  it("is a single undoable mutation: undo reverts it, redo reapplies it", () => {
    const store = useProjectStore.getState();
    const sound = createSynthSound("Bass");
    store.addSound(sound);
    const pastBefore = useProjectStore.getState().past.length;
    const originalCutoff = sound.synthState?.filter.cutoff;

    store.applyPatchToSound(sound.id, { filter: { mode: "lowpass", cutoff: 150, resonance: 0.8 } });
    expect(useProjectStore.getState().project.sounds[0].synthState?.filter.cutoff).toBe(150);
    // One undoable entry, not one per group.
    expect(useProjectStore.getState().past.length).toBe(pastBefore + 1);

    store.undo();
    expect(useProjectStore.getState().project.sounds[0].synthState?.filter.cutoff).toBe(originalCutoff);

    store.redo();
    expect(useProjectStore.getState().project.sounds[0].synthState?.filter.cutoff).toBe(150);
  });

  it("bumps the sound's updatedAt", () => {
    const store = useProjectStore.getState();
    const sound = createSynthSound("Bass");
    store.addSound(sound);
    // Pin the timestamp to a fixed past value so the bump is measurable
    // rather than relying on millisecond timing.
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        sounds: s.project.sounds.map((x) =>
          x.id === sound.id ? { ...x, updatedAt: "2000-01-01T00:00:00.000Z" } : x,
        ),
      },
    }));

    store.applyPatchToSound(sound.id, { output: { gain: 0.5, velocitySensitivity: 0.6 } });

    expect(useProjectStore.getState().project.sounds[0].updatedAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  it("does nothing for a missing sound", () => {
    const store = useProjectStore.getState();
    const projectBefore = useProjectStore.getState().project;

    store.applyPatchToSound("missing", { filter: { mode: "lowpass", cutoff: 100, resonance: 0.8 } });

    const after = useProjectStore.getState();
    expect(after.project).toBe(projectBefore); // no mutation
    expect(after.past).toHaveLength(0); // no undo entry
    expect(after.dirty).toBe(false);
  });

  it("does nothing for a sound without synthState", () => {
    const store = useProjectStore.getState();
    const sample = { ...createSynthSound("S"), type: "sample" as const, synthState: undefined };
    store.addSound(sample);
    const projectBefore = useProjectStore.getState().project;

    store.applyPatchToSound(sample.id, { filter: { mode: "lowpass", cutoff: 100, resonance: 0.8 } });

    expect(useProjectStore.getState().project).toBe(projectBefore);
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

describe("moveClipToTrack", () => {
  /** One instrument track holding a pattern clip, plus a second track. */
  function twoTracks() {
    const store = useProjectStore.getState();
    const patternId = store.addPattern();
    const from = store.addTrack("instrument");
    const to = store.addTrack("instrument");
    store.addClip(from, {
      kind: "pattern",
      id: "clip-1",
      patternId,
      startBeat: 4,
      lengthBeats: 4,
      loopEnabled: true,
      transpose: 0,
      velocityMultiplier: 1,
    });
    return { from, to, patternId };
  }

  it("moves a pattern clip to another instrument track, keeping its id", () => {
    const { from, to } = twoTracks();
    useProjectStore.getState().moveClipToTrack(from, to, "clip-1");
    const tracks = useProjectStore.getState().project.tracks;
    expect(tracks.find((t) => t.id === from)?.clips).toHaveLength(0);
    expect(tracks.find((t) => t.id === to)?.clips.map((c) => c.id)).toEqual(["clip-1"]);
    expect(tracks.find((t) => t.id === to)?.clips[0].startBeat).toBe(4);
  });

  it("refuses to drop a pattern clip on an audio track", () => {
    const { from } = twoTracks();
    const audio = useProjectStore.getState().addTrack("audio");
    useProjectStore.getState().moveClipToTrack(from, audio, "clip-1");
    const tracks = useProjectStore.getState().project.tracks;
    expect(tracks.find((t) => t.id === from)?.clips).toHaveLength(1);
    expect(tracks.find((t) => t.id === audio)?.clips).toHaveLength(0);
  });

  it("leaves the document untouched for the same track or an unknown clip", () => {
    const { from, to } = twoTracks();
    const before = useProjectStore.getState().project;
    useProjectStore.getState().moveClipToTrack(from, from, "clip-1");
    useProjectStore.getState().moveClipToTrack(from, to, "nope");
    expect(useProjectStore.getState().project.tracks.find((t) => t.id === from)?.clips).toHaveLength(1);
    expect(useProjectStore.getState().project.tracks.find((t) => t.id === to)?.clips).toHaveLength(0);
    // Identity, not just contents: a rejected move must not bump updatedAt,
    // mark the project dirty, or push an undo entry.
    expect(useProjectStore.getState().project).toBe(before);
  });

  it("is one undoable step", () => {
    const { from, to } = twoTracks();
    useProjectStore.getState().moveClipToTrack(from, to, "clip-1");
    useProjectStore.getState().undo();
    const tracks = useProjectStore.getState().project.tracks;
    expect(tracks.find((t) => t.id === from)?.clips).toHaveLength(1);
    expect(tracks.find((t) => t.id === to)?.clips).toHaveLength(0);
  });
});

describe("drag-rate updates coalesce into one undo step", () => {
  it("keeps a single snapshot for a clip drag", () => {
    const store = useProjectStore.getState();
    const patternId = store.addPattern();
    const trackId = store.addTrack("instrument");
    store.addClip(trackId, {
      kind: "pattern",
      id: "clip-1",
      patternId,
      startBeat: 0,
      lengthBeats: 4,
      loopEnabled: true,
      transpose: 0,
      velocityMultiplier: 1,
    });
    const depth = useProjectStore.getState().past.length;

    // One gesture: the first frame is undoable, the rest are not.
    useProjectStore.getState().updateClip(trackId, "clip-1", (c) => void (c.startBeat = 1), { undoable: true });
    for (const beat of [2, 3, 4, 5]) {
      useProjectStore.getState().updateClip(trackId, "clip-1", (c) => void (c.startBeat = beat), {
        undoable: false,
      });
    }
    expect(useProjectStore.getState().past.length).toBe(depth + 1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.tracks[0].clips[0].startBeat).toBe(0);
  });
});
