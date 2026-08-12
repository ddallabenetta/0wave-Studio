/**
 * Audio clip playback for the arrangement.
 *
 * Clips are buffer sources routed through their track bus, so track volume,
 * pan, mute, solo and per-track effects all apply. Every parameter exposed in
 * the Clip inspector is honored here: source offset, clip length, gain, fade
 * in/out, and looping inside the clip.
 */
import { beatsToSeconds } from "../music/theory";
import type { Beats } from "../schema/types";

export interface AudioClipPlayback {
  buffer: AudioBuffer;
  /** Timeline position, in beats. */
  startBeat: Beats;
  lengthBeats: Beats;
  offsetSeconds: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  reversed: boolean;
}

interface LiveClip {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Reversed copies are cached: reversing a buffer is O(n) per channel. */
const reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();

function reverseBuffer(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const cached = reversedCache.get(buffer);
  if (cached) return cached;
  const copy = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    const target = copy.getChannelData(channel);
    for (let i = 0, j = source.length - 1; i < source.length; i += 1, j -= 1) target[i] = source[j];
  }
  reversedCache.set(buffer, copy);
  return copy;
}

export class AudioClipPlayer {
  private live: LiveClip[] = [];

  constructor(private ctx: AudioContext) {}

  /**
   * Schedule one clip. `when` is the AudioContext time of the clip start;
   * clips already in the past are skipped by the caller.
   */
  schedule(destination: AudioNode, clip: AudioClipPlayback, when: number, tempo: number): void {
    const buffer = clip.reversed ? reverseBuffer(this.ctx, clip.buffer) : clip.buffer;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const durationSeconds = Math.max(0.01, beatsToSeconds(clip.lengthBeats, tempo));
    const startAt = Math.max(when, this.ctx.currentTime);
    // A clip scheduled mid-way starts partway into the source material.
    const lateBy = startAt - when;
    const offset = Math.min(Math.max(0, clip.offsetSeconds + lateBy), Math.max(0, buffer.duration - 0.001));
    const playSeconds = Math.max(0.01, durationSeconds - lateBy);

    if (clip.loopEnabled && clip.loopEnd > clip.loopStart) {
      source.loop = true;
      source.loopStart = clip.loopStart;
      source.loopEnd = Math.min(clip.loopEnd, buffer.duration);
    }

    const gain = this.ctx.createGain();
    const peak = Math.max(0, clip.gain);
    const fadeIn = Math.min(clip.fadeIn, playSeconds / 2);
    const fadeOut = Math.min(clip.fadeOut, playSeconds / 2);

    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + fadeIn);
    } else {
      gain.gain.setValueAtTime(peak, startAt);
    }
    if (fadeOut > 0) {
      gain.gain.setValueAtTime(peak, startAt + playSeconds - fadeOut);
      gain.gain.linearRampToValueAtTime(0, startAt + playSeconds);
    }

    source.connect(gain);
    gain.connect(destination);
    source.start(startAt, offset);
    source.stop(startAt + playSeconds);

    const entry: LiveClip = { source, gain };
    this.live.push(entry);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.live = this.live.filter((c) => c !== entry);
    };
  }

  /** Stop every scheduled and sounding clip (transport stop, seek, edit). */
  cancelAll(): void {
    for (const clip of this.live) {
      try {
        clip.source.onended = null;
        clip.source.stop();
      } catch {
        // Already stopped; nothing to do.
      }
      clip.source.disconnect();
      clip.gain.disconnect();
    }
    this.live = [];
  }

  dispose(): void {
    this.cancelAll();
  }
}
