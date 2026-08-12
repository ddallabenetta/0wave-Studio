/**
 * Supabase-backed ProjectRepository (kind: 'cloud').
 *
 * Storage mapping:
 *   - Project documents  -> public.projects rows (whole doc in state_json)
 *   - Audio blobs        -> private 'audio-assets' bucket, path convention
 *                           {user_id}/{project_id}/{asset_id}
 *                           (see supabase/storage.md)
 *
 * Conflict strategy: last-write-wins on updated_at. Both the projects table
 * and the bucket are keyed by stable ids, and every save writes the full
 * current document. When two clients write the same project, the row with
 * the newer updated_at (maintained by the DB trigger) is the winner; the
 * blob path embeds the same ids, so the newest upload replaces the older
 * object (upload uses upsert: true). No merge is attempted: the document is
 * the unit of truth. Declared per ADR-008 and supabase/migrations/0001_init.sql.
 *
 * Validation: loads run parseProject (ADR-009), the same boundary used for
 * IndexedDB loads and imports. Invalid rows surface as "not found" (null).
 *
 * All Supabase access happens inside functions; the module has no top-level
 * side effects and is safe to import during SSR.
 */
import { parseProject } from "../../schema/migrations";
import type { ID, Project } from "../../schema/types";
import type { ProjectRepository, ProjectSummary, StoredBlob } from "../api";
import { getSupabaseBrowser, getUser } from "./client";

const BUCKET = "audio-assets";

/** Raw projects row; state_json is the unvalidated Project document. */
interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  schema_version: number;
  state_json: unknown;
  created_at: string;
  updated_at: string;
}

/** The asset lookup result: the ids needed to build a storage path. */
interface AssetOwner {
  projectId: string;
  assetId: string;
}

export class SupabaseProjectRepository implements ProjectRepository {
  readonly kind = "cloud" as const;

  /* ------------------------------------------------------------------ */
  /* Projects                                                           */
  /* ------------------------------------------------------------------ */

  async saveProject(project: Project): Promise<void> {
    const client = this.requireClient();
    const userId = await this.requireUserId();
    const { error } = await client.from("projects").upsert(
      {
        id: project.id,
        user_id: userId,
        name: project.name,
        schema_version: project.schemaVersion,
        state_json: project as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`Cloud save failed: ${error.message}`);
  }

  async loadProject(id: ID): Promise<Project | null> {
    const client = this.requireClient();
    const { data, error } = await client
      .from("projects")
      .select("id, user_id, name, schema_version, state_json, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Cloud load failed: ${error.message}`);
    return data ? parseProject((data as ProjectRow).state_json) : null;
  }

  async loadLatestProject(): Promise<Project | null> {
    const client = this.requireClient();
    const { data, error } = await client
      .from("projects")
      .select("id, user_id, name, schema_version, state_json, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Cloud load failed: ${error.message}`);
    return data ? parseProject((data as ProjectRow).state_json) : null;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const client = this.requireClient();
    const { data, error } = await client
      .from("projects")
      .select("id, name, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Cloud list failed: ${error.message}`);
    return (data ?? []).map((row) => {
      const r = row as Pick<ProjectRow, "id" | "name" | "updated_at">;
      return { id: r.id, name: r.name, updatedAt: r.updated_at };
    });
  }

  /**
   * Delete the project row plus every blob in its storage folder. Rows in
   * sounds/audio_assets cascade via foreign keys; storage objects are not
   * tied to rows, so the {user_id}/{project_id}/ folder is listed and
   * removed explicitly.
   */
  async deleteProject(id: ID): Promise<void> {
    const client = this.requireClient();
    const userId = await this.requireUserId();
    const folder = `${userId}/${id}`;
    const { data: objects, error: listError } = await client.storage
      .from(BUCKET)
      .list(folder);
    if (listError) throw new Error(`Cloud delete failed: ${listError.message}`);
    const names = (objects ?? []).map((o) => `${folder}/${o.name}`);
    if (names.length > 0) {
      const { error: removeError } = await client.storage.from(BUCKET).remove(names);
      if (removeError) throw new Error(`Cloud delete failed: ${removeError.message}`);
    }
    const { error } = await client.from("projects").delete().eq("id", id);
    if (error) throw new Error(`Cloud delete failed: ${error.message}`);
  }

  /* ------------------------------------------------------------------ */
  /* Blobs                                                              */
  /* ------------------------------------------------------------------ */

  async saveBlob(blob: StoredBlob): Promise<void> {
    const client = this.requireClient();
    const owner = await this.resolveAssetOwner(blob.key);
    const path = `${owner.userId}/${owner.projectId}/${owner.assetId}`;
    const { error } = await client.storage.from(BUCKET).upload(path, blob.data, {
      contentType: blob.mimeType,
      upsert: true,
    });
    if (error) throw new Error(`Cloud blob save failed: ${error.message}`);
  }

  async loadBlob(key: string): Promise<Blob | null> {
    const client = this.requireClient();
    const owner = await this.resolveAssetOwner(key);
    const path = `${owner.userId}/${owner.projectId}/${owner.assetId}`;
    const { data, error } = await client.storage.from(BUCKET).download(path);
    if (error) {
      // Object not found is a normal miss (storage returns a 404/400 with
      // "Object not found" or "The resource was not found"); everything else
      // is a real failure.
      const message = error.message.toLowerCase();
      if (message.includes("not found")) return null;
      throw new Error(`Cloud blob load failed: ${error.message}`);
    }
    return data;
  }

  async deleteBlob(key: string): Promise<void> {
    const client = this.requireClient();
    const owner = await this.resolveAssetOwner(key);
    const path = `${owner.userId}/${owner.projectId}/${owner.assetId}`;
    const { error } = await client.storage.from(BUCKET).remove([path]);
    if (error) throw new Error(`Cloud blob delete failed: ${error.message}`);
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                          */
  /* ------------------------------------------------------------------ */

  private requireClient() {
    const client = getSupabaseBrowser();
    if (!client) {
      throw new Error("Supabase is not configured; cloud persistence is unavailable");
    }
    return client;
  }

  private async requireUserId(): Promise<string> {
    const user = await getUser();
    if (!user) throw new Error("Not signed in; cloud persistence needs a session");
    return user.id;
  }

  /**
   * Resolve the storage path ids for an asset key. The key is either the
   * asset id or its localBlobKey; the owning project is found by scanning the
   * user's project documents. This keeps the blob path consistent with the
   * {user_id}/{project_id}/{asset_id} convention without duplicating asset
   * metadata in a separate sync.
   */
  private async resolveAssetOwner(key: string): Promise<AssetOwner & { userId: string }> {
    const client = this.requireClient();
    const userId = await this.requireUserId();
    const { data, error } = await client
      .from("projects")
      .select("id, state_json")
      .eq("user_id", userId);
    if (error) throw new Error(`Cloud blob lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      const state = (row as { id: string; state_json: unknown }).state_json as
        | { assets?: Array<{ id: string; localBlobKey: string }> }
        | undefined;
      const asset = state?.assets?.find(
        (a) => a.localBlobKey === key || a.id === key,
      );
      if (asset) {
        return { userId, projectId: (row as { id: string }).id, assetId: asset.id };
      }
    }
    throw new Error(`Cloud blob lookup failed: no project owns asset "${key}"`);
  }
}
