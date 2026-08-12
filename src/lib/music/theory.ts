/**
 * Music math utilities. Pure functions, fully unit-tested.
 */

/** MIDI note → frequency in Hz (A4 = 69 = 440 Hz). */
export function noteToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** MIDI note → display name, e.g. 60 → "C4". */
export function noteToName(note: number): string {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

/** Note name like "C#4" → MIDI number. Returns null when unparsable. */
export function nameToNote(name: string): number | null {
  const match = /^([A-G])(#|b)?(-?\d+)$/.exec(name.trim());
  if (!match) return null;
  const base = NOTE_NAMES.indexOf(match[1] as (typeof NOTE_NAMES)[number]);
  if (base < 0) return null;
  let semitone = base;
  if (match[2] === "#") semitone += 1;
  if (match[2] === "b") semitone -= 1;
  const octave = Number(match[3]);
  const midi = semitone + (octave + 1) * 12;
  return midi >= 0 && midi <= 127 ? midi : null;
}

/** Seconds per beat at a given BPM. */
export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** Beats → seconds. */
export function beatsToSeconds(beats: number, bpm: number): number {
  return beats * secondsPerBeat(bpm);
}

/** Seconds → beats. */
export function secondsToBeats(seconds: number, bpm: number): number {
  return seconds / secondsPerBeat(bpm);
}

/** Quantize a beat position to the nearest 1/stepsPerBeat step. */
export function quantizeBeat(beat: number, stepsPerBeat: number): number {
  if (stepsPerBeat <= 0) return beat;
  return Math.round(beat * stepsPerBeat) / stepsPerBeat;
}

/** Quantize duration to at least one step. */
export function quantizeDuration(beats: number, stepsPerBeat: number): number {
  const q = quantizeBeat(beats, stepsPerBeat);
  return q > 0 ? q : 1 / stepsPerBeat;
}

/**
 * Swing offset in beats for a note starting on an even subdivision.
 * swing 0..1 shifts even steps later by up to half a step.
 */
export function swingOffsetBeats(startBeat: number, stepsPerBeat: number, swing: number): number {
  if (swing <= 0 || stepsPerBeat <= 0) return 0;
  const step = startBeat * stepsPerBeat;
  const stepIndex = Math.round(step);
  if (Math.abs(step - stepIndex) > 1e-6) return 0; // off-grid notes unchanged
  if (stepIndex % 2 === 0) return 0; // odd-numbered steps (0-based even) stay
  return (swing * 0.5) / stepsPerBeat;
}

/** Format a beat position as bars.beats.subdivision, 1-based. */
export function formatPosition(
  positionBeats: number,
  beatsPerBar: number,
  subdivisions = 4,
): string {
  const bar = Math.floor(positionBeats / beatsPerBar);
  const beatInBar = Math.floor(positionBeats - bar * beatsPerBar);
  const frac = positionBeats - bar * beatsPerBar - beatInBar;
  const sub = Math.floor(frac * subdivisions);
  return `${bar + 1}.${beatInBar + 1}.${sub + 1}`;
}

/** Clamp helper. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Map normalized 0..1 knob value to a log-scale frequency. */
export function knobToFrequency(t: number, min = 20, max = 20000): number {
  return min * Math.pow(max / min, clamp(t, 0, 1));
}

/** Inverse of knobToFrequency. */
export function frequencyToKnob(freq: number, min = 20, max = 20000): number {
  return clamp(Math.log(freq / min) / Math.log(max / min), 0, 1);
}

/** MIDI velocity (0-127) → linear gain, applying sensitivity 0..1. */
export function velocityToGain(velocity: number, sensitivity: number): number {
  const v = clamp(velocity / 127, 0, 1);
  return 1 - sensitivity + sensitivity * v;
}
