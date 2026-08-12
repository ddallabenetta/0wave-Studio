/**
 * UI-only state: selection, modes, editor tabs. Nothing here persists.
 */
import { create } from "zustand";
import type { ID } from "../schema/types";
import type { AudioEngineStatus } from "../schema/types";

export type StudioMode = "synth" | "record" | "import" | "sample" | "library";
export type PlaygroundEditor = "pattern" | "piano-roll" | "clip";
export type Complexity = "basic" | "advanced";
export type BottomPanel = "editor" | "closed";

export type Selection =
  | { kind: "track"; trackId: ID }
  | { kind: "pattern-clip"; trackId: ID; clipId: ID }
  | { kind: "audio-clip"; trackId: ID; clipId: ID }
  | { kind: "note"; patternId: ID; noteId: ID }
  | null;

interface UiStoreState {
  /* Audio engine runtime mirror */
  audioStatus: AudioEngineStatus;
  masterClipping: boolean;
  transportPlaying: boolean;
  positionBeats: number;

  setAudioStatus(status: AudioEngineStatus): void;
  setMasterClipping(clipping: boolean): void;
  setTransportPlaying(playing: boolean): void;
  setPositionBeats(beats: number): void;

  /* Studio */
  studioMode: StudioMode;
  setStudioMode(mode: StudioMode): void;
  /** Sound currently open in the Studio editor. */
  editingSoundId: ID | null;
  setEditingSoundId(id: ID | null): void;
  complexity: Complexity;
  setComplexity(c: Complexity): void;
  /** Computer-keyboard octave offset for note input. */
  keyboardOctave: number;
  shiftKeyboardOctave(delta: number): void;
  /** Notes currently held (for on-screen indicator). */
  activeNotes: number[];
  setActiveNotes(notes: number[]): void;

  /* Playground */
  selection: Selection;
  setSelection(sel: Selection): void;
  activePatternId: ID | null;
  setActivePatternId(id: ID | null): void;
  playgroundEditor: PlaygroundEditor;
  setPlaygroundEditor(editor: PlaygroundEditor): void;
  bottomPanel: BottomPanel;
  setBottomPanel(panel: BottomPanel): void;
  /** Drawer with the sound library inside the Playground. */
  libraryDrawerOpen: boolean;
  setLibraryDrawerOpen(open: boolean): void;

  /* Piano roll */
  pianoRollSnap: number; // steps per beat
  setPianoRollSnap(steps: number): void;

  /* Sound pending handoff: set by "Use in Playground", consumed by Playground. */
  pendingPlaygroundSoundId: ID | null;
  setPendingPlaygroundSound(id: ID | null): void;
}

export const useUiStore = create<UiStoreState>()((set) => ({
  audioStatus: "uninitialized",
  masterClipping: false,
  transportPlaying: false,
  positionBeats: 0,
  setAudioStatus: (audioStatus) => set({ audioStatus }),
  setMasterClipping: (masterClipping) => set({ masterClipping }),
  setTransportPlaying: (transportPlaying) => set({ transportPlaying }),
  setPositionBeats: (positionBeats) => set({ positionBeats }),

  studioMode: "synth",
  setStudioMode: (studioMode) => set({ studioMode }),
  editingSoundId: null,
  setEditingSoundId: (editingSoundId) => set({ editingSoundId }),
  complexity: "basic",
  setComplexity: (complexity) => set({ complexity }),
  keyboardOctave: 0,
  shiftKeyboardOctave: (delta) =>
    set((s) => ({ keyboardOctave: Math.min(3, Math.max(-3, s.keyboardOctave + delta)) })),
  activeNotes: [],
  setActiveNotes: (activeNotes) => set({ activeNotes }),

  selection: null,
  setSelection: (selection) => set({ selection }),
  activePatternId: null,
  setActivePatternId: (activePatternId) => set({ activePatternId }),
  playgroundEditor: "pattern",
  setPlaygroundEditor: (playgroundEditor) => set({ playgroundEditor }),
  bottomPanel: "editor",
  setBottomPanel: (bottomPanel) => set({ bottomPanel }),
  libraryDrawerOpen: false,
  setLibraryDrawerOpen: (libraryDrawerOpen) => set({ libraryDrawerOpen }),

  pianoRollSnap: 4,
  setPianoRollSnap: (pianoRollSnap) => set({ pianoRollSnap }),

  pendingPlaygroundSoundId: null,
  setPendingPlaygroundSound: (pendingPlaygroundSoundId) => set({ pendingPlaygroundSoundId }),
}));
