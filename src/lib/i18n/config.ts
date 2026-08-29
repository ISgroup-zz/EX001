/**
 * Locale configuration.
 *
 * Two locales, chosen per user and stored in a cookie so the choice survives sessions
 * and is readable on the server before the first paint — the document's `dir` has to be
 * correct in the initial HTML, otherwise the layout visibly flips after hydration.
 */

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Arabic runs right-to-left; the whole document mirrors, not just the text. */
export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
