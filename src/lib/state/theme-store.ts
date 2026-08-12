/**
 * Theme preference: "system" (default) follows the OS via CSS
 * `prefers-color-scheme`; "light" / "dark" force a scheme. Persisted to
 * localStorage and applied to `<html data-theme>` by ThemeProvider.
 */
import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "0wave-theme";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

interface ThemeState {
  theme: ThemePreference;
  setTheme(theme: ThemePreference): void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: "system",
  setTheme: (theme) => set({ theme }),
}));
