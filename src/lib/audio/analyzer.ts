/**
 * Analyzer: reads frames from the master bus taps into preallocated arrays.
 * No per-frame allocation; callers must not hold onto the returned arrays
 * across calls (they are reused).
 */
import type { AnalyzerFrame } from "./api";

export class Analyzer {
  private timeDomain: Float32Array<ArrayBuffer>;
  private frequency: Uint8Array<ArrayBuffer>;

  constructor(private scope: AnalyserNode, private freq: AnalyserNode) {
    this.timeDomain = new Float32Array(scope.fftSize);
    this.frequency = new Uint8Array(freq.frequencyBinCount);
  }

  getFrame(): AnalyzerFrame {
    this.scope.getFloatTimeDomainData(this.timeDomain);
    this.freq.getByteFrequencyData(this.frequency);
    return { timeDomain: this.timeDomain, frequency: this.frequency };
  }

  dispose(): void {
    /* Analyser nodes are owned by the master bus; nothing to release here. */
  }
}
