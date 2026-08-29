"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { SessionUser } from "@/server/auth";
import { LanguageToggle } from "./LanguageToggle";
import { useT } from "./LocaleProvider";

export function AppShell({
  user,
  deliveryAlerts,
  children,
}: {
  user: SessionUser;
  deliveryAlerts: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();

  const nav = [
    { href: "/", label: t.nav.dashboard, exact: true },
    { href: "/projects", label: t.nav.projects },
    { href: "/deliveries", label: t.nav.deliveries },
    { href: "/invoices", label: t.nav.invoices },
    { href: "/forecast", label: t.nav.forecast },
    { href: "/clients", label: t.nav.clients },
    { href: "/vendors", label: t.nav.vendors },
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              P
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">{t.app.name}</span>
          </Link>

          <nav className="order-3 -mx-1 flex w-full items-center gap-0.5 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                  isActive(item.href, item.exact)
                    ? "bg-slate-100 font-medium text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {item.label}
                {item.href === "/deliveries" && deliveryAlerts > 0 && (
                  <span className="ms-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                    {deliveryAlerts}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <LanguageToggle />
            <Link href="/projects/new" className="btn-primary btn-sm hidden sm:inline-flex">
              {t.nav.openProject}
            </Link>
            <div className="hidden text-end sm:block">
              <div className="text-xs font-medium text-slate-900">{user.name}</div>
              <div className="text-[11px] text-slate-500">{t.roles[user.role] ?? user.role}</div>
            </div>
            <form action="/api/sign-out" method="post">
              <button type="submit" className="btn-ghost btn-sm">
                {t.nav.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
