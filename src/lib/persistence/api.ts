/**
 * Persistence contract.
 *
 * Local-first: the local IndexedDB repository is the default and works with
 * no backend. A Supabase repository implements the same interface behind an
 * access-mode adapter (PUBLIC_LOCAL / ANONYMOUS_CLOUD / ACCOUNT_REQUIRED).
 */
import type { ID, Project } from "../schema/types";

export interface StoredBlob {
  key: string;
  data: Blob;
  mimeType: string;
}

export interface ProjectSummary {
  id: ID;
  name: string;
  updatedAt: string;
}

export interface ProjectRepository {
  readonly kind: "local" | "cloud";
  saveProject(project: Project): Promise<void>;
  loadProject(id: ID): Promise<Project | null>;
  /** Most recently updated project, for session restore. */
  loadLatestProject(): Promise<Project | null>;
  listProjects(): Promise<ProjectSummary[]>;
  deleteProject(id: ID): Promise<void>;

  saveBlob(blob: StoredBlob): Promise<void>;
  loadBlob(key: string): Promise<Blob | null>;
  deleteBlob(key: string): Promise<void>;
}

export class QuotaExceededError extends Error {
  constructor() {
    super("Local storage quota exceeded");
    this.name = "QuotaExceededError";
  }
}
