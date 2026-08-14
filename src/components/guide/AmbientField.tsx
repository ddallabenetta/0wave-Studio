"use client";

/**
 * The light field behind full-screen overlays.
 *
 * Two blurred accent orbs on slow, deliberately mismatched drift cycles,
 * plus a fine grain pass so the large flat backdrop does not look like a
 * sheet of plastic. Purely decorative: `aria-hidden`, pointer-transparent,
 * and reduced to a static gradient when the user asks for less motion.
 */
export function AmbientField({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <span
        className="ambient-orb"
        style={{
          top: "-14%",
          left: "8%",
          width: "42vw",
          height: "42vw",
          background: "radial-gradient(circle, var(--accent) 0%, transparent 68%)",
          opacity: 0.24,
        }}
      />
      <span
        className="ambient-orb ambient-orb-b"
        style={{
          bottom: "-22%",
          right: "4%",
          width: "38vw",
          height: "38vw",
          background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 66%)",
          opacity: 0.18,
          animationDelay: "-6s",
        }}
      />
      <span className="grain absolute inset-0" />
    </div>
  );
}
