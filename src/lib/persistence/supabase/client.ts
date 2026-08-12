/**
 * Supabase browser client (client components only).
 *
 * The client is created lazily inside getSupabaseBrowser(), never at module
 * top level, so importing this module is SSR-safe: createBrowserClient wires
 * cookie handling against document.cookie, which does not exist on the server.
 *
 * Returns null (and every helper no-ops with a null result) when Supabase is
 * not configured; callers should already have degraded to PUBLIC_LOCAL via
 * effectiveMode() before reaching the repository, but the guards keep this
 * module safe to import unconditionally.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAccessConfig } from "../access";

let browserClient: SupabaseClient | null = null;

/** Lazy browser client, or null when NEXT_PUBLIC_SUPABASE_* is not set. */
export function getSupabaseBrowser(): SupabaseClient | null {
  const config = getAccessConfig();
  if (!config.supabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(config.supabaseUrl!, config.supabaseAnonKey!);
  }
  return browserClient;
}

/* ------------------------------------------------------------------ */
/* Session helpers (browser).                                          */
/* ------------------------------------------------------------------ */

/** Current authenticated user, or null when signed out or unconfigured. */
export async function getUser(): Promise<User | null> {
  const client = getSupabaseBrowser();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user;
}

/** Sign in as an anonymous user (requires anon sign-ins enabled in Auth settings). */
export async function signInAnonymously() {
  const client = getSupabaseBrowser();
  if (!client) return null;
  return client.auth.signInAnonymously();
}

/** Send a passwordless email magic link; the link redirects back to /studio. */
export async function signInWithOtp(email: string) {
  const client = getSupabaseBrowser();
  if (!client) return null;
  return client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/studio`,
    },
  });
}

/** Sign the current session out. */
export async function signOut() {
  const client = getSupabaseBrowser();
  if (!client) return null;
  return client.auth.signOut();
}
