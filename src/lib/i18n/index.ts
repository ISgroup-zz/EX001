import { en, type Dictionary } from "./en";
import { ar } from "./ar";
import { DEFAULT_LOCALE, type Locale } from "./config";

export type { Dictionary } from "./en";
export * from "./config";

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/**
 * Fill {placeholders} in a translated string.
 *
 * Interpolation rather than string concatenation, because Arabic word order differs
 * from English — "budget {amount} remaining" cannot be assembled from fragments.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
