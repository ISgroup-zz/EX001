"use client";

import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";
import { setLocaleAction } from "@/server/actions/locale";

/**
 * Language switch. A two-option segmented control rather than a dropdown — with only
 * English and Arabic, both choices are worth showing, and switching is one click.
 */
export function LanguageToggle() {
  const { locale } = useLocale();

  return (
    <div className="no-print flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
      {LOCALES.map((option) => {
        const isActive = option === locale;
        return (
          <form key={option} action={setLocaleAction}>
            <input type="hidden" name="locale" value={option} />
            <button
              type="submit"
              lang={option}
              aria-current={isActive ? "true" : undefined}
              className={`rounded-md px-2 py-1 text-xs transition ${
                isActive ? "bg-slate-100 font-medium text-slate-900" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {LOCALE_LABELS[option]}
            </button>
          </form>
        );
      })}
    </div>
  );
}
