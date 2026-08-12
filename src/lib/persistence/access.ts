/**
 * Access modes, validated from NEXT_PUBLIC_ZEROWAVE_ACCESS_MODE.
 * Single source of truth; no scattered env checks elsewhere.
 */
export type AccessMode = "PUBLIC_LOCAL" | "ANONYMOUS_CLOUD" | "ACCOUNT_REQUIRED";

const VALID_MODES: AccessMode[] = ["PUBLIC_LOCAL", "ANONYMOUS_CLOUD", "ACCOUNT_REQUIRED"];

export interface AccessConfig {
  mode: AccessMode;
  supabaseConfigured: boolean;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

export function getAccessConfig(): AccessConfig {
  const raw = process.env.NEXT_PUBLIC_ZEROWAVE_ACCESS_MODE ?? "PUBLIC_LOCAL";
  const mode = (VALID_MODES as string[]).includes(raw) ? (raw as AccessMode) : "PUBLIC_LOCAL";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
  return {
    mode,
    supabaseUrl,
    supabaseAnonKey,
    supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  };
}

/** Cloud modes require Supabase; falls back to local with a warning surface. */
export function effectiveMode(config: AccessConfig): AccessMode {
  if (config.mode !== "PUBLIC_LOCAL" && !config.supabaseConfigured) return "PUBLIC_LOCAL";
  return config.mode;
}
