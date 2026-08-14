"use client";

/**
 * The animated wave mark used on the welcome overlay and the audio gate.
 *
 * Three layers of the same waveform: two soft, slowly drifting copies for
 * depth, and one accent stroke on top that draws itself on mount. A narrow
 * light band sweeps along the stroke afterwards, which reads as "this thing
 * makes sound" without pretending to be a meter — there is no audio to
 * display at the point where it appears.
 *
 * The geometry is computed once at module scope from a fixed sum of sines,
 * so the server and the client render byte-identical markup.
 */

const WIDTH = 320;
const HEIGHT = 72;
const SAMPLES = 160;

/** Sum of three sines: enough interference to look organic, still periodic. */
function wavePath(amplitude: number, phase: number): string {
  const mid = HEIGHT / 2;
  const points: string[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const x = t * WIDTH;
    const y =
      mid -
      amplitude *
        (Math.sin(t * Math.PI * 4 + phase) * 0.6 +
          Math.sin(t * Math.PI * 9 + phase * 1.7) * 0.28 +
          Math.sin(t * Math.PI * 15 + phase * 0.4) * 0.12);
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return points.join(" ");
}

const FRONT = wavePath(24, 0);
const MID = wavePath(17, 1.4);
const BACK = wavePath(11, 2.9);

/** Generous over-estimate of the path length, for the draw-on animation. */
const TRACE_LENGTH = 900;

export function WaveMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      role="img"
      aria-label="0wave"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Fades both ends of every layer so the wave has no hard edges. */}
        <linearGradient id="owave-mark-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="18%" stopColor="var(--accent)" stopOpacity="1" />
          <stop offset="82%" stopColor="var(--accent-glow)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--accent-glow)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g fill="none" strokeLinecap="round">
        <path
          d={BACK}
          stroke="var(--accent)"
          strokeOpacity="0.18"
          strokeWidth="2"
          style={{ animation: "owave-breathe 5.5s var(--ease-in-out) infinite" }}
        />
        <path
          d={MID}
          stroke="var(--accent)"
          strokeOpacity="0.32"
          strokeWidth="2"
          style={{ animation: "owave-breathe 4.1s var(--ease-in-out) infinite reverse" }}
        />
        <path
          d={FRONT}
          stroke="url(#owave-mark-fade)"
          strokeWidth="2.5"
          strokeDasharray={TRACE_LENGTH}
          strokeDashoffset={TRACE_LENGTH}
          style={{ animation: "owave-trace 1.6s var(--ease-out-expo) 120ms forwards" }}
        />
      </g>
    </svg>
  );
}
