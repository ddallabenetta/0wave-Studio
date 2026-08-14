/**
 * Guidance state for people who do not make music for a living.
 *
 * Three independent switches, all persisted to localStorage so the app
 * stops explaining itself once someone knows their way around:
 *
 *  - `welcomeSeen`   the first-run welcome overlay has been dismissed;
 *  - `explain`       plain-language hints are shown next to jargon;
 *  - `tourStep`      position in the guided tour, or null when it is idle.
 *
 * Hydration happens in an effect (GuideProvider), never during render, so
 * the server and the first client paint agree. Until then `hydrated` is
 * false and nothing that depends on stored state is rendered — that is
 * what keeps the welcome overlay from flashing for returning users.
 */
import { create } from "zustand";

export const GUIDE_STORAGE_KEY = "0wave-guide";

/** Ordered stops of the guided tour. `null` means the tour is not running. */
export const TOUR_STEPS = ["library", "shape", "hear", "arrange"] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

interface PersistedGuide {
  welcomeSeen: boolean;
  explain: boolean;
}

interface GuideState extends PersistedGuide {
  /** False until localStorage has been read on the client. */
  hydrated: boolean;
  /** Index into TOUR_STEPS, or null when the tour is not running. */
  tourStep: number | null;

  hydrate(): void;
  setExplain(explain: boolean): void;
  dismissWelcome(): void;
  /** Re-opens the welcome overlay from the top bar. */
  replayWelcome(): void;
  startTour(): void;
  nextTourStep(): void;
  endTour(): void;
}

const DEFAULTS: PersistedGuide = { welcomeSeen: false, explain: true };

function read(): PersistedGuide {
  try {
    const raw = localStorage.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const record = parsed as Record<string, unknown>;
    return {
      welcomeSeen:
        typeof record.welcomeSeen === "boolean" ? record.welcomeSeen : DEFAULTS.welcomeSeen,
      explain: typeof record.explain === "boolean" ? record.explain : DEFAULTS.explain,
    };
  } catch {
    /* Private mode, quota, or a corrupted value: fall back to defaults. */
    return DEFAULTS;
  }
}

function write(state: PersistedGuide): void {
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Preference just won't survive the session. */
  }
}

export const useGuideStore = create<GuideState>()((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  tourStep: null,

  hydrate() {
    if (get().hydrated) return;
    set({ ...read(), hydrated: true });
  },

  setExplain(explain) {
    set({ explain });
    write({ welcomeSeen: get().welcomeSeen, explain });
  },

  dismissWelcome() {
    set({ welcomeSeen: true });
    write({ welcomeSeen: true, explain: get().explain });
  },

  replayWelcome() {
    set({ welcomeSeen: false, tourStep: null });
    write({ welcomeSeen: false, explain: get().explain });
  },

  startTour() {
    set({ tourStep: 0 });
  },

  nextTourStep() {
    const current = get().tourStep;
    if (current === null) return;
    const next = current + 1;
    set({ tourStep: next >= TOUR_STEPS.length ? null : next });
  },

  endTour() {
    set({ tourStep: null });
  },
}));
