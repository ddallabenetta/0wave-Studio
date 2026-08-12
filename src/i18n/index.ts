/**
 * Centralized UI strings. Every user-facing label lives here; components
 * never hardcode copy. English and Italian both cover the full key set;
 * `Strings = typeof en` makes a missing Italian key a type error. The only
 * missing piece is the switcher: `strings` resolves once, at import time,
 * to DEFAULT_LOCALE.
 */
import { en } from "./en";
import { it } from "./it";

export type Locale = "en" | "it";
export type Strings = typeof en;

const dictionaries: Record<Locale, Strings> = { en, it };

export const DEFAULT_LOCALE: Locale = "en";

export function getStrings(locale: Locale = DEFAULT_LOCALE): Strings {
  return dictionaries[locale] ?? dictionaries.en;
}

/** MVP hook point: locale switch lands post-MVP; read once here. */
export const strings = getStrings();
