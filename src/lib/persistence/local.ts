/**
 * Local-first IndexedDB repository (idb).
 *
 * Database `0wave-studio`, version 1:
 *   - `projects` store, keyPath `id`, index `updatedAt` (for latest/sorted listing)
 *   - `blobs` store, keyPath `key`
 *
 * Projects are persisted as raw JSON; no validation happens here (callers run
 * parseProject per ADR-009). IndexedDB is only touched inside functions, never
 * at module top level, so this module is SSR-safe.
 */
import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { Project } from "../schema/types";
import { QuotaExceededError } from "./api";
import type { ProjectRepository, ProjectSummary, StoredBlob } from "./api";

const DB_NAME = "0wave-studio";
const DB_VERSION = 1;
const STORE_PROJECTS = "projects";
const STORE_BLOBS = "blobs";

/** Raw persisted project document; content is opaque until caller-validated. */
type ProjectRecord = Record<string, unknown> & { id: string; updatedAt: string };

interface ZerowaveDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectRecord;
    indexes: { updatedAt: string };
  };
  blobs: {
    key: string;
    value: StoredBlob;
  };
}

let dbPromise: Promise<IDBPDatabase<ZerowaveDB>> | null = null;

/** Lazily open the database; every method goes through here. */
function getDb(): Promise<IDBPDatabase<ZerowaveDB>> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is not available in this environment; local persistence needs a browser"),
    );
  }
  if (!dbPromise) {
    dbPromise = openDB<ZerowaveDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          const store = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains(STORE_BLOBS)) {
          db.createObjectStore(STORE_BLOBS, { keyPath: "key" });
        }
      },
    });
    // A failed open must not poison the module forever; allow a later retry.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function isQuotaExceeded(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "QuotaExceededError"
  );
}

/** Translate IDB quota failures into the contract's QuotaExceededError. */
async function wrapQuota<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (isQuotaExceeded(err)) throw new QuotaExceededError();
    throw err;
  }
}

export const localRepository: ProjectRepository = {
  kind: "local",

  saveProject(project) {
    return wrapQuota(async () => {
      const db = await getDb();
      // Stored as raw JSON; loaders return it unvalidated for parseProject.
      // Stored as raw JSON; loaders return it unvalidated for parseProject.
      await db.put(STORE_PROJECTS, project as unknown as ProjectRecord);
    });
  },

  async loadProject(id) {
    const db = await getDb();
    const record = await db.get(STORE_PROJECTS, id);
    // Raw persisted JSON; caller validates (ADR-009).
    return (record ?? null) as Project | null;
  },

  async loadLatestProject() {
    const db = await getDb();
    const tx = db.transaction(STORE_PROJECTS, "readonly");
    const cursor = await tx.store.index("updatedAt").openCursor(null, "prev");
    // Raw persisted JSON; caller validates (ADR-009).
    return (cursor?.value ?? null) as Project | null;
  },

  async listProjects() {
    const db = await getDb();
    const records = await db.getAll(STORE_PROJECTS);
    return records
      .map((record): ProjectSummary => ({
        id: record.id,
        name: typeof record.name === "string" ? record.name : "",
        updatedAt: record.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async deleteProject(id) {
    const db = await getDb();
    await db.delete(STORE_PROJECTS, id);
  },

  saveBlob(blob) {
    return wrapQuota(async () => {
      const db = await getDb();
      await db.put(STORE_BLOBS, blob);
    });
  },

  async loadBlob(key) {
    const db = await getDb();
    return (await db.get(STORE_BLOBS, key))?.data ?? null;
  },

  async deleteBlob(key) {
    const db = await getDb();
    await db.delete(STORE_BLOBS, key);
  },
};
