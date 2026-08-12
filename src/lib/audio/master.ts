/**
 * Master bus: input gain -> DynamicsCompressor (limiter) -> destination,
 * with two analyser taps (pre-limiter, so the scope shows real peaks and
 * clip detection can fire) and clip detection throttled to 4 Hz.
 */
export interface MasterBusEvents {
  onClip?: () => void;
}

/** Peak above which the master bus is considered to be clipping. */
const CLIP_PEAK = 0.99;
/** Clip events are polled (and therefore emitted) at most 4 times per second. */
const CLIP_POLL_MS = 250;

export class MasterBus {
  /** Master gain; everything routes in here. */
  readonly input: GainNode;
  /** 2048-point time-domain scope tap. */
  readonly scopeAnalyser: AnalyserNode;
  /** 1024-point frequency tap. */
  readonly freqAnalyser: AnalyserNode;

  private ctx: AudioContext;
  private compressor: DynamicsCompressorNode;
  private clipFrame: Float32Array<ArrayBuffer>;
  private clipTimer: number | null = null;
  private lastClipAt = 0;
  private onClip: (() => void) | undefined;

  constructor(ctx: AudioContext, events: MasterBusEvents = {}) {
    this.ctx = ctx;
    this.onClip = events.onClip;

    this.input = ctx.createGain();
    this.input.gain.value = 1;

    this.compressor = ctx.createDynamicsCompressor();
    // Limiter: -3 dB threshold, 12:1 ratio, hard knee, fast attack.
    this.compressor.threshold.value = -3;
    this.compressor.ratio.value = 12;
    this.compressor.knee.value = 0;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.1;

    this.scopeAnalyser = ctx.createAnalyser();
    this.scopeAnalyser.fftSize = 2048;
    this.freqAnalyser = ctx.createAnalyser();
    this.freqAnalyser.fftSize = 1024;
    this.freqAnalyser.smoothingTimeConstant = 0.7;

    this.input.connect(this.scopeAnalyser);
    this.input.connect(this.freqAnalyser);
    this.input.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    this.clipFrame = new Float32Array(this.scopeAnalyser.fftSize);
    if (this.onClip) {
      this.clipTimer = window.setInterval(() => this.checkClip(), CLIP_POLL_MS);
    }
  }

  private checkClip(): void {
    if (!this.onClip) return;
    this.scopeAnalyser.getFloatTimeDomainData(this.clipFrame);
    let peak = 0;
    for (let i = 0; i < this.clipFrame.length; i++) {
      const abs = Math.abs(this.clipFrame[i]);
      if (abs > peak) peak = abs;
    }
    const now = performance.now();
    if (peak > CLIP_PEAK && now - this.lastClipAt >= CLIP_POLL_MS) {
      this.lastClipAt = now;
      this.onClip();
    }
  }

  dispose(): void {
    if (this.clipTimer !== null) {
      window.clearInterval(this.clipTimer);
      this.clipTimer = null;
    }
    this.input.disconnect();
    this.scopeAnalyser.disconnect();
    this.freqAnalyser.disconnect();
    this.compressor.disconnect();
  }
}
