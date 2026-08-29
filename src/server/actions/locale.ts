"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE, DEFAULT_LOCALE } from "@/lib/i18n";

/** Switch language. Stored for a year so the choice sticks across sessions. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const requested = String(formData.get("locale") ?? "");
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Every page renders translated text, so the whole tree is stale.
  revalidatePath("/", "layout");
}
