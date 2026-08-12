/**
 * Effects chain builder.
 *
 * Deterministic order (EFFECT_ORDER): distortion -> chorus -> delay -> reverb.
 * Every stage has the same shape: input gain -> [effect path | dry path] -> output,
 * where bypass switches between the two with a gain crossfade (no rewiring,
 * so toggling bypass is click-free). Effects with a `mix` parameter (chorus,
 * delay, reverb) use the same dry/wet gains for their internal balance, so
 * bypass and mix compose cleanly.
 *
 * Expensive resources (WaveShaper curve, Convolver impulse response) are only
 * rebuilt when the parameter that defines them actually changes.
 */
import { beatsToSeconds, clamp, knobToFrequency } from "../music/theory";
import { EFFECT_ORDER } from "../schema/types";
import type { EffectKind, EffectState } from "../schema/types";

/** Parameter smoothing time constant used for every live change. */
const SMOOTH_TC = 0.01;

/** Shared helpers. */
function smooth(param: AudioParam, value: number, time: number, tc = SMOOTH_TC): void {
  param.setTargetAtTime(value, time, tc);
}

/**
 * Base stage: input + dry/wet crossfade into a shared output.
 * Subclasses wire `this.wet` through their effect nodes into `this.output`.
 */
abstract class EffectStage {
  readonly input: GainNode;
  readonly output: GainNode;
  protected readonly dry: GainNode;
  protected readonly wet: GainNode;
  protected bypassed = false;
  protected mix = 1;
  protected ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.input.connect(this.dry);
    this.input.connect(this.wet);
    this.dry.connect(this.output);
    this.wet.connect(this.output);
  }

  setBypass(bypass: boolean, time: number): void {
    if (bypass === this.bypassed) return;
    this.bypassed = bypass;
    this.applyBalance(time);
  }

  /** Internal dry/wet balance for effects that expose `mix`. */
  protected setMix(mix: number, time: number): void {
    this.mix = clamp(mix, 0, 1);
    this.applyBalance(time);
  }

  private applyBalance(time: number): void {
    if (this.bypassed) {
      smooth(this.dry.gain, 1, time);
      smooth(this.wet.gain, 0, time);
    } else {
      smooth(this.dry.gain, 1 - this.mix, time);
      smooth(this.wet.gain, this.mix, time);
    }
  }

  abstract setParam(path: string, value: number | string | boolean, time: number): void;
  setTempo(_bpm: number, _time: number): void {
    /* default: nothing tempo-synced */
  }

  dispose(): void {
    this.input.disconnect();
    this.dry.disconnect();
    this.wet.disconnect();
    this.output.disconnect();
  }
}

/** distortion: tanh WaveShaper (drive) + tone lowpass. */
class DistortionStage extends EffectStage {
  private shaper: WaveShaperNode;
  private tone: BiquadFilterNode;
  private lastDrive = -1;
  private drive = 0;

  constructor(ctx: BaseAudioContext, state: EffectState) {
    super(ctx);
    const params = state.params as { drive: number; tone: number };
    this.drive = params.drive;
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "2x";
    this.shaper.curve = buildTanhCurve(this.drive);
    this.lastDrive = this.drive;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = knobToFrequency(params.tone, 300, 15000);
    this.tone.Q.value = 0.7;
    this.wet.connect(this.shaper);
    this.shaper.connect(this.tone);
    this.tone.connect(this.output);
    this.setBypass(state.bypass, ctx.currentTime);
  }

  setParam(path: string, value: number | string | boolean, time: number): void {
    if (path === "drive") {
      this.drive = clamp(Number(value), 0, 1);
      if (Math.abs(this.drive - this.lastDrive) > 1e-4) {
        this.lastDrive = this.drive;
        this.shaper.curve = buildTanhCurve(this.drive);
      }
    } else if (path === "tone") {
      smooth(this.tone.frequency, knobToFrequency(clamp(Number(value), 0, 1), 300, 15000), time);
    }
  }
}

function buildTanhCurve(drive: number): Float32Array<ArrayBuffer> {
  const size = 1024;
  const curve = new Float32Array(size);
  // drive 0 -> k ~ 0 -> identity curve; drive 1 -> k = 40 -> hard tanh saturation.
  const k = Math.max(drive * 40, 1e-4);
  const norm = 1 / Math.tanh(k);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) * norm;
  }
  return curve;
}

/** chorus: ~20 ms delay with LFO-modulated delayTime + mix. */
class ChorusStage extends EffectStage {
  private delay: DelayNode;
  private lfo: OscillatorNode;
  private depthGain: GainNode;

  constructor(ctx: BaseAudioContext, state: EffectState) {
    super(ctx);
    const params = state.params as { rate: number; depth: number; mix: number };
    this.delay = ctx.createDelay(0.05);
    this.delay.delayTime.value = 0.02;
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = params.rate;
    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = params.depth * 0.008;
    this.lfo.connect(this.depthGain);
    this.depthGain.connect(this.delay.delayTime);
    this.wet.connect(this.delay);
    this.delay.connect(this.output);
    this.lfo.start();
    this.setMix(params.mix, ctx.currentTime);
    this.setBypass(state.bypass, ctx.currentTime);
  }

  setParam(path: string, value: number | string | boolean, time: number): void {
    if (path === "rate") {
      smooth(this.lfo.frequency, clamp(Number(value), 0.01, 40), time);
    } else if (path === "depth") {
      smooth(this.depthGain.gain, clamp(Number(value), 0, 1) * 0.008, time);
    } else if (path === "mix") {
      this.setMix(Number(value), time);
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.depthGain.disconnect();
    this.delay.disconnect();
    super.dispose();
  }
}

/** delay: DelayNode + feedback (capped 0.95) + mix; sync mode follows tempo. */
class DelayStage extends EffectStage {
  private delay: DelayNode;
  private feedback: GainNode;
  private sync: boolean;
  private timeBeats: number;
  private timeSeconds: number;
  private tempo: number;

  constructor(ctx: BaseAudioContext, state: EffectState, tempo: number) {
    super(ctx);
    const params = state.params as {
      timeBeats: number;
      feedback: number;
      mix: number;
      sync: boolean;
      timeSeconds: number;
    };
    this.sync = params.sync;
    this.timeBeats = params.timeBeats;
    this.timeSeconds = params.timeSeconds;
    this.tempo = tempo;
    this.delay = ctx.createDelay(3);
    this.delay.delayTime.value = this.sync ? beatsToSeconds(this.timeBeats, tempo) : this.timeSeconds;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = clamp(params.feedback, 0, 0.95);
    this.wet.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.output);
    this.setMix(params.mix, ctx.currentTime);
    this.setBypass(state.bypass, ctx.currentTime);
  }

  setParam(path: string, value: number | string | boolean, time: number): void {
    if (path === "feedback") {
      smooth(this.feedback.gain, clamp(Number(value), 0, 0.95), time);
    } else if (path === "mix") {
      this.setMix(Number(value), time);
    } else if (path === "timeBeats" || path === "sync" || path === "timeSeconds") {
      if (path === "timeBeats") this.timeBeats = Number(value);
      if (path === "timeSeconds") this.timeSeconds = Number(value);
      if (path === "sync") this.sync = Boolean(value);
      this.applyDelayTime(time);
    }
  }

  setTempo(bpm: number, time: number): void {
    this.tempo = bpm;
    if (this.sync) this.applyDelayTime(time);
  }

  private applyDelayTime(time: number): void {
    const value = this.sync ? beatsToSeconds(this.timeBeats, this.tempo) : this.timeSeconds;
    smooth(this.delay.delayTime, Math.max(0.001, value), time);
  }

  dispose(): void {
    this.feedback.disconnect();
    this.delay.disconnect();
    super.dispose();
  }
}

/** reverb: ConvolverNode fed by a generated exponentially decaying stereo IR + mix. */
class ReverbStage extends EffectStage {
  private convolver: ConvolverNode;
  private lastDecay = -1;
  /** False when no impulse response could be installed; stage stays dry. */
  private irReady = false;

  constructor(ctx: BaseAudioContext, state: EffectState) {
    super(ctx);
    const params = state.params as { decay: number; mix: number };
    this.convolver = ctx.createConvolver();
    this.rebuildIr(ctx, params.decay);
    this.wet.connect(this.convolver);
    this.convolver.connect(this.output);
    this.setMix(params.mix, ctx.currentTime);
    this.setBypass(state.bypass, ctx.currentTime);
  }

  private rebuildIr(ctx: BaseAudioContext, decay: number): void {
    const seconds = clamp(decay, 0.05, 20);
    this.lastDecay = seconds;
    // Some browsers (and headless Chrome without an audio device) report a
    // context sampleRate that differs from the rate the ConvolverNode runs
    // at, which makes the buffer assignment throw. Try the reported rate
    // first, then the usual alternates; if none is accepted the reverb stays
    // dry instead of taking the whole engine down.
    const candidates = [ctx.sampleRate, ctx.sampleRate / 2, 48000, 44100, 24000, 22050];
    for (const rate of candidates) {
      if (!Number.isFinite(rate) || rate < 3000) continue;
      try {
        this.convolver.buffer = makeImpulseResponse(ctx, seconds, rate);
        this.irReady = true;
        return;
      } catch {
        // Try the next candidate rate.
      }
    }
    this.irReady = false;
    this.setBypass(true, ctx.currentTime);
  }

  setParam(path: string, value: number | string | boolean, time: number): void {
    if (path === "decay") {
      const decay = clamp(Number(value), 0.05, 20);
      if (Math.abs(decay - this.lastDecay) > 1e-3) this.rebuildIr(this.ctx, decay);
    } else if (path === "mix") {
      this.setMix(Number(value), time);
    }
  }

  dispose(): void {
    this.convolver.disconnect();
    super.dispose();
  }
}

/** Generate a stereo exponentially decaying noise impulse response. */
function makeImpulseResponse(
  ctx: BaseAudioContext,
  decaySeconds: number,
  sampleRate = ctx.sampleRate,
): AudioBuffer {
  const rate = sampleRate;
  const length = Math.max(1, Math.round(decaySeconds * rate));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // Exponential decay: ~95% of the energy is gone after `decaySeconds`.
      data[i] = (Math.random() * 2 - 1) * Math.exp((-3.5 * i) / length);
    }
  }
  return impulse;
}

function createStage(ctx: BaseAudioContext, state: EffectState, tempo: number): EffectStage {
  switch (state.kind) {
    case "distortion":
      return new DistortionStage(ctx, state);
    case "chorus":
      return new ChorusStage(ctx, state);
    case "delay":
      return new DelayStage(ctx, state, tempo);
    case "reverb":
      return new ReverbStage(ctx, state);
  }
}

/**
 * Deterministic effects chain over EFFECT_ORDER. Exposes a flat input/output
 * pair; individual stages are addressed by EFFECT_ORDER index.
 */
export class EffectsChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private ctx: BaseAudioContext;
  private stages: EffectStage[] = [];

  constructor(ctx: BaseAudioContext, effects: EffectState[], tempo = 120) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    let previous: AudioNode = this.input;
    for (let i = 0; i < EFFECT_ORDER.length; i++) {
      const kind = EFFECT_ORDER[i];
      const state = effects[i] ?? fallbackState(kind);
      const stage = createStage(ctx, state, tempo);
      this.stages.push(stage);
      previous.connect(stage.input);
      previous = stage.output;
    }
    previous.connect(this.output);
  }

  /** Live update of a single stage. `path` is "bypass" or "params.<key>". */
  setParam(index: number, path: string, value: number | string | boolean, time?: number): void {
    const stage = this.stages[index];
    if (!stage) return;
    const t = time ?? this.ctx.currentTime;
    if (path === "bypass") {
      stage.setBypass(Boolean(value), t);
    } else if (path.startsWith("params.")) {
      stage.setParam(path.slice("params.".length), value, t);
    }
  }

  /** Full state replace (sound loaded): keep the node graph, retune stages. */
  update(effects: EffectState[]): void {
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.stages.length; i++) {
      const state = effects[i];
      const stage = this.stages[i];
      if (!state || !stage) continue;
      stage.setBypass(state.bypass, t);
      const params: Record<string, unknown> = { ...state.params };
      for (const key of Object.keys(params)) {
        stage.setParam(key, params[key] as number | string | boolean, t);
      }
    }
  }

  setTempo(bpm: number, time?: number): void {
    const t = time ?? this.ctx.currentTime;
    for (const stage of this.stages) stage.setTempo(bpm, t);
  }

  dispose(): void {
    for (const stage of this.stages) stage.dispose();
    this.input.disconnect();
    this.output.disconnect();
    this.stages = [];
  }
}

/** Fallback for a missing stage state (schema guarantees full arrays in practice). */
function fallbackState(kind: EffectKind): EffectState {
  switch (kind) {
    case "distortion":
      return { kind, bypass: true, params: { drive: 0.3, tone: 0.6 } };
    case "chorus":
      return { kind, bypass: true, params: { rate: 1.2, depth: 0.4, mix: 0.35 } };
    case "delay":
      return { kind, bypass: true, params: { timeBeats: 0.75, feedback: 0.35, mix: 0.25, sync: true, timeSeconds: 0.35 } };
    case "reverb":
      return { kind, bypass: true, params: { decay: 2.2, mix: 0.25 } };
  }
}
