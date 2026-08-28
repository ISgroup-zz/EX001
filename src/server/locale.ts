import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALE_COOKIE, type Dictionary, type Locale } from "@/lib/i18n";

/**
 * The locale for the current request, read from a cookie.
 *
 * Reading it on the server matters: `dir` has to be right in the HTML that is first
 * sent, otherwise an Arabic user watches the entire layout flip after hydration.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Translations for a server component. */
export async function getT(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
