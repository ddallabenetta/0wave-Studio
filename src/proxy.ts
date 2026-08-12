/**
 * Route protection for ACCOUNT_REQUIRED mode.
 *
 * Conservative by design:
 *   - Only /studio and /playground are gated (exact paths; no globs).
 *   - PUBLIC_LOCAL (the default) and ANONYMOUS_CLOUD always pass through.
 *   - If the raw mode is ACCOUNT_REQUIRED but Supabase env vars are missing,
 *     the app has already degraded to PUBLIC_LOCAL via effectiveMode(), so
 *     this proxy passes through instead of bricking local development.
 *   - On a transient Supabase network error the request is allowed through;
 *     the repository layer reports the failure with a clear error. A hard
 *     redirect here would lock users out during an outage.
 *
 * Session check: builds an @supabase/ssr server client from request cookies
 * and calls getUser(), which validates the JWT and refreshes it when needed.
 * Refreshed cookies are written back to the response so the client session
 * stays alive (this is the proxy role described in
 * src/lib/persistence/supabase/server.ts). next/headers cookies() is not
 * available in the proxy, so this client uses request/response cookies
 * instead, per the @supabase/ssr docs.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAccessConfig } from "@/lib/persistence/access";

export async function proxy(request: NextRequest) {
  const config = getAccessConfig();
  if (config.mode !== "ACCOUNT_REQUIRED" || !config.supabaseConfigured) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.supabaseUrl!, config.supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch {
    // Transient network failure: pass through (documented above).
    return NextResponse.next({ request });
  }

  return response;
}

export const config = {
  matcher: ["/studio", "/studio/", "/playground", "/playground/"],
};
