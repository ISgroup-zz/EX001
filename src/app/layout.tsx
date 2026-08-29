import type { Metadata } from "next";
import { LocaleProvider } from "@/components/LocaleProvider";
import { dirFor, getDictionary } from "@/lib/i18n";
import { getLocale } from "@/server/locale";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t.app.name, description: t.app.tagline };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved on the server so `dir` is already correct in the first HTML — otherwise an
  // Arabic user watches the whole layout mirror itself after hydration.
  const locale = await getLocale();
  const dictionary = getDictionary(locale);

  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body>
        <LocaleProvider locale={locale} dictionary={dictionary}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
