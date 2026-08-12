/**
 * Microphone input monitor. The stream is routed into a GainNode and an
 * AnalyserNode for level metering only; it is intentionally NOT connected
 * to the master bus. Permission denial propagates the DOMException so the
 * UI can map it to user-facing copy.
 */
export class InputMonitor {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frame: Float32Array<ArrayBuffer> | null = null;
  private level = 0;
  private closed = false;

  constructor(private ctx: AudioContext) {}

  /** Request the mic and build the monitor graph. Rejects with the DOMException. */
  async open(deviceId?: string): Promise<MediaStream> {
    if (this.closed) throw new Error("Input monitor is closed");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.8;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.3;
    this.source.connect(this.gain);
    this.gain.connect(this.analyser);
    this.frame = new Float32Array(this.analyser.fftSize);
    return stream;
  }

  /** Smoothed peak level 0..1, or null when no input is open. */
  getLevel(): number | null {
    if (!this.analyser || !this.frame || this.closed) return null;
    this.analyser.getFloatTimeDomainData(this.frame);
    let peak = 0;
    for (let i = 0; i < this.frame.length; i++) {
      const abs = Math.abs(this.frame[i]);
      if (abs > peak) peak = abs;
    }
    // Decaying peak hold: falls back at ~20%/poll, snaps up instantly.
    this.level = Math.max(peak, this.level * 0.8);
    return this.level;
  }

  close(): void {
    this.closed = true;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    this.frame = null;
    this.level = 0;
  }
}
