import { redirect } from "next/navigation";
import { getCurrentUser, signIn } from "@/server/auth";
import { getT } from "@/server/locale";
import { LanguageToggle } from "@/components/LanguageToggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const t = await getT();
  const { error } = await searchParams;

  async function authenticate(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const dictionary = await getT();

    const result = await signIn(email, password);
    if (!result.ok) redirect(`/login?error=${encodeURIComponent(dictionary.auth.invalid)}`);
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-base font-bold text-white">
              P
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">{t.app.name}</h1>
              <p className="text-xs text-slate-500">{t.app.tagline}</p>
            </div>
          </div>
          {/* Offered before sign-in, so an Arabic speaker never has to read an English form. */}
          <LanguageToggle />
        </div>

        <form action={authenticate} className="card space-y-4 p-5">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}

          <div>
            <label className="label" htmlFor="email">
              {t.auth.email}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              dir="ltr"
              className="input text-start"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              {t.auth.password}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="input text-start"
            />
          </div>

          <button type="submit" className="btn-primary w-full">
            {t.auth.signIn}
          </button>
        </form>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <p className="mb-1 font-medium text-slate-700">{t.auth.demoSignIns}</p>
          {/* Credentials are Latin script — pinned LTR so they read correctly in Arabic. */}
          <div dir="ltr" className="text-start">
            <p className="tabular">admin@procurementhub.test · password123</p>
            <p className="tabular">pm@procurementhub.test · password123</p>
            <p className="tabular">viewer@procurementhub.test · password123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
