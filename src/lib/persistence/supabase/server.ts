/**
 * Supabase server client (route handlers and server components only).
 *
 * Uses the @supabase/ssr cookie adapter against next/headers cookies(). In
 * Next 16 cookies() is async, so every access awaits it first. Middleware
 * cannot use next/headers (it has no cookie store); it builds its own client
 * from request/response cookies in src/proxy.ts.
 *
 * setAll tolerates read-only cookie stores (Server Components): session
 * refreshes must then be handled by the proxy, which this module documents.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAccessConfig } from "../access";

/** Lazy server client per request, or null when Supabase is not configured. */
export async function getSupabaseServer(): Promise<SupabaseClient | null> {
  const config = getAccessConfig();
  if (!config.supabaseConfigured) return null;
  const cookieStore = await cookies();
  return createServerClient(config.supabaseUrl!, config.supabaseAnonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Read-only context (Server Component render): the refresh cannot
          // be written here. src/proxy.ts refreshes sessions before
          // protected routes render, so the next request carries fresh
          // cookies. This matches the @supabase/ssr documented pattern.
        }
      },
    },
  });
}

/** Current authenticated user for server-side code, or null when signed out/unconfigured. */
export async function getServerUser(): Promise<User | null> {
  const client = await getSupabaseServer();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user;
}
