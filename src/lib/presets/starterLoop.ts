/**
 * The starter loop.
 *
 * A blank Playground is the point where someone who does not make music
 * gives up: an empty timeline asks for a track, a sound, a pattern, a clip
 * and a set of notes before it makes a single sound. This builds all of
 * that in one action — four tracks playing a plain four-on-the-floor with
 * a bass line, looping over four bars — so the first interaction is
 * pressing play, not assembling a data model.
 *
 * Everything it creates is ordinary project state: normal tracks, normal
 * patterns, normal notes. There is nothing special about them afterwards,
 * and every one can be edited or deleted like anything else.
 */
import { createSoundFromPreset } from "./index";
import { useProjectStore } from "@/lib/state/project-store";
import { createId } from "@/lib/schema/factories";
import type { ID, NoteEvent } from "@/lib/schema/types";

/** Bars the starter loop spans. One pattern bar, repeated. */
const BARS = 4;
const BEATS_PER_BAR = 4;
const LOOP_BEATS = BARS * BEATS_PER_BAR;

type SeedNote = Pick<NoteEvent, "pitch" | "startBeat" | "durationBeats" | "velocity">;

/**
 * Part names double as the track and pattern name. They are proper nouns
 * of the instrument (like the preset names themselves) rather than UI copy,
 * so they are not translated.
 */
interface SeedTrack {
  /** Preset to play the part with, and the name the part takes. */
  preset: string;
  name: string;
  notes: SeedNote[];
}

const hat = (startBeat: number, velocity: number): SeedNote => ({
  pitch: 60,
  startBeat,
  durationBeats: 0.2,
  velocity,
});

/**
 * One bar each. Kick on every beat, snare on the backbeat, offbeat hats,
 * and a three-note bass figure on E-G-A: enough to sound intentional
 * without pretending to be a finished idea.
 */
const SEED: SeedTrack[] = [
  {
    preset: "Kick",
    name: "Kick",
    notes: [0, 1, 2, 3].map((beat) => ({
      pitch: 60,
      startBeat: beat,
      durationBeats: 0.35,
      velocity: 112,
    })),
  },
  {
    preset: "Snare",
    name: "Snare",
    notes: [1, 3].map((beat) => ({
      pitch: 60,
      startBeat: beat,
      durationBeats: 0.3,
      velocity: 98,
    })),
  },
  {
    preset: "Noise Perc",
    name: "Hats",
    // Accented on the beat, softer off it, so the loop breathes.
    notes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat, index) =>
      hat(beat, index % 2 === 0 ? 74 : 46),
    ),
  },
  {
    preset: "Round Bass",
    name: "Bass",
    notes: [
      { pitch: 40, startBeat: 0, durationBeats: 0.9, velocity: 104 },
      { pitch: 40, startBeat: 1.5, durationBeats: 0.4, velocity: 88 },
      { pitch: 43, startBeat: 2, durationBeats: 0.9, velocity: 100 },
      { pitch: 45, startBeat: 3.5, durationBeats: 0.4, velocity: 92 },
    ],
  },
];

/**
 * Reuse the seeded library sound of that name when it is there, otherwise
 * create one from the preset catalog. Reusing matters: the sound the
 * starter loop plays is then the same one the library shows, so editing it
 * in the Studio audibly changes the loop.
 */
function soundIdForPreset(presetName: string): ID {
  const store = useProjectStore.getState();
  const existing = store.project.sounds.find((sound) => sound.name === presetName);
  if (existing) return existing.id;
  const created = createSoundFromPreset(presetName);
  store.addSound(created);
  return created.id;
}

/**
 * Build the loop and return the created track ids in display order.
 * Selecting the first one is left to the caller, which knows whether the
 * user is looking at the Playground yet.
 */
export function buildStarterLoop(): ID[] {
  const store = useProjectStore.getState();
  const trackIds: ID[] = [];

  for (const seed of SEED) {
    const soundId = soundIdForPreset(seed.preset);
    const trackId = store.addTrack("instrument", soundId);
    store.renameTrack(trackId, seed.name);

    const patternId = store.addPattern(BEATS_PER_BAR, 4);
    store.updatePattern(patternId, (pattern) => {
      pattern.name = seed.name;
    });
    for (const note of seed.notes) {
      store.addNote(patternId, { ...note, muted: false });
    }

    // One clip per track covering the whole loop; the pattern repeats
    // inside it rather than being copied four times.
    store.addClip(trackId, {
      kind: "pattern",
      id: createId(),
      patternId,
      startBeat: 0,
      lengthBeats: LOOP_BEATS,
      loopEnabled: true,
      transpose: 0,
      velocityMultiplier: 1,
    });

    trackIds.push(trackId);
  }

  store.setLoopRange({ enabled: true, startBeat: 0, endBeat: LOOP_BEATS });
  return trackIds;
}
