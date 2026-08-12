/**
 * Schema migrations. Every persisted project is run through migrateProject
 * before validation. Migrations are pure, ordered, and never skip versions.
 */
import { SCHEMA_VERSION } from "./types";
import type { Project } from "./types";
import { projectSchema } from "./schemas";

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** Index = version migrating FROM. migrations[1] upgrades v1 → v2. */
const migrations: Record<number, Migration> = {
  // v1 is the current version; no migrations yet.
};

export function migrateProject(doc: Record<string, unknown>): Record<string, unknown> {
  let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 1;
  let current = doc;
  while (version < SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`Missing migration from schema version ${version}`);
    }
    current = migrate(current);
    version += 1;
    current.schemaVersion = version;
  }
  return current;
}

/**
 * Parse an unknown payload (IndexedDB, imported JSON) into a Project.
 * Returns null when the payload is not recoverable.
 */
export function parseProject(payload: unknown): Project | null {
  if (typeof payload !== "object" || payload === null) return null;
  try {
    const migrated = migrateProject(payload as Record<string, unknown>);
    const result = projectSchema.safeParse(migrated);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Portable export shape: project JSON plus blob manifest. */
export interface ProjectExport {
  format: "0wave-project";
  formatVersion: 1;
  exportedAt: string;
  project: Project;
  /** Blob keys referenced by assets; blobs travel as separate files. */
  blobKeys: string[];
}

export function toProjectExport(project: Project): ProjectExport {
  return {
    format: "0wave-project",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    project,
    blobKeys: project.assets.map((a) => a.localBlobKey),
  };
}
