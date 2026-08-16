"use client";

/**
 * Keeps the audio engine in sync with the Playground's project state.
 *
 * Responsibilities:
 * - create/remove track buses as tracks come and go
 * - assign sounds to tracks and push mixer values
 * - flatten every pattern clip of a track into one absolute-time note list
 *   (the scheduler holds one list per track) and reschedule on edits
 * - schedule audio clips through their track bus
 *
 * Everything here is guarded on what actually changed. The project document
 * is immutable, so a new `project` object arrives on every fader move, and
 * naively reacting to it would dispose and rebuild each track's sound engine
 * (cutting every ringing voice) and restart every audio clip several times a
 * second while dragging. Identity comparison against what was last pushed is
 * what keeps a mix tweak from interrupting the notes it is mixing.
 *
 * Nothing here runs at audio rate: it reacts to store changes only.
 */
import { useEffect, useMemo, useRef } from "react";
import { useEngine } from "@/components/hooks/useEngine";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { loadSampleBuffer } from "@/components/studio/sampleBuffers";
import type { IAudioEngine } from "@/lib/audio/api";
import type { Clip, ID, NoteEvent, Project, SoundDefinition, Track } from "@/lib/schema/types";

/**
 * Expand a track's pattern clips into a single note list positioned in
 * absolute timeline beats, baking per-clip transpose and velocity.
 */
export function flattenTrackNotes(project: Project, track: Track): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const clip of track.clips) {
    if (clip.kind !== "pattern") continue;
    const pattern = project.patterns.find((p) => p.id === clip.patternId);
    if (!pattern || pattern.notes.length === 0) continue;

    const patternLength = Math.max(pattern.lengthBeats, 0.25);
    const repeats = clip.loopEnabled ? Math.max(1, Math.ceil(clip.lengthBeats / patternLength)) : 1;

    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const offset = clip.startBeat + repeat * patternLength;
      for (const note of pattern.notes) {
        if (note.muted) continue;
        const startBeat = offset + note.startBeat;
        // Notes past the end of the clip are cut, not wrapped.
        if (startBeat >= clip.startBeat + clip.lengthBeats) continue;
        const maxDuration = clip.startBeat + clip.lengthBeats - startBeat;
        notes.push({
          id: `${clip.id}:${repeat}:${note.id}`,
          pitch: Math.max(0, Math.min(127, note.pitch + clip.transpose)),
          startBeat,
          durationBeats: Math.max(0.01, Math.min(note.durationBeats, maxDuration)),
          velocity: Math.max(0, Math.min(127, Math.round(note.velocity * clip.velocityMultiplier))),
          muted: false,
        });
      }
    }
  }
  return notes;
}

/**
 * Everything about the arrangement's audio clips that changes what is heard.
 * Rescheduling an audio clip restarts it, so it must happen when the clip
 * changed — not when some other part of the project did.
 */
export function audioClipSignature(project: Project): string {
  const parts: string[] = [
    `t:${project.tempo}`,
    `l:${project.loopRange.enabled}:${project.loopRange.startBeat}:${project.loopRange.endBeat}`,
  ];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "audio") continue;
      parts.push(
        [
          track.id,
          clip.id,
          clip.assetId,
          clip.startBeat,
          clip.lengthBeats,
          clip.offsetSeconds,
          clip.gain,
          clip.fadeIn,
          clip.fadeOut,
          clip.loopEnabled,
          clip.loopStart,
          clip.loopEnd,
        ].join(":"),
      );
    }
  }
  return parts.join("|");
}

/** Mixer values last pushed to the engine, so unchanged ones are not re-sent. */
interface MixSnapshot {
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export function usePlaybackSync(): void {
  const engine = useEngine();
  const project = useProjectStore((s) => s.project);
  const playing = useUiStore((s) => s.transportPlaying);

  /** Engine the caches below describe; a new one invalidates all of them. */
  const syncedEngine = useRef<IAudioEngine | null>(null);
  const knownTracks = useRef<string[]>([]);
  /** Sound object last assigned per track (immer identity = "unchanged"). */
  const assignedSound = useRef(new Map<ID, SoundDefinition | null>());
  const pushedMix = useRef(new Map<ID, MixSnapshot>());
  /** Clip list last flattened per track, and the patterns it was read from. */
  const scheduledFrom = useRef(new Map<ID, { clips: readonly Clip[]; patterns: Project["patterns"] }>());

  /* Track lifecycle, sound assignment, mixer values. */
  useEffect(() => {
    if (!engine) return;
    // The engine is a singleton and normally outlives every mount, but if it
    // were ever replaced these caches would describe nodes that no longer
    // exist and the new engine would be left silent.
    if (syncedEngine.current !== engine) {
      syncedEngine.current = engine;
      knownTracks.current = [];
      assignedSound.current.clear();
      pushedMix.current.clear();
      scheduledFrom.current.clear();
    }
    const currentIds = project.tracks.map((t) => t.id);

    for (const id of knownTracks.current) {
      if (currentIds.includes(id)) continue;
      engine.removeTrackNode(id);
      assignedSound.current.delete(id);
      pushedMix.current.delete(id);
      scheduledFrom.current.delete(id);
    }

    for (const track of project.tracks) {
      if (!knownTracks.current.includes(track.id)) engine.createTrackNode(track.id);

      const sound = track.soundId
        ? project.sounds.find((s) => s.id === track.soundId) ?? null
        : null;
      // Rebuild the track's sound engine only when the patch itself changed.
      // Anything else here — a fader, a mute, a clip edit — must leave the
      // ringing voices alone.
      if (assignedSound.current.get(track.id) !== sound) {
        assignedSound.current.set(track.id, sound);
        engine.assignSoundToTrack(track.id, sound);
        if (sound?.type === "sample" && sound.sampleState) {
          const asset = project.assets.find((a) => a.id === sound.sampleState?.assetId);
          if (asset) void loadSampleBuffer(engine, asset);
        }
      }

      const mix = pushedMix.current.get(track.id);
      if (!mix || mix.volume !== track.volume || mix.pan !== track.pan) {
        engine.setTrackMix(track.id, track.volume, track.pan);
      }
      if (!mix || mix.mute !== track.mute || mix.solo !== track.solo) {
        engine.setTrackMuteSolo(track.id, track.mute, track.solo);
      }
      pushedMix.current.set(track.id, {
        volume: track.volume,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo,
      });
    }
    knownTracks.current = currentIds;
  }, [engine, project.tracks, project.sounds, project.assets]);

  /* Tempo, swing, loop range. */
  useEffect(() => {
    if (!engine) return;
    engine.setTempo(project.tempo);
    engine.setSwing(project.swing);
    engine.setLoopRange(project.loopRange);
  }, [engine, project.tempo, project.swing, project.loopRange]);

  /* Pattern scheduling: rebuild the tracks whose clips or patterns changed. */
  useEffect(() => {
    if (!engine) return;
    for (const track of project.tracks) {
      const previous = scheduledFrom.current.get(track.id);
      if (previous && previous.clips === track.clips && previous.patterns === project.patterns) {
        continue;
      }
      scheduledFrom.current.set(track.id, { clips: track.clips, patterns: project.patterns });
      engine.schedulePattern(track.id, flattenTrackNotes(project, track), 0);
    }
  }, [engine, project]);

  /* Audio clips: (re)scheduled on play and whenever a clip actually changes. */
  const clipSignature = useMemo(() => audioClipSignature(project), [project]);
  useEffect(() => {
    if (!engine || !playing) return;
    let cancelled = false;
    // Read fresh state: the effect is keyed on the clip signature, not on the
    // project object, so the closure's snapshot could be one edit behind.
    void scheduleAudioClips(engine, useProjectStore.getState().project).then(() => {
      if (cancelled) engine.cancelAudioClips();
    });
    return () => {
      cancelled = true;
    };
  }, [engine, playing, clipSignature]);
}

/** How many transport loop passes of audio clips are scheduled ahead. */
const LOOP_PASSES = 16;

async function scheduleAudioClips(engine: IAudioEngine, project: Project): Promise<void> {
  engine.cancelAudioClips();
  const { loopRange } = project;
  const looping = loopRange.enabled && loopRange.endBeat > loopRange.startBeat;
  const loopLength = loopRange.endBeat - loopRange.startBeat;

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "audio") continue;
      const asset = project.assets.find((a) => a.id === clip.assetId);
      if (!asset) continue;
      const buffer = await loadSampleBuffer(engine, asset);
      if (!buffer) continue;

      // With the transport looping, the clip has to be re-scheduled for each
      // pass; a single buffer source would only sound on the first one.
      const passes = looping ? LOOP_PASSES : 1;
      for (let pass = 0; pass < passes; pass += 1) {
        engine.scheduleAudioClip(track.id, {
          buffer,
          startBeat: clip.startBeat + pass * loopLength,
          lengthBeats: clip.lengthBeats,
          offsetSeconds: clip.offsetSeconds,
          gain: clip.gain,
          fadeIn: clip.fadeIn,
          fadeOut: clip.fadeOut,
          loopEnabled: clip.loopEnabled,
          loopStart: clip.loopStart,
          loopEnd: clip.loopEnd,
          reversed: false,
        });
      }
    }
  }
}
