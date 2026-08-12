/**
 * Polyphonic subtractive synth: 8-voice pool, two detunable oscillators with
 * per-oscillator unison, a looping noise source (white/pink), mixer, one
 * state-variable filter with its own ADSR envelope, amp ADSR, one LFO
 * routable to pitch / filter / amplitude, and a per-sound effects chain.
 *
 * Voices are built fresh per note (so waveform/mode changes are applied on
 * the next note without clicks) and torn down release+50 ms after note-off.
 * Voice stealing: oldest released voice first, else the oldest active one.
 */
import { beatsToSeconds, clamp, noteToFrequency, velocityToGain } from "../music/theory";
import { defaultSynthState } from "../schema/factories";
import { EFFECT_ORDER } from "../schema/types";
import type { FilterMode, LfoDestination, SynthState, Waveform } from "../schema/types";
import { EffectsChain } from "./effects";

/** Fade-in time constant for freshly built oscillators/noise (10 ms-ish). */
const SOURCE_FADE_TC = 0.004;
/** Release + slack before a released voice is disposed. */
const RELEASE_SLACK = 0.05;
/** Parameter smoothing time constant for live voice updates. */
const SMOOTH_TC = 0.01;

const NOISE_SECONDS = 2;

interface OscSource {
  osc: OscillatorNode;
  gain: GainNode;
  /** Detune spread (cents) applied on top of the patch base detune. */
  spread: number;
}

export interface SynthVoiceDeps {
  noiseBuffers: { white: AudioBuffer; pink: AudioBuffer };
  periodicWave: (waveform: Waveform, phase: number) => PeriodicWave | null;
}

interface VoiceSlot {
  voice: SynthVoice | null;
}

/** Generate a looping noise buffer. color < 0.5 => white, >= 0.5 => pink. */
function makeNoiseBuffer(ctx: BaseAudioContext, color: number): AudioBuffer {
  const length = Math.round(NOISE_SECONDS * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (color >= 0.5) {
    // Paul Kellet's pink noise approximation.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  } else {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Fourier coefficients rotated by a phase offset, cached per waveform+phase. */
function buildPeriodicWave(ctx: BaseAudioContext, waveform: Waveform, phase: number): PeriodicWave {
  const harmonics = 64;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  const phi = phase * 2 * Math.PI;
  for (let n = 1; n <= harmonics; n++) {
    // Cosine term is always zero for these waveforms; only sine terms are set.
    const r = 0;
    let im = 0;
    switch (waveform) {
      case "sine":
        if (n === 1) im = 1;
        break;
      case "sawtooth":
        im = (2 * Math.pow(-1, n + 1)) / (Math.PI * n);
        break;
      case "square":
        if (n % 2 === 1) im = 4 / (Math.PI * n);
        break;
      case "triangle":
        if (n % 2 === 1) im = (8 * Math.sin((n * Math.PI) / 2)) / (Math.PI * Math.PI * n * n);
        break;
    }
    // Phase rotation: f(theta + phi) coefficients.
    const c = Math.cos(n * phi);
    const s = Math.sin(n * phi);
    real[n] = r * c + im * s;
    imag[n] = im * c - r * s;
  }
  return ctx.createPeriodicWave(real, imag);
}

function smooth(param: AudioParam, value: number, time: number, tc = SMOOTH_TC): void {
  param.setTargetAtTime(value, time, tc);
}

/**
 * One sounding note. The node graph lives entirely inside the voice; the
 * engine only touches it through the live-update methods below.
 */
export class SynthVoice {
  readonly note: number;
  readonly noteOnTime: number;
  readonly filter: BiquadFilterNode;
  readonly amp: GainNode;
  readonly filterInput: GainNode;
  readonly osc1Gain: GainNode;
  readonly osc2Gain: GainNode;
  readonly noiseGain: GainNode;
  readonly lfo: OscillatorNode;
  readonly lfoDepth: GainNode;

  /** Current base cutoff; filter envelope release returns here. */
  currentCutoff: number;
  released = false;
  releaseTime = 0;
  /** Patch release duration captured at release time (for cleanup timing). */
  releaseDuration = 0;

  private ctx: AudioContext;
  private patch: SynthState;
  private deps: SynthVoiceDeps;
  private osc1Sources: OscSource[] = [];
  private osc2Sources: OscSource[] = [];
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseLevelGain: GainNode | null = null;
  private lfoDestination: LfoDestination;
  private disposed = false;

  constructor(
    ctx: AudioContext,
    patch: SynthState,
    note: number,
    velocity: number,
    time: number,
    tempo: number,
    deps: SynthVoiceDeps,
  ) {
    this.ctx = ctx;
    this.patch = patch;
    this.deps = deps;
    this.note = note;
    this.noteOnTime = time;
    this.lfoDestination = patch.lfo.destination;
    this.currentCutoff = patch.filter.cutoff;

    const baseFreq = noteToFrequency(note);

    this.filterInput = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = patch.filter.mode;
    this.filter.frequency.value = patch.filter.cutoff;
    this.filter.Q.value = clamp(patch.filter.resonance, 0.1, 24);
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;

    this.osc1Gain = ctx.createGain();
    this.osc1Gain.gain.value = patch.osc1.enabled ? patch.mixer.osc1 : 0;
    this.osc2Gain = ctx.createGain();
    this.osc2Gain.gain.value = patch.osc2.enabled ? patch.mixer.osc2 : 0;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = patch.noise.enabled ? patch.mixer.noise : 0;

    // Source routing: oscs/noise -> per-source bus -> filter -> amp.
    this.osc1Gain.connect(this.filterInput);
    this.osc2Gain.connect(this.filterInput);
    this.noiseGain.connect(this.filterInput);
    this.filterInput.connect(this.filter);
    this.filter.connect(this.amp);

    // Oscillators (per unison voice, spread detuned).
    this.osc1Sources = this.buildOscillators(patch.osc1, baseFreq, time, this.osc1Gain);
    this.osc2Sources = this.buildOscillators(patch.osc2, baseFreq, time, this.osc2Gain);

    // Noise source.
    if (patch.noise.enabled) this.startNoise(time);

    // LFO: one oscillator -> depth gain -> destination.
    this.lfo = ctx.createOscillator();
    this.lfo.type = patch.lfo.waveform;
    this.lfo.frequency.value = this.lfoRate(tempo);
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = this.lfoDepthValue();
    this.lfo.connect(this.lfoDepth);
    this.connectLfo();
    this.lfo.start(time);

    // Amp envelope.
    const peak = velocityToGain(velocity, patch.output.velocitySensitivity);
    this.scheduleAmpEnvelope(time, peak);
    this.scheduleFilterEnvelope(time);
  }

  private lfoRate(tempo: number): number {
    const lfo = this.patch.lfo;
    if (lfo.sync) return 1 / Math.max(beatsToSeconds(lfo.syncBeats, tempo), 1e-6);
    return clamp(lfo.rate, 0.01, 40);
  }

  private lfoDepthValue(): number {
    const depth = clamp(this.patch.lfo.depth, 0, 1);
    switch (this.lfoDestination) {
      case "pitch":
        return depth * 1200; // cents
      case "filter":
        return depth * Math.max(this.currentCutoff, 20); // Hz
      case "amplitude":
        return depth;
    }
  }

  private connectLfo(): void {
    switch (this.lfoDestination) {
      case "pitch":
        for (const src of this.osc1Sources) this.lfoDepth.connect(src.osc.detune);
        for (const src of this.osc2Sources) this.lfoDepth.connect(src.osc.detune);
        break;
      case "filter":
        this.lfoDepth.connect(this.filter.frequency);
        break;
      case "amplitude":
        this.lfoDepth.connect(this.amp.gain);
        break;
    }
  }

  private disconnectLfo(): void {
    this.lfoDepth.disconnect();
  }

  private buildOscillators(
    osc: SynthState["osc1"],
    baseFreq: number,
    time: number,
    bus: GainNode,
  ): OscSource[] {
    const sources: OscSource[] = [];
    if (!osc.enabled) return sources;
    const count = clamp(Math.round(osc.unison), 1, 8);
    const baseDetune = osc.octave * 1200 + osc.semitone * 100 + osc.detuneCents;
    const periodic = osc.phase !== 0 ? this.deps.periodicWave(osc.waveform, osc.phase) : null;
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? osc.unisonSpreadCents * ((2 * i) / (count - 1) - 1) : 0;
      const node = this.ctx.createOscillator();
      if (periodic) node.setPeriodicWave(periodic);
      else node.type = osc.waveform;
      node.frequency.value = baseFreq;
      node.detune.value = baseDetune + spread;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      smooth(gain.gain, 1, time, SOURCE_FADE_TC);
      node.connect(gain);
      gain.connect(bus);
      sources.push({ osc: node, gain, spread });
      node.start(time);
    }
    return sources;
  }

  private startNoise(time: number): void {
    const buffer = this.patch.noise.color >= 0.5 ? this.deps.noiseBuffers.pink : this.deps.noiseBuffers.white;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    smooth(gain.gain, 1, time, SOURCE_FADE_TC);
    source.connect(gain);
    gain.connect(this.noiseGain);
    source.start(time, Math.random() * NOISE_SECONDS);
    this.noiseSource = source;
    this.noiseLevelGain = gain;
  }

  private scheduleAmpEnvelope(time: number, peak: number): void {
    const env = this.patch.ampEnvelope;
    const gain = this.amp.gain;
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(0, time);
    gain.linearRampToValueAtTime(peak, time + Math.max(env.attack, 0.001));
    gain.setTargetAtTime(peak * env.sustain, time + Math.max(env.attack, 0.001), Math.max(env.decay, 0.001) / 3);
  }

  private scheduleFilterEnvelope(time: number): void {
    const env = this.patch.filterEnvelope;
    const amount = clamp(this.patch.filterEnvAmount, -1, 1);
    const base = this.currentCutoff;
    const peak = base * Math.pow(2, 4 * amount);
    const sustain = base * Math.pow(2, 4 * amount * env.sustain);
    const freq = this.filter.frequency;
    freq.cancelScheduledValues(time);
    freq.setValueAtTime(base, time);
    freq.linearRampToValueAtTime(peak, time + Math.max(env.attack, 0.001));
    freq.setTargetAtTime(sustain, time + Math.max(env.attack, 0.001), Math.max(env.decay, 0.001) / 3);
  }

  /** Graceful note-off: amp + filter envelopes release; cleanup is scheduled by the engine. */
  release(time: number): void {
    if (this.released || this.disposed) return;
    this.released = true;
    this.releaseTime = time;
    const release = Math.max(this.patch.ampEnvelope.release, 0.001);
    this.releaseDuration = release;
    const amp = this.amp.gain;
    amp.cancelScheduledValues(time);
    amp.setTargetAtTime(0, time, release / 4);
    const freq = this.filter.frequency;
    freq.cancelScheduledValues(time);
    freq.setTargetAtTime(this.currentCutoff, time, release / 4);
  }

  /** Voice stealing: cut the release short (5 ms) instead of the full release time. */
  forceRelease(time: number): void {
    if (this.disposed) return;
    this.released = true;
    this.releaseTime = time;
    this.releaseDuration = 0.05;
    this.amp.gain.cancelScheduledValues(time);
    this.amp.gain.setTargetAtTime(0, time, 0.005);
    this.filter.frequency.cancelScheduledValues(time);
    this.filter.frequency.setTargetAtTime(this.currentCutoff, time, 0.005);
  }

  /* ------------------------- Live patch updates ------------------------- */

  setOscDetune(which: 1 | 2, baseDetune: number, time: number): void {
    const sources = which === 1 ? this.osc1Sources : this.osc2Sources;
    for (const src of sources) smooth(src.osc.detune, baseDetune + src.spread, time);
  }

  setOscBus(which: 1 | 2, gain: number, time: number): void {
    const node = which === 1 ? this.osc1Gain : this.osc2Gain;
    smooth(node.gain, gain, time);
  }

  setNoiseBus(gain: number, time: number): void {
    smooth(this.noiseGain.gain, gain, time);
  }

  rebuildOscillators(which: 1 | 2, time: number): void {
    const osc = which === 1 ? this.patch.osc1 : this.patch.osc2;
    const bus = which === 1 ? this.osc1Gain : this.osc2Gain;
    const old = which === 1 ? this.osc1Sources : this.osc2Sources;
    const fresh = this.buildOscillators(osc, noteToFrequency(this.note), time, bus);
    if (which === 1) this.osc1Sources = fresh;
    else this.osc2Sources = fresh;
    if (this.lfoDestination === "pitch") {
      for (const src of fresh) this.lfoDepth.connect(src.osc.detune);
    }
    this.fadeOutSources(old, time);
  }

  /** Rebuild only when the oscillator bank is empty (e.g. re-enabled after a rebuild while off). */
  rebuildOscillatorsIfEmpty(which: 1 | 2, time: number): void {
    const sources = which === 1 ? this.osc1Sources : this.osc2Sources;
    if (sources.length === 0) this.rebuildOscillators(which, time);
  }

  rebuildNoise(time: number): void {
    const old = this.noiseSource;
    const oldGain = this.noiseLevelGain;
    this.startNoise(time);
    if (old) {
      old.stop(time + 0.03);
      window.setTimeout(() => {
        if (this.disposed) return;
        old.disconnect();
        oldGain?.disconnect();
      }, 40);
    }
  }

  setFilterMode(mode: FilterMode): void {
    this.filter.type = mode;
  }

  setFilterCutoff(cutoff: number, time: number): void {
    this.currentCutoff = cutoff;
    // No cancelScheduledValues: an in-flight filter envelope keeps its
    // scheduled trajectory, and this ramp takes over from now on.
    smooth(this.filter.frequency, cutoff, time);
  }

  setFilterResonance(resonance: number, time: number): void {
    smooth(this.filter.Q, clamp(resonance, 0.1, 24), time);
  }

  setLfoFrequency(rate: number, time: number): void {
    smooth(this.lfo.frequency, rate, time);
  }

  setLfoDepth(time: number): void {
    smooth(this.lfoDepth.gain, this.lfoDepthValue(), time);
  }

  setLfoDestination(destination: LfoDestination): void {
    if (destination === this.lfoDestination) return;
    this.lfoDestination = destination;
    this.disconnectLfo();
    this.connectLfo();
  }

  setLfoWaveform(waveform: Waveform): void {
    this.lfo.type = waveform;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ctx.currentTime;
    for (const src of this.osc1Sources) {
      try { src.osc.stop(t); } catch { /* already stopped */ }
      src.osc.disconnect();
      src.gain.disconnect();
    }
    for (const src of this.osc2Sources) {
      try { src.osc.stop(t); } catch { /* already stopped */ }
      src.osc.disconnect();
      src.gain.disconnect();
    }
    if (this.noiseSource) {
      try { this.noiseSource.stop(t); } catch { /* already stopped */ }
      this.noiseSource.disconnect();
    }
    if (this.noiseLevelGain) {
      this.noiseLevelGain.disconnect();
      this.noiseLevelGain = null;
    }
    try { this.lfo.stop(t); } catch { /* already stopped */ }
    this.lfo.disconnect();
    this.lfoDepth.disconnect();
    this.filterInput.disconnect();
    this.filter.disconnect();
    this.amp.disconnect();
    this.osc1Gain.disconnect();
    this.osc2Gain.disconnect();
    this.noiseGain.disconnect();
    this.osc1Sources = [];
    this.osc2Sources = [];
    this.noiseSource = null;
  }

  private fadeOutSources(sources: OscSource[], time: number): void {
    for (const src of sources) {
      src.gain.gain.cancelScheduledValues(time);
      src.gain.gain.setTargetAtTime(0, time, 0.003);
      src.osc.stop(time + 0.03);
      window.setTimeout(() => {
        if (this.disposed) return;
        src.gain.disconnect();
        src.osc.disconnect();
      }, 40);
    }
  }
}

/**
 * The 8-voice synth. Output is a single GainNode the caller connects into a
 * master input or a track bus.
 */
export class SynthEngine {
  /** Post-effects output; connect this into a master input or track bus. */
  readonly output: GainNode;

  private ctx: AudioContext;
  private bus: GainNode;
  private outputGain: GainNode;
  private effects: EffectsChain;
  private slots: VoiceSlot[] = [];
  private patch: SynthState;
  private tempo = 120;
  private noiseBuffers: { white: AudioBuffer; pink: AudioBuffer } | null = null;
  private periodicCache = new Map<string, PeriodicWave>();
  private cleanupTimers = new Set<number>();
  private disposed = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.patch = defaultSynthState();
    this.bus = ctx.createGain();
    this.effects = new EffectsChain(ctx, this.patch.effects);
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = this.patch.output.gain;
    this.output = ctx.createGain();
    this.bus.connect(this.effects.input);
    this.effects.output.connect(this.outputGain);
    this.outputGain.connect(this.output);
    this.output.connect(destination);
    for (let i = 0; i < 8; i++) this.slots.push({ voice: null });
  }

  loadPatch(state: SynthState): void {
    this.allNotesOff();
    this.patch = state;
    this.effects.update(state.effects);
    this.outputGain.gain.value = state.output.gain;
  }

  noteOn(note: number, velocity: number, time?: number): void {
    if (this.disposed || velocity <= 0) return;
    const t = time ?? this.ctx.currentTime;
    const slot = this.allocateSlot(note, t);
    if (!slot) return;
    const voice = new SynthVoice(this.ctx, this.patch, note, velocity, t, this.tempo, this.deps());
    voice.amp.connect(this.bus);
    slot.voice = voice;
  }

  noteOff(note: number, time?: number): void {
    if (this.disposed) return;
    const t = time ?? this.ctx.currentTime;
    for (const slot of this.slots) {
      const voice = slot.voice;
      if (!voice || voice.released || voice.note !== note) continue;
      voice.release(t);
      this.scheduleCleanup(voice, t);
    }
  }

  allNotesOff(): void {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    for (const slot of this.slots) {
      const voice = slot.voice;
      if (!voice || voice.released) continue;
      voice.release(t);
      this.scheduleCleanup(voice, t);
    }
  }

  private deps(): SynthVoiceDeps {
    if (!this.noiseBuffers) {
      this.noiseBuffers = {
        white: makeNoiseBuffer(this.ctx, 0),
        pink: makeNoiseBuffer(this.ctx, 1),
      };
    }
    return {
      noiseBuffers: this.noiseBuffers,
      periodicWave: (waveform, phase) => {
        const key = `${waveform}|${phase}`;
        let wave = this.periodicCache.get(key);
        if (!wave) {
          wave = buildPeriodicWave(this.ctx, waveform, phase);
          this.periodicCache.set(key, wave);
        }
        return wave;
      },
    };
  }

  private allocateSlot(note: number, time: number): VoiceSlot | null {
    // 1. Free slot.
    for (const slot of this.slots) if (!slot.voice) return slot;
    // 2. Same note still ringing -> retrigger.
    for (const slot of this.slots) {
      const voice = slot.voice;
      if (voice && !voice.released && voice.note === note) {
        voice.forceRelease(time);
        this.scheduleCleanup(voice, time);
        return slot;
      }
    }
    // 3. Oldest released voice.
    let released: VoiceSlot | null = null;
    for (const slot of this.slots) {
      const voice = slot.voice;
      if (!voice || !voice.released) continue;
      if (!released || !released.voice || voice.releaseTime < released.voice.releaseTime) released = slot;
    }
    if (released) return released;
    // 4. Oldest active voice.
    let oldest: VoiceSlot | null = null;
    for (const slot of this.slots) {
      const voice = slot.voice;
      if (!voice) continue;
      if (!oldest || !oldest.voice || voice.noteOnTime < oldest.voice.noteOnTime) oldest = slot;
    }
    if (oldest && oldest.voice) {
      oldest.voice.forceRelease(time);
      this.scheduleCleanup(oldest.voice, time);
      return oldest;
    }
    return null;
  }

  private scheduleCleanup(voice: SynthVoice, releaseAt: number): void {
    const delayMs = Math.max(0, (releaseAt + voice.releaseDuration + RELEASE_SLACK - this.ctx.currentTime) * 1000);
    const timer = window.setTimeout(() => {
      this.cleanupTimers.delete(timer);
      if (this.disposed) return;
      if (this.ctx.state === "suspended") {
        // Audio time is frozen; wait for the context to come back before disposal.
        this.scheduleCleanup(voice, this.ctx.currentTime + voice.releaseDuration + RELEASE_SLACK);
        return;
      }
      voice.dispose();
      for (const slot of this.slots) if (slot.voice === voice) slot.voice = null;
    }, delayMs);
    this.cleanupTimers.add(timer);
  }

  /** Live dot-path update. Returns true when the path was handled. */
  setParameter(path: string, value: number | string | boolean, time?: number): boolean {
    if (this.disposed) return true;
    const t = time ?? this.ctx.currentTime;
    const parts = path.split(".");
    const section = parts[0];
    const sub = parts[1];

    switch (section) {
      case "osc1":
      case "osc2": {
        const which = section === "osc1" ? 1 : 2;
        const osc = which === 1 ? this.patch.osc1 : this.patch.osc2;
        switch (sub) {
          case "enabled": {
            const enabled = Boolean(value);
            osc.enabled = enabled;
            const mix = which === 1 ? this.patch.mixer.osc1 : this.patch.mixer.osc2;
            this.forActiveVoices((v) => {
              v.setOscBus(which, enabled ? mix : 0, t);
              if (enabled) v.rebuildOscillatorsIfEmpty(which, t);
            });
            return true;
          }
          case "waveform":
          case "phase":
          case "unison":
          case "unisonSpreadCents": {
            setNested(this.patch, parts, value);
            this.forActiveVoices((v) => v.rebuildOscillators(which, t));
            return true;
          }
          case "octave":
          case "semitone":
          case "detuneCents": {
            setNested(this.patch, parts, value);
            const base = osc.octave * 1200 + osc.semitone * 100 + osc.detuneCents;
            this.forActiveVoices((v) => v.setOscDetune(which, base, t));
            return true;
          }
        }
        return false;
      }
      case "noise": {
        switch (sub) {
          case "enabled": {
            this.patch.noise.enabled = Boolean(value);
            this.forActiveVoices((v) => v.setNoiseBus(Boolean(value) ? this.patch.mixer.noise : 0, t));
            return true;
          }
          case "color": {
            this.patch.noise.color = clamp(Number(value), 0, 1);
            this.forActiveVoices((v) => v.rebuildNoise(t));
            return true;
          }
        }
        return false;
      }
      case "mixer": {
        if (sub === "osc1" || sub === "osc2" || sub === "noise") {
          const v = clamp(Number(value), 0, 1);
          this.patch.mixer[sub] = v;
          if (sub === "osc1") this.forActiveVoices((voice) => voice.setOscBus(1, this.patch.osc1.enabled ? v : 0, t));
          if (sub === "osc2") this.forActiveVoices((voice) => voice.setOscBus(2, this.patch.osc2.enabled ? v : 0, t));
          if (sub === "noise") this.forActiveVoices((voice) => voice.setNoiseBus(this.patch.noise.enabled ? v : 0, t));
          return true;
        }
        return false;
      }
      case "filter": {
        switch (sub) {
          case "mode": {
            this.patch.filter.mode = value as FilterMode;
            this.forActiveVoices((v) => v.setFilterMode(this.patch.filter.mode));
            return true;
          }
          case "cutoff": {
            this.patch.filter.cutoff = clamp(Number(value), 20, 20000);
            this.forActiveVoices((v) => v.setFilterCutoff(this.patch.filter.cutoff, t));
            return true;
          }
          case "resonance": {
            this.patch.filter.resonance = clamp(Number(value), 0.1, 24);
            this.forActiveVoices((v) => v.setFilterResonance(this.patch.filter.resonance, t));
            return true;
          }
        }
        return false;
      }
      case "ampEnvelope":
      case "filterEnvelope": {
        if (sub === "attack" || sub === "decay" || sub === "release" || sub === "sustain") {
          setNested(this.patch, parts, Number(value));
          return true;
        }
        return false;
      }
      case "filterEnvAmount": {
        this.patch.filterEnvAmount = clamp(Number(value), -1, 1);
        return true;
      }
      case "lfo": {
        switch (sub) {
          case "rate": {
            this.patch.lfo.rate = clamp(Number(value), 0.01, 40);
            if (!this.patch.lfo.sync) this.forActiveVoices((v) => v.setLfoFrequency(this.patch.lfo.rate, t));
            return true;
          }
          case "sync":
          case "syncBeats": {
            setNested(this.patch, parts, value);
            if (this.patch.lfo.sync) this.applySyncedLfoRate(t);
            return true;
          }
          case "depth": {
            this.patch.lfo.depth = clamp(Number(value), 0, 1);
            this.forActiveVoices((v) => v.setLfoDepth(t));
            return true;
          }
          case "destination": {
            this.patch.lfo.destination = value as LfoDestination;
            this.forActiveVoices((v) => v.setLfoDestination(this.patch.lfo.destination));
            return true;
          }
          case "waveform": {
            this.patch.lfo.waveform = value as Waveform;
            this.forActiveVoices((v) => v.setLfoWaveform(this.patch.lfo.waveform));
            return true;
          }
        }
        return false;
      }
      case "output": {
        if (sub === "gain") {
          this.patch.output.gain = clamp(Number(value), 0, 1);
          smooth(this.outputGain.gain, this.patch.output.gain, t);
          return true;
        }
        if (sub === "velocitySensitivity") {
          this.patch.output.velocitySensitivity = clamp(Number(value), 0, 1);
          return true;
        }
        return false;
      }
      case "effects": {
        const index = Number(parts[1]);
        if (!Number.isInteger(index) || index < 0 || index >= EFFECT_ORDER.length) return false;
        const rest = parts.slice(2).join(".");
        if (rest === "bypass") {
          this.patch.effects[index].bypass = Boolean(value);
        } else if (rest.startsWith("params.")) {
          setNested(this.patch.effects[index].params as object, parts.slice(2), value);
        } else {
          return false;
        }
        this.effects.setParam(index, rest, value, t);
        return true;
      }
    }
    return false;
  }

  setTempo(bpm: number): void {
    this.tempo = bpm;
    this.effects.setTempo(bpm);
    if (this.patch.lfo.sync) {
      const t = this.ctx.currentTime;
      this.applySyncedLfoRate(t);
    }
  }

  private applySyncedLfoRate(t: number): void {
    const rate = 1 / Math.max(beatsToSeconds(this.patch.lfo.syncBeats, this.tempo), 1e-6);
    this.forActiveVoices((v) => v.setLfoFrequency(rate, t));
  }

  private forActiveVoices(fn: (voice: SynthVoice) => void): void {
    for (const slot of this.slots) {
      const voice = slot.voice;
      if (voice && !voice.released) fn(voice);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.cleanupTimers) window.clearTimeout(timer);
    this.cleanupTimers.clear();
    for (const slot of this.slots) {
      if (slot.voice) slot.voice.dispose();
      slot.voice = null;
    }
    this.effects.dispose();
    this.bus.disconnect();
    this.outputGain.disconnect();
    this.output.disconnect();
    this.periodicCache.clear();
    this.noiseBuffers = null;
  }
}

/** Mutate a nested object through a dot path (used to mirror patch state). */
function setNested(target: object, parts: string[], value: number | string | boolean): void {
  let node: Record<string, unknown> = target as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = node[parts[i]];
    if (typeof next !== "object" || next === null) return;
    node = next as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}
