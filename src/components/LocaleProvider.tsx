"use client";

import { createContext, useContext, useMemo } from "react";
import { dirFor, fill as fillTemplate, type Dictionary, type Locale } from "@/lib/i18n";

/**
 * Makes translations available to client components.
 *
 * Server components call `getT()` directly; client components can't, so the dictionary
 * is handed down once from the root layout and read from context here.
 */

type LocaleContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Dictionary;
  /** Fill {placeholders} — Arabic word order rarely matches English, so no concatenation. */
  fill: (template: string, values: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir: dirFor(locale), t: dictionary, fill: fillTemplate }),
    [locale, dictionary],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useT must be used inside <LocaleProvider>.");
  return context;
}

/** Translations for a client component. */
export function useT(): Dictionary {
  return useLocaleContext().t;
}

export function useLocale(): { locale: Locale; dir: "ltr" | "rtl" } {
  const { locale, dir } = useLocaleContext();
  return { locale, dir };
}

/** Translations plus the placeholder filler, for strings that interpolate values. */
export function useTranslation(): LocaleContextValue {
  return useLocaleContext();
}
