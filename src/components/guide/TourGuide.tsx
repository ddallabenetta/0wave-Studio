"use client";

/**
 * The four-stop guided tour.
 *
 * A spotlight ring glides between the parts of the interface that matter
 * first — where sounds live, how to shape one, how to play it, where to
 * arrange it — with a card explaining each in a sentence. Targets opt in by
 * carrying `data-tour="<step>"`; a step whose target is not on the current
 * page still shows its card, centred, instead of stalling the tour.
 *
 * The overlay never blocks the app: it is pointer-transparent apart from
 * its own card, so the user can keep clicking around while it is up.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, X } from "@phosphor-icons/react";
import { TOUR_STEPS, useGuideStore } from "@/lib/state/guide-store";
import { strings } from "@/i18n";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_WIDTH = 320;
const CARD_GAP = 14;
/** Room the card needs below its top edge; also its centring height. */
const CARD_HEIGHT = 190;
const EDGE = 12;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

/**
 * Where the explanation goes relative to the thing it explains.
 *
 * Below the target is the first choice — it reads in the same direction as
 * the sentence. But the tour's targets include full-height panels, and a
 * card forced below one of those ends up sitting *on* the panel, covering
 * exactly what it is pointing at. So: below if it fits, beside it if not,
 * and centred when there is no target on this page at all.
 *
 * Everything is in pixels. Centring via `translate` would be overwritten by
 * the card's own entrance animation, which silently pushes it off-centre.
 */
function placeCard(rect: Rect | null): React.CSSProperties {
  const maxTop = window.innerHeight - CARD_HEIGHT - EDGE;
  const maxLeft = window.innerWidth - CARD_WIDTH - EDGE;

  if (!rect) {
    return {
      top: clamp(window.innerHeight / 2 - CARD_HEIGHT / 2, EDGE, Math.max(EDGE, maxTop)),
      left: clamp((window.innerWidth - CARD_WIDTH) / 2, EDGE, Math.max(EDGE, maxLeft)),
    };
  }

  const below = rect.top + rect.height + CARD_GAP;
  if (below <= maxTop) {
    return {
      top: below,
      left: clamp(rect.left + rect.width / 2 - CARD_WIDTH / 2, EDGE, Math.max(EDGE, maxLeft)),
    };
  }

  // No room underneath: sit beside the target, on whichever side has space.
  const rightOf = rect.left + rect.width + CARD_GAP;
  const leftOf = rect.left - CARD_WIDTH - CARD_GAP;
  const left = rightOf <= maxLeft ? rightOf : leftOf >= EDGE ? leftOf : clamp(rect.left, EDGE, Math.max(EDGE, maxLeft));
  return { top: clamp(rect.top, EDGE, Math.max(EDGE, maxTop)), left };
}

export function TourGuide() {
  const stepIndex = useGuideStore((s) => s.tourStep);
  const nextTourStep = useGuideStore((s) => s.nextTourStep);
  const endTour = useGuideStore((s) => s.endTour);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = stepIndex === null ? null : TOUR_STEPS[stepIndex];

  const measure = useCallback(() => {
    if (!step) return;
    const target = document.querySelector<HTMLElement>(`[data-tour="${step}"]`);
    if (!target) {
      setRect(null);
      return;
    }
    const box = target.getBoundingClientRect();
    setRect({
      top: box.top - PAD,
      left: box.left - PAD,
      width: box.width + PAD * 2,
      height: box.height + PAD * 2,
    });
  }, [step]);

  useEffect(() => {
    if (!step) return;
    // Measured on the next frame rather than synchronously: the target may
    // still be settling (a panel opening, a list rendering), and reading
    // layout inside the effect body would both be wrong and force an extra
    // render pass.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    if (!step) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") endTour();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, endTour]);

  if (stepIndex === null || !step) return null;

  const copy = strings.guide.tour[step];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const cardStyle = placeCard(rect);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-0 z-[55]">
      {rect && (
        <div
          aria-hidden
          className="absolute rounded-[var(--radius-panel)] border-2 border-accent"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "var(--halo-strong), 0 0 0 9999px rgba(0, 0, 0, 0.28)",
            transition:
              "top var(--dur-4) var(--ease-out-expo), left var(--dur-4) var(--ease-out-expo), width var(--dur-4) var(--ease-out-expo), height var(--dur-4) var(--ease-out-expo)",
          }}
        />
      )}

      <div
        role="dialog"
        aria-label={copy.title}
        className="material-glass anim-pop pointer-events-auto absolute rounded-[var(--radius-panel)] p-4"
        style={{ ...cardStyle, width: CARD_WIDTH }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-accent-ink">
            {strings.guide.tour.step
              .replace("{n}", String(stepIndex + 1))
              .replace("{total}", String(TOUR_STEPS.length))}
          </span>
          <button
            type="button"
            onClick={endTour}
            aria-label={strings.guide.tour.skip}
            className="motion-ui -mr-1 -mt-1 flex size-6 items-center justify-center rounded-[var(--radius-control)] text-ink-faint hover:bg-surface hover:text-ink"
          >
            <X size={13} weight="bold" aria-hidden />
          </button>
        </div>

        <h2 className="mt-1.5 text-sm font-semibold text-ink">{copy.title}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{copy.body}</p>

        <div className="mt-3 flex items-center justify-between">
          <div aria-hidden className="flex items-center gap-1.5">
            {TOUR_STEPS.map((id, index) => (
              <span
                key={id}
                className="motion-ui h-1 rounded-full"
                style={{
                  width: index === stepIndex ? 16 : 6,
                  background: index <= stepIndex ? "var(--accent)" : "var(--edge-strong)",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={nextTourStep}
            className="motion-ui sheen inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-accent px-2.5 py-1 text-xs font-medium text-accent-on hover:bg-accent-hover active:translate-y-px"
          >
            {isLast ? strings.guide.tour.done : strings.guide.tour.next}
            {!isLast && <ArrowRight size={11} weight="bold" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
