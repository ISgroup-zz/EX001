import { redirect } from "next/navigation";
import { getCurrentUser, signIn } from "@/server/auth";

export const metadata = { title: "Sign in · Procurement Hub" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { error } = await searchParams;

  async function authenticate(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await signIn(email, password);
    if (!result.ok) redirect(`/login?error=${encodeURIComponent(result.error ?? "Sign-in failed.")}`);
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-base font-bold text-white">
            P
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Procurement Hub</h1>
            <p className="text-xs text-slate-500">Projects, purchase orders, deliveries and invoicing</p>
          </div>
        </div>

        <form action={authenticate} className="card space-y-4 p-5">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required autoFocus autoComplete="email" className="input" />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
            />
          </div>

          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
        </form>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <p className="mb-1 font-medium text-slate-700">Demo sign-ins</p>
          <p className="tabular">admin@procurementhub.test · password123</p>
          <p className="tabular">pm@procurementhub.test · password123</p>
          <p className="tabular">viewer@procurementhub.test · password123</p>
        </div>
      </div>
    </div>
  );
}
