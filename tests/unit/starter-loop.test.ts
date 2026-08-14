import { beforeEach, describe, expect, it } from "vitest";
import { buildStarterLoop } from "@/lib/presets/starterLoop";
import { flattenTrackNotes } from "@/components/playground/usePlaybackSync";
import { useProjectStore } from "@/lib/state/project-store";
import { createEmptyProject } from "@/lib/schema/factories";
import { SYSTEM_PRESETS } from "@/lib/presets";

function fresh() {
  useProjectStore.getState().loadProject(createEmptyProject());
}

beforeEach(fresh);

describe("starter loop", () => {
  it("builds four playable tracks from an empty project", () => {
    const trackIds = buildStarterLoop();
    const { project } = useProjectStore.getState();

    expect(trackIds).toHaveLength(4);
    expect(project.tracks).toHaveLength(4);
    expect(project.patterns).toHaveLength(4);

    for (const track of project.tracks) {
      // Every part must actually make a sound: a track with no sound, no
      // clip or an empty pattern would look right and play silence.
      expect(track.soundId).toBeTruthy();
      expect(track.clips).toHaveLength(1);
      expect(flattenTrackNotes(project, track).length).toBeGreaterThan(0);
    }
  });

  it("loops the arrangement over its own four bars", () => {
    buildStarterLoop();
    const { loopRange } = useProjectStore.getState().project;
    expect(loopRange).toEqual({ enabled: true, startBeat: 0, endBeat: 16 });
  });

  it("repeats each one-bar pattern across the whole clip", () => {
    buildStarterLoop();
    const { project } = useProjectStore.getState();
    const kick = project.tracks.find((track) => track.name === "Kick");
    expect(kick).toBeDefined();

    const notes = flattenTrackNotes(project, kick!);
    // Four beats per bar, four bars, one kick on each beat.
    expect(notes).toHaveLength(16);
    expect(notes.every((note) => note.startBeat < 16)).toBe(true);
  });

  it("reuses library sounds of the same name instead of duplicating them", () => {
    const store = useProjectStore.getState();
    for (const preset of SYSTEM_PRESETS) store.addSound(structuredClone(preset));
    const before = useProjectStore.getState().project.sounds.length;

    buildStarterLoop();

    const after = useProjectStore.getState().project.sounds;
    expect(after).toHaveLength(before);
    for (const track of useProjectStore.getState().project.tracks) {
      expect(after.some((sound) => sound.id === track.soundId)).toBe(true);
    }
  });

  it("leaves headroom on the master by starting the parts below unity", () => {
    buildStarterLoop();
    const volumes = useProjectStore.getState().project.tracks.map((t) => t.volume);
    // Four parts at the 0.8 track default sum well past the master's
    // headroom and clip on the first play.
    expect(volumes.every((volume) => volume < 0.8)).toBe(true);
    expect(volumes.reduce((sum, volume) => sum + volume, 0)).toBeLessThan(2);
  });
});
