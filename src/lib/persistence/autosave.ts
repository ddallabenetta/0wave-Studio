/**
 * Autosave: debounced persistence of the project store to IndexedDB.
 *
 * Subscribes to useProjectStore and saves 800ms after the last mutation,
 * skipping saves while the project is clean. startAutosave is idempotent:
 * calling it again is a no-op until stopAutosave. Save state is mirrored to
 * the store ('saving' -> 'saved', 'error' on failure, 'quota-error' on
 * QuotaExceededError), which TopBar renders.
 */
import { useProjectStore } from "@/lib/state/project-store";
import type { Project } from "../schema/types";
import { QuotaExceededError } from "./api";
import { localRepository } from "./local";

const DEBOUNCE_MS = 800;

let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;
/** Project reference the pending debounce already covers. */
let pendingRef: Project | null = null;

function scheduleSave(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runSave();
  }, DEBOUNCE_MS);
}

async function runSave(): Promise<void> {
  if (saveInFlight) {
    // A save is already running and this call carries a newer project;
    // retry once it settles so that project is not lost.
    scheduleSave();
    return;
  }
  const store = useProjectStore.getState();
  if (!store.dirty) return;
  saveInFlight = true;
  const snapshot = store.project;
  store.setSaveState("saving");
  try {
    await localRepository.saveProject(snapshot);
    const current = useProjectStore.getState();
    // Only clear dirty when the saved snapshot is still the current project;
    // edits made mid-save keep dirty set and re-trigger the listener.
    if (current.project === snapshot) current.markSaved();
  } catch (err) {
    useProjectStore
      .getState()
      .setSaveState(err instanceof QuotaExceededError ? "quota-error" : "error");
  } finally {
    saveInFlight = false;
  }
}

export function startAutosave(): void {
  if (unsubscribe) return;
  unsubscribe = useProjectStore.subscribe((state) => {
    // React only to real mutations (project reference change); saveState
    // transitions must not schedule work, or failures would retry forever.
    if (!state.dirty || state.project === pendingRef) return;
    pendingRef = state.project;
    scheduleSave();
  });
}

export function stopAutosave(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  unsubscribe?.();
  unsubscribe = null;
  saveInFlight = false;
  pendingRef = null;
}
