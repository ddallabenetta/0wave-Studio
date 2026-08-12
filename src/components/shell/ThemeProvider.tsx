"use client";

/**
 * Keeps `<html data-theme>` in sync with the persisted theme preference.
 *
 * "system" is resolved purely in CSS (globals.css) via
 * `@media (prefers-color-scheme: dark)`, so it reacts to OS changes live
 * with no JS. A stored preference is read only inside an effect (never
 * during render) so the server and client markup never diverge; the
 * pre-hydration inline script in layout.tsx already painted the correct
 * theme, so there is no flash while this boots.
 */
import { useEffect, useRef } from "react";
import {
  useThemeStore,
  THEME_STORAGE_KEY,
  isThemePreference,
} from "@/lib/state/theme-store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) {
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        /* private mode / quota: preference just won't persist */
      }
      return;
    }
    applied.current = true;
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const next = isThemePreference(stored) ? stored : "system";
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }, [theme, setTheme]);

  return <>{children}</>;
}
