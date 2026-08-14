/**
 * 0wave Studio project store (zustand + immer).
 *
 * Owns the single serializable Project document and every mutation on it.
 * Undo/redo is snapshot-based with structural sharing, capped at UNDO_LIMIT.
 *
 * This store NEVER holds AudioNodes, AudioBuffers, Blobs, or playback state.
 * Runtime audio state lives in the engine; UI-only state in ui-store.
 */
import { create } from "zustand";
import { produce } from "immer";
import type {
  AudioAsset,
  Clip,
  ID,
  NoteEvent,
  Pattern,
  Project,
  SoundDefinition,
  SynthState,
  Track,
} from "../schema/types";
import { createEmptyProject, createId, createPattern, createTrack } from "../schema/factories";
import { mergePatch } from "./mergePatch";

const UNDO_LIMIT = 100;

export type SaveState = "idle" | "saving" | "saved" | "error" | "quota-error";

interface ProjectStoreState {
  project: Project;
  /** True when project differs from last persisted snapshot. */
  dirty: boolean;
  saveState: SaveState;
  past: Project[];
  future: Project[];

  /* Lifecycle */
  loadProject(project: Project): void;
  newProject(): void;
  setSaveState(state: SaveState): void;
  markSaved(): void;

  /* Undo/redo */
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  /* Project-level */
  setProjectName(name: string): void;
  setTempo(bpm: number): void;
  setSwing(swing: number): void;
  setLoopRange(range: Project["loopRange"]): void;

  /* Sounds */
  addSound(sound: SoundDefinition): void;
  updateSound(id: ID, recipe: (sound: SoundDefinition) => void, options?: { undoable?: boolean }): void;
  renameSound(id: ID, name: string): void;
  duplicateSound(id: ID): ID | null;
  deleteSound(id: ID): void;
  /**
   * Apply an AI patch proposal to a sound's synthState in ONE undoable
   * mutation, so a single Undo reverts the whole apply (ADR-006). Only the
   * groups present in the patch are merged; everything else is untouched.
   * No-op (no store change, no undo entry) when the sound is missing or has
   * no synthState.
   */
  applyPatchToSound(id: ID, patch: Partial<SynthState>): void;

  /* Tracks */
  addTrack(type?: Track["type"], soundId?: ID): ID;
  updateTrack(id: ID, recipe: (track: Track) => void): void;
  renameTrack(id: ID, name: string): void;
  duplicateTrack(id: ID): ID | null;
  deleteTrack(id: ID): void;
  reorderTracks(fromIndex: number, toIndex: number): void;
  assignSoundToTrack(trackId: ID, soundId: ID | null): void;

  /* Patterns */
  addPattern(lengthBeats?: number, resolution?: number): ID;
  updatePattern(id: ID, recipe: (pattern: Pattern) => void, options?: { undoable?: boolean }): void;
  duplicatePattern(id: ID): ID | null;
  deletePattern(id: ID): void;

  /* Notes (canonical NoteEvent model shared by Pattern Editor + Piano Roll) */
  addNote(patternId: ID, note: Omit<NoteEvent, "id">): ID;
  updateNote(patternId: ID, noteId: ID, recipe: (note: NoteEvent) => void, options?: { undoable?: boolean }): void;
  deleteNote(patternId: ID, noteId: ID): void;
  deleteNotes(patternId: ID, noteIds: ID[]): void;
  clearPatternNotes(patternId: ID): void;

  /* Clips */
  addClip(trackId: ID, clip: Clip): void;
  updateClip(trackId: ID, clipId: ID, recipe: (clip: Clip) => void): void;
  deleteClip(trackId: ID, clipId: ID): void;
  duplicateClip(trackId: ID, clipId: ID): ID | null;

  /* Audio assets (metadata only; blobs live in the persistence layer) */
  addAsset(asset: AudioAsset): void;
  deleteAsset(id: ID): void;
}

function touch(project: Project): void {
  project.updatedAt = new Date().toISOString();
}

export const useProjectStore = create<ProjectStoreState>()((set, get) => {
  /**
   * Every undoable mutation flows through here: snapshot → immer produce →
   * set. Non-undoable high-frequency updates (live synth tweaks) pass
   * undoable:false and leave the undo stack untouched.
   */
  function mutate(recipe: (project: Project) => void, options?: { undoable?: boolean }) {
    const undoable = options?.undoable !== false;
    set((state) => {
      const next = produce(state.project, (draft) => {
        recipe(draft);
        touch(draft);
      });
      if (next === state.project) return state;
      return {
        project: next,
        dirty: true,
        future: [],
        past: undoable ? [...state.past.slice(-(UNDO_LIMIT - 1)), state.project] : state.past,
      };
    });
  }

  return {
    project: createEmptyProject(),
    dirty: false,
    saveState: "idle",
    past: [],
    future: [],

    loadProject(project) {
      set({ project, dirty: false, saveState: "saved", past: [], future: [] });
    },
    newProject() {
      set({ project: createEmptyProject(), dirty: false, saveState: "idle", past: [], future: [] });
    },
    setSaveState(saveState) {
      set({ saveState });
    },
    markSaved() {
      set({ dirty: false, saveState: "saved" });
    },

    undo() {
      set((state) => {
        const previous = state.past[state.past.length - 1];
        if (!previous) return state;
        return {
          project: previous,
          past: state.past.slice(0, -1),
          future: [state.project, ...state.future].slice(0, UNDO_LIMIT),
          dirty: true,
        };
      });
    },
    redo() {
      set((state) => {
        const next = state.future[0];
        if (!next) return state;
        return {
          project: next,
          past: [...state.past.slice(-(UNDO_LIMIT - 1)), state.project],
          future: state.future.slice(1),
          dirty: true,
        };
      });
    },
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    setProjectName(name) {
      mutate((p) => void (p.name = name.slice(0, 120) || p.name));
    },
    setTempo(bpm) {
      mutate((p) => void (p.tempo = Math.min(300, Math.max(30, bpm))), { undoable: false });
    },
    setSwing(swing) {
      mutate((p) => void (p.swing = Math.min(1, Math.max(0, swing))), { undoable: false });
    },
    setLoopRange(range) {
      mutate((p) => void (p.loopRange = range), { undoable: false });
    },

    addSound(sound) {
      mutate((p) => void p.sounds.push(sound));
    },
    updateSound(id, recipe, options) {
      mutate((p) => {
        const sound = p.sounds.find((s) => s.id === id);
        if (sound) {
          recipe(sound);
          sound.updatedAt = new Date().toISOString();
        }
      }, options);
    },
    renameSound(id, name) {
      get().updateSound(id, (s) => void (s.name = name.slice(0, 80) || s.name));
    },
    duplicateSound(id) {
      const source = get().project.sounds.find((s) => s.id === id);
      if (!source) return null;
      const copy: SoundDefinition = {
        ...structuredClone(source),
        id: createId(),
        name: `${source.name} Copy`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { ...source.metadata, origin: source.metadata.origin === "system-preset" ? "user" : source.metadata.origin },
      };
      get().addSound(copy);
      return copy.id;
    },
    deleteSound(id) {
      mutate((p) => {
        p.sounds = p.sounds.filter((s) => s.id !== id);
        for (const track of p.tracks) {
          if (track.soundId === id) track.soundId = undefined;
        }
      });
    },
    applyPatchToSound(id, patch) {
      // Guard before mutating: a missing sound must not bump project.updatedAt
      // or push an undo entry (mutate() touches the project unconditionally).
      const sound = get().project.sounds.find((s) => s.id === id);
      if (!sound?.synthState) return;
      get().updateSound(
        id,
        (draft) => {
          if (draft.synthState) draft.synthState = mergePatch(draft.synthState, patch);
        },
        { undoable: true },
      );
    },

    addTrack(type = "instrument", soundId) {
      const id = createId();
      mutate((p) => {
        const track = createTrack(`Track ${p.tracks.length + 1}`, type, p.tracks.length);
        track.id = id;
        if (soundId) track.soundId = soundId;
        p.tracks.push(track);
      });
      return id;
    },
    updateTrack(id, recipe) {
      mutate((p) => {
        const track = p.tracks.find((t) => t.id === id);
        if (track) recipe(track);
      });
    },
    renameTrack(id, name) {
      get().updateTrack(id, (t) => void (t.name = name.slice(0, 80) || t.name));
    },
    duplicateTrack(id) {
      const source = get().project.tracks.find((t) => t.id === id);
      if (!source) return null;
      const newId = createId();
      mutate((p) => {
        const copy: Track = structuredClone(source);
        copy.id = newId;
        copy.name = `${source.name} Copy`;
        copy.clips = copy.clips.map((c) => ({ ...c, id: createId() }));
        p.tracks.push(copy);
      });
      return newId;
    },
    deleteTrack(id) {
      mutate((p) => void (p.tracks = p.tracks.filter((t) => t.id !== id)));
    },
    reorderTracks(fromIndex, toIndex) {
      mutate((p) => {
        if (fromIndex < 0 || fromIndex >= p.tracks.length) return;
        const clamped = Math.min(p.tracks.length - 1, Math.max(0, toIndex));
        const [moved] = p.tracks.splice(fromIndex, 1);
        p.tracks.splice(clamped, 0, moved);
      });
    },
    assignSoundToTrack(trackId, soundId) {
      get().updateTrack(trackId, (t) => void (t.soundId = soundId ?? undefined));
    },

    addPattern(lengthBeats = 4, resolution = 4) {
      const id = createId();
      mutate((p) => {
        const pattern = createPattern(`Pattern ${p.patterns.length + 1}`, lengthBeats, resolution);
        pattern.id = id;
        p.patterns.push(pattern);
      });
      return id;
    },
    updatePattern(id, recipe, options) {
      mutate((p) => {
        const pattern = p.patterns.find((pt) => pt.id === id);
        if (pattern) {
          recipe(pattern);
          pattern.updatedAt = new Date().toISOString();
        }
      }, options);
    },
    duplicatePattern(id) {
      const source = get().project.patterns.find((pt) => pt.id === id);
      if (!source) return null;
      const newId = createId();
      mutate((p) => {
        const copy: Pattern = structuredClone(source);
        copy.id = newId;
        copy.name = `${source.name} Copy`;
        copy.notes = copy.notes.map((n) => ({ ...n, id: createId() }));
        p.patterns.push(copy);
      });
      return newId;
    },
    deletePattern(id) {
      mutate((p) => {
        p.patterns = p.patterns.filter((pt) => pt.id !== id);
        for (const track of p.tracks) {
          track.clips = track.clips.filter((c) => !(c.kind === "pattern" && c.patternId === id));
        }
      });
    },

    addNote(patternId, note) {
      const id = createId();
      get().updatePattern(patternId, (pt) => {
        pt.notes.push({ ...note, id });
      });
      return id;
    },
    updateNote(patternId, noteId, recipe, options) {
      get().updatePattern(patternId, (pt) => {
        const note = pt.notes.find((n) => n.id === noteId);
        if (note) recipe(note);
      }, options);
    },
    deleteNote(patternId, noteId) {
      get().updatePattern(patternId, (pt) => {
        pt.notes = pt.notes.filter((n) => n.id !== noteId);
      });
    },
    deleteNotes(patternId, noteIds) {
      const ids = new Set(noteIds);
      get().updatePattern(patternId, (pt) => {
        pt.notes = pt.notes.filter((n) => !ids.has(n.id));
      });
    },
    clearPatternNotes(patternId) {
      get().updatePattern(patternId, (pt) => void (pt.notes = []));
    },

    addClip(trackId, clip) {
      get().updateTrack(trackId, (t) => void t.clips.push(clip));
    },
    updateClip(trackId, clipId, recipe) {
      get().updateTrack(trackId, (t) => {
        const clip = t.clips.find((c) => c.id === clipId);
        if (clip) recipe(clip);
      });
    },
    deleteClip(trackId, clipId) {
      get().updateTrack(trackId, (t) => {
        t.clips = t.clips.filter((c) => c.id !== clipId);
      });
    },
    duplicateClip(trackId, clipId) {
      const track = get().project.tracks.find((t) => t.id === trackId);
      const source = track?.clips.find((c) => c.id === clipId);
      if (!source) return null;
      const copy: Clip = { ...structuredClone(source), id: createId(), startBeat: source.startBeat + source.lengthBeats };
      get().addClip(trackId, copy);
      return copy.id;
    },

    addAsset(asset) {
      mutate((p) => void p.assets.push(asset));
    },
    deleteAsset(id) {
      mutate((p) => {
        p.assets = p.assets.filter((a) => a.id !== id);
        p.sounds = p.sounds.filter((s) => s.sampleState?.assetId !== id);
        for (const track of p.tracks) {
          track.clips = track.clips.filter((c) => !(c.kind === "audio" && c.assetId === id));
        }
      });
    },
  };
});

/* Selectors */
export const selectSounds = (s: ProjectStoreState) => s.project.sounds;
export const selectTracks = (s: ProjectStoreState) => s.project.tracks;
export const selectPatterns = (s: ProjectStoreState) => s.project.patterns;
export const selectTempo = (s: ProjectStoreState) => s.project.tempo;
export const selectSwing = (s: ProjectStoreState) => s.project.swing;
export const selectLoopRange = (s: ProjectStoreState) => s.project.loopRange;
export const selectSoundById = (s: ProjectStoreState, id: ID) =>
  s.project.sounds.find((sound) => sound.id === id);
