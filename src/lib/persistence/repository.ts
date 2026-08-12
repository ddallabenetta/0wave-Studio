/**
 * Repository factory: picks the persistence backend from the access mode.
 *
 *   PUBLIC_LOCAL        -> IndexedDB repository (default; works with no env)
 *   ANONYMOUS_CLOUD     -> Supabase repository with anonymous sessions
 *   ACCOUNT_REQUIRED    -> Supabase repository with email sign-in
 *
 * effectiveMode() already degrades cloud modes to PUBLIC_LOCAL when Supabase
 * env vars are missing, so this never throws for a missing backend. The cloud
 * implementation is dynamically imported so the default PUBLIC_LOCAL bundle
 * stays free of Supabase code.
 */
import type { ProjectRepository } from "./api";
import { effectiveMode, getAccessConfig } from "./access";
// Browser-safe: touches IndexedDB only inside functions, never at module top
// level (see local.ts). The local repo is the static default.
import { localRepository } from "./local";

export async function getRepository(): Promise<ProjectRepository> {
  const mode = effectiveMode(getAccessConfig());
  if (mode === "PUBLIC_LOCAL") return localRepository;
  const { SupabaseProjectRepository } = await import("./supabase/repository");
  return new SupabaseProjectRepository();
}
