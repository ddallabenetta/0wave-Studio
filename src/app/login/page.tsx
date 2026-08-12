"use client";

/**
 * Login page: the only route outside the app shell.
 *
 * Behavior by access mode (NEXT_PUBLIC_ZEROWAVE_ACCESS_MODE):
 *   - PUBLIC_LOCAL (default): nothing to sign into; redirects to /studio.
 *   - ANONYMOUS_CLOUD: email magic link plus a "continue anonymously" path.
 *   - ACCOUNT_REQUIRED: email magic link only.
 *   - Cloud mode with missing Supabase env vars: explicit config-missing
 *     error state instead of a broken form (the repository factory degrades
 *     to local persistence, but the operator should know the mode is
 *     misconfigured).
 *
 * Auth runs through @supabase/ssr browser client helpers
 * (lib/persistence/supabase/client.ts), which no-op safely when unconfigured.
 */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  EnvelopeSimple,
  UserCirclePlus,
  WarningCircle,
} from "@phosphor-icons/react";
import { strings } from "@/i18n";
import { getAccessConfig } from "@/lib/persistence/access";
import {
  getUser,
  signInAnonymously,
  signInWithOtp,
} from "@/lib/persistence/supabase/client";

type PageState =
  | { kind: "form" }
  | { kind: "sent" }
  | { kind: "config-missing" };

export default function LoginPage() {
  const router = useRouter();
  const config = getAccessConfig();
  const [state, setState] = useState<PageState>({ kind: "form" });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** False until the redirect checks finish, so the form never flashes. */
  const [ready, setReady] = useState(false);

  // PUBLIC_LOCAL: local-first mode has no account system; send the user
  // straight into the studio. Signed-in visitors skip the form too.
  useEffect(() => {
    if (config.mode === "PUBLIC_LOCAL") {
      router.replace("/studio");
      return;
    }
    void getUser()
      .then((user) => {
        if (user) router.replace("/studio");
      })
      .catch(() => {
        // Transient network failure: show the form; auth will re-check.
      })
      .finally(() => setReady(true));
  }, [config.mode, router]);

  // Cloud mode without credentials: show the setup error, never a dead form.
  const isCloudMode = config.mode === "ANONYMOUS_CLOUD" || config.mode === "ACCOUNT_REQUIRED";
  if (config.mode === "PUBLIC_LOCAL") {
    return <main className="min-h-[100dvh] bg-base" />;
  }
  if (!ready && isCloudMode && config.supabaseConfigured) {
    return <main className="min-h-[100dvh] bg-base" />;
  }
  if (isCloudMode && !config.supabaseConfigured) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-base px-4">
        <div className="material-raised w-[420px] rounded-[var(--radius-panel)] p-8">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent-wash text-warning">
            <WarningCircle size={26} weight="bold" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold text-ink">{strings.login.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {strings.login.configMissing}
          </p>
          <p className="mt-4 font-mono text-xs text-ink-faint">MODE: {config.mode}</p>
        </div>
      </main>
    );
  }

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithOtp(value);
      if (result === null) {
        setState({ kind: "config-missing" });
        return;
      }
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setState({ kind: "sent" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const continueAnonymously = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signInAnonymously();
      if (result === null) {
        setState({ kind: "config-missing" });
        return;
      }
      if (result.error) {
        setError(result.error.message);
        return;
      }
      router.replace("/studio");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-base px-4">
      <div className="material-raised w-[420px] rounded-[var(--radius-panel)] p-8">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent-wash text-accent">
          {state.kind === "sent" ? (
            <CheckCircle size={26} weight="bold" aria-hidden />
          ) : (
            <EnvelopeSimple size={26} weight="bold" aria-hidden />
          )}
        </div>
        <h1 className="text-lg font-semibold text-ink">{strings.login.title}</h1>
        <p className="mt-1 font-mono text-xs text-ink-faint">MODE: {config.mode}</p>

        {state.kind === "sent" ? (
          <div>
            <p role="status" className="mt-4 text-sm leading-relaxed text-ink-soft">
              {strings.login.checkEmail}
            </p>
            <Link
              href="/studio"
              className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-hover"
            >
              {strings.nav.studio}
            </Link>
          </div>
        ) : (
          <form onSubmit={submitOtp} className="mt-6">
            <label htmlFor="login-email" className="text-sm font-medium text-ink">
              {strings.login.email}
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="material-sunken mt-1.5 w-full rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="material-raised motion-ui mt-4 w-full rounded-[var(--radius-control)] bg-accent px-4 py-2.5 text-sm font-medium text-accent-on hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-60"
            >
              {busy ? strings.common.loading : strings.login.send}
            </button>
            {config.mode === "ANONYMOUS_CLOUD" && (
              <button
                type="button"
                onClick={continueAnonymously}
                disabled={busy}
                className="material-raised motion-ui mt-2 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2.5 text-sm text-ink-soft hover:text-ink disabled:opacity-60"
              >
                <UserCirclePlus size={18} weight="bold" aria-hidden />
                {strings.login.continueAnonymously}
              </button>
            )}
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
