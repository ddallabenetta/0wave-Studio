/**
 * Sample playback engine. Each note is an AudioBufferSourceNode honoring the
 * SampleState: trim region, fades, gain, reversal (cached per buffer), loop
 * points, playback rate from rootNote/tuning, filter, and amp ADSR. The
 * output routes through a per-sound effects chain into the caller's bus.
 */
import { clamp, velocityToGain } from "../music/theory";
import { defaultEffects } from "../schema/factories";
import type { EffectState, ID, SampleState, SoundDefinition } from "../schema/types";
import { EffectsChain } from "./effects";

/** Release + slack before a finished sample voice is disposed. */
const RELEASE_SLACK = 0.05;

export interface SamplerOptions {
  /** Resolve the decoded AudioBuffer for a sound id (scheduled track notes). */
  getBuffer?: (soundId: ID) => AudioBuffer | null;
}

interface SampleVoiceHandle {
  release(time: number): void;
  setGain(gain: number, time: number): void;
  setFilterCutoff(cutoff: number, time: number): void;
  setFilterResonance(resonance: number, time: number): void;
  setFilterMode(mode: SampleState["filter"]["mode"]): void;
  dispose(): void;
  note: number;
  released: boolean;
}

/** Reverse a copy of a buffer's channel data (cached by the engine). */
function reverseBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const last = buffer.length - 1;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i <= last; i++) dst[i] = src[last - i];
  }
  return out;
}

export class SamplerEngine {
  /** Post-effects output; connect into a master input or track bus. */
  readonly output: GainNode;

  private ctx: AudioContext;
  private bus: GainNode;
  private effects: EffectsChain;
  private outputGain: GainNode;
  private sound: SoundDefinition | null = null;
  private state: SampleState | null = null;
  private voices = new Set<SampleVoiceHandle>();
  private reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();
  private getBuffer: ((soundId: ID) => AudioBuffer | null) | null;
  private cleanupTimers = new Set<number>();
  private disposed = false;

  constructor(ctx: AudioContext, destination: AudioNode, options: SamplerOptions = {}) {
    this.ctx = ctx;
    this.getBuffer = options.getBuffer ?? null;
    this.bus = ctx.createGain();
    this.effects = new EffectsChain(ctx, defaultSampleEffects());
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1;
    this.output = ctx.createGain();
    this.bus.connect(this.effects.input);
    this.effects.output.connect(this.outputGain);
    this.outputGain.connect(this.output);
    this.output.connect(destination);
  }

  /**
   * Assign the sound this engine plays (used by the preview and per-track
   * instances). The state comes from the frozen project document, so the
   * engine clones it: setParameter mutates `this.state` directly.
   */
  loadSound(sound: SoundDefinition): void {
    this.stopAll();
    this.sound = sound;
    this.state = sound.sampleState ? structuredClone(sound.sampleState) : null;
    if (this.state) this.effects.update(this.state.effects);
  }

  loadState(state: SampleState): void {
    this.stopAll();
    this.state = structuredClone(state);
    this.effects.update(this.state.effects);
  }

  /** Immediate sample playback (preview / clips). */
  playSample(sound: SoundDefinition, buffer: AudioBuffer, note: number, velocity: number, when?: number): void {
    if (this.disposed) return;
    const state = sound.sampleState ?? this.state;
    if (!state) return;
    const t = when ?? this.ctx.currentTime;
    const voice = this.startVoice(buffer, state, note, velocity, t);
    if (voice) this.voices.add(voice);
  }

  /** Instrument keyboard input for the assigned sound (sample preview). */
  noteOn(note: number, velocity: number, time?: number): void {
    if (this.disposed || !this.sound || !this.state) return;
    const buffer = this.getBuffer ? this.getBuffer(this.sound.id) : null;
    if (!buffer) return; // buffer not yet registered through playSample/decode
    const t = time ?? this.ctx.currentTime;
    const voice = this.startVoice(buffer, this.state, note, velocity, t);
    if (voice) this.voices.add(voice);
  }

  noteOff(note: number, time?: number): void {
    if (this.disposed) return;
    const t = time ?? this.ctx.currentTime;
    for (const voice of this.voices) {
      if (!voice.released && voice.note === note) voice.release(t);
    }
  }

  /** Release every sounding voice (stop/pattern cancellation). */
  allNotesOff(): void {
    this.stopAll();
  }

  stopAll(): void {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    for (const voice of this.voices) voice.release(t);
  }

  private startVoice(
    buffer: AudioBuffer,
    state: SampleState,
    note: number,
    velocity: number,
    time: number,
  ): SampleVoiceHandle | null {
    const voice = new SampleVoice(this.ctx, buffer, state, note, velocity, time, {
      reversedCache: this.reversedCache,
      onEnded: (v) => {
        v.release(this.ctx.currentTime);
        this.scheduleCleanup(v);
      },
    });
    if (!voice.usable) {
      voice.dispose();
      return null;
    }
    voice.connect(this.bus);
    return voice;
  }

  /** Live dot-path update for the assigned sample sound. Returns true when handled. */
  setParameter(path: string, value: number | string | boolean, time?: number): boolean {
    if (this.disposed || !this.state) return false;
    const t = time ?? this.ctx.currentTime;
    const parts = path.split(".");
    const section = parts[0];
    const sub = parts[1];

    switch (section) {
      case "gain": {
        const v = clamp(Number(value), 0, 2);
        this.state.gain = v;
        for (const voice of this.voices) if (!voice.released) voice.setGain(v, t);
        return true;
      }
      case "filter": {
        if (!this.state.filter) return false;
        switch (sub) {
          case "cutoff": {
            const v = clamp(Number(value), 20, 20000);
            this.state.filter.cutoff = v;
            for (const voice of this.voices) if (!voice.released) voice.setFilterCutoff(v, t);
            return true;
          }
          case "resonance": {
            const v = clamp(Number(value), 0.1, 24);
            this.state.filter.resonance = v;
            for (const voice of this.voices) if (!voice.released) voice.setFilterResonance(v, t);
            return true;
          }
          case "mode": {
            const mode = value as SampleState["filter"]["mode"];
            this.state.filter.mode = mode;
            for (const voice of this.voices) if (!voice.released) voice.setFilterMode(mode);
            return true;
          }
        }
        return false;
      }
      case "ampEnvelope": {
        if (sub === "attack" || sub === "decay" || sub === "sustain" || sub === "release") {
          const env = this.state.ampEnvelope ?? { attack: 0.005, decay: 0.1, sustain: 1, release: 0.1 };
          (env as unknown as Record<string, number>)[sub] = clamp(Number(value), 0, sub === "sustain" ? 1 : 20);
          return true;
        }
        return false;
      }
      case "effects": {
        const index = Number(parts[1]);
        if (!Number.isInteger(index) || index < 0 || index >= this.state.effects.length) return false;
        const rest = parts.slice(2).join(".");
        if (rest === "bypass" || rest.startsWith("params.")) {
          this.effects.setParam(index, rest, value, t);
          return true;
        }
        return false;
      }
      case "trimStart":
      case "trimEnd":
      case "fadeIn":
      case "fadeOut":
      case "loopStart":
      case "loopEnd":
      case "loopEnabled":
      case "reversed":
      case "playbackMode":
      case "rootNote":
      case "tuningCents": {
        // Non-destructive edit parameters affect the next playback only.
        const s = this.state as unknown as Record<string, unknown>;
        s[section] = value;
        return true;
      }
    }
    return false;
  }

  setTempo(bpm: number): void {
    this.effects.setTempo(bpm);
  }

  private scheduleCleanup(voice: SampleVoiceHandle): void {
    const timer = window.setTimeout(() => {
      this.cleanupTimers.delete(timer);
      if (this.disposed) return;
      if (this.ctx.state === "suspended") {
        this.scheduleCleanup(voice);
        return;
      }
      this.voices.delete(voice);
      voice.dispose();
    }, RELEASE_SLACK * 1000);
    this.cleanupTimers.add(timer);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.cleanupTimers) window.clearTimeout(timer);
    this.cleanupTimers.clear();
    for (const voice of this.voices) voice.dispose();
    this.voices.clear();
    this.effects.dispose();
    this.bus.disconnect();
    this.outputGain.disconnect();
    this.output.disconnect();
  }
}

/** Defaults for the sampler effects chain (all stages bypassed -> dry). */
function defaultSampleEffects(): EffectState[] {
  return defaultEffects();
}

interface SampleVoiceCallbacks {
  reversedCache: WeakMap<AudioBuffer, AudioBuffer>;
  onEnded: (voice: SampleVoice) => void;
}

class SampleVoice implements SampleVoiceHandle {
  readonly note: number;
  released = false;

  /** False when the trim region is empty (nothing to play). */
  readonly usable: boolean;

  private ctx: AudioContext;
  private source: AudioBufferSourceNode;
  private trimGain: GainNode;
  private filter: BiquadFilterNode;
  private envGain: GainNode;
  private out: GainNode;
  private state: SampleState;
  private baseGain: number;
  private velocityGain: number;
  private naturalEndTime: number;
  private disposed = false;

  constructor(
    ctx: AudioContext,
    buffer: AudioBuffer,
    state: SampleState,
    note: number,
    velocity: number,
    time: number,
    callbacks: SampleVoiceCallbacks,
  ) {
    this.ctx = ctx;
    this.state = state;
    this.note = note;
    this.velocityGain = velocityToGain(velocity, 1);

    const sr = buffer.sampleRate;
    const len = buffer.length;
    let startFrame = clamp(Math.round(state.trimStart * sr), 0, len - 1);
    let endFrame = state.trimEnd > state.trimStart
      ? clamp(Math.round(state.trimEnd * sr), startFrame + 1, len)
      : len;

    let src = buffer;
    let loopStartSec = 0;
    let loopEndSec = 0;
    if (state.reversed) {
      let reversed = callbacks.reversedCache.get(buffer);
      if (!reversed) {
        reversed = reverseBuffer(ctx, buffer);
        callbacks.reversedCache.set(buffer, reversed);
      }
      src = reversed;
      // Playback region maps to reversed coordinates; loop region too.
      const s2 = len - endFrame;
      const e2 = len - startFrame;
      startFrame = s2;
      endFrame = e2;
      const ls = clamp(Math.round(state.loopStart * sr), 0, len);
      const le = clamp(Math.round(state.loopEnd * sr), 0, len);
      loopStartSec = (len - le) / sr;
      loopEndSec = (len - ls) / sr;
    } else {
      loopStartSec = state.loopStart;
      loopEndSec = state.loopEnd;
    }

    const durationFrames = endFrame - startFrame;
    this.usable = durationFrames > 0;
    if (!this.usable) {
      // Keep TS happy about definite assignment for the fields below.
      this.source = null as unknown as AudioBufferSourceNode;
      this.trimGain = null as unknown as GainNode;
      this.filter = null as unknown as BiquadFilterNode;
      this.envGain = null as unknown as GainNode;
      this.out = null as unknown as GainNode;
      this.baseGain = 0;
      this.naturalEndTime = 0;
      return;
    }

    const durationSec = durationFrames / sr;
    const rate =
      state.playbackMode === "instrument"
        ? Math.pow(2, (note - state.rootNote + state.tuningCents / 100) / 12)
        : Math.pow(2, state.tuningCents / 1200);
    this.naturalEndTime = time + durationSec / rate;

    this.source = ctx.createBufferSource();
    this.source.buffer = src;
    this.source.playbackRate.value = rate;

    // Loop region must live inside the trimmed region.
    const loopStartFrame = clamp(Math.round(loopStartSec * sr), startFrame, endFrame - 1);
    const loopEndFrame = clamp(Math.round(loopEndSec * sr), startFrame + 1, endFrame);
    const looping = state.loopEnabled && loopEndFrame > loopStartFrame;
    if (looping) {
      this.source.loop = true;
      this.source.loopStart = loopStartFrame / sr;
      this.source.loopEnd = loopEndFrame / sr;
    }

    this.baseGain = state.gain * this.velocityGain;
    this.trimGain = ctx.createGain();
    this.trimGain.gain.value = 0;
    // Fades: ramp up over fadeIn, down before the natural end.
    const fadeIn = clamp(state.fadeIn, 0, durationSec);
    const fadeOut = looping ? 0 : clamp(state.fadeOut, 0, durationSec - fadeIn);
    this.trimGain.gain.setValueAtTime(0, time);
    if (fadeIn > 0) this.trimGain.gain.linearRampToValueAtTime(this.baseGain, time + fadeIn);
    else this.trimGain.gain.setValueAtTime(this.baseGain, time);
    if (fadeOut > 0 && !looping) {
      const end = this.naturalEndTime;
      this.trimGain.gain.setValueAtTime(this.baseGain, Math.max(time + fadeIn, end - fadeOut));
      this.trimGain.gain.linearRampToValueAtTime(0, end);
    }

    this.filter = ctx.createBiquadFilter();
    this.filter.type = state.filter.mode;
    this.filter.frequency.value = clamp(state.filter.cutoff, 20, 20000);
    this.filter.Q.value = clamp(state.filter.resonance, 0.1, 24);

    this.envGain = ctx.createGain();
    this.envGain.gain.value = 0;
    const env = state.ampEnvelope ?? { attack: 0.005, decay: 0.1, sustain: 1, release: 0.1 };
    const attack = Math.max(env.attack, 0.001);
    this.envGain.gain.setValueAtTime(0, time);
    this.envGain.gain.linearRampToValueAtTime(1, time + attack);
    this.envGain.gain.setTargetAtTime(env.sustain, time + attack, Math.max(env.decay, 0.001) / 3);

    this.out = ctx.createGain();
    this.source.connect(this.trimGain);
    this.trimGain.connect(this.filter);
    this.filter.connect(this.envGain);
    this.envGain.connect(this.out);

    // Natural end (one-shot / instrument samples) -> release + cleanup.
    this.source.onended = () => callbacks.onEnded(this);
    this.source.start(time, startFrame / sr, looping ? undefined : durationSec);
  }

  connect(destination: AudioNode): void {
    this.out.connect(destination);
  }

  release(time: number): void {
    if (this.released || this.disposed || !this.usable) return;
    this.released = true;
    const env = this.state.ampEnvelope ?? { attack: 0.005, decay: 0.1, sustain: 1, release: 0.1 };
    const release = Math.max(env.release, 0.001);
    this.envGain.gain.cancelScheduledValues(time);
    this.envGain.gain.setTargetAtTime(0, time, release / 4);
  }

  setGain(gain: number, time: number): void {
    this.baseGain = gain * this.velocityGain;
    this.trimGain.gain.setTargetAtTime(this.baseGain, time, 0.01);
  }

  setFilterCutoff(cutoff: number, time: number): void {
    this.filter.frequency.setTargetAtTime(clamp(cutoff, 20, 20000), time, 0.01);
  }

  setFilterResonance(resonance: number, time: number): void {
    this.filter.Q.setTargetAtTime(clamp(resonance, 0.1, 24), time, 0.01);
  }

  setFilterMode(mode: SampleState["filter"]["mode"]): void {
    this.filter.type = mode;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ctx.currentTime;
    try {
      this.source.stop(t);
    } catch {
      /* already stopped (natural end or forced stop) */
    }
    this.source.disconnect();
    this.trimGain.disconnect();
    this.filter.disconnect();
    this.envGain.disconnect();
    this.out.disconnect();
    this.source.onended = null;
  }
}
