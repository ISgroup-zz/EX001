import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney, formatPercent, percentOf } from "@/lib/money";

/** Small presentational building blocks shared across every page. */

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {breadcrumb.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-slate-300">/</span>}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-slate-700 hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneClass = {
    default: "text-slate-900",
    positive: "text-emerald-700",
    negative: "text-red-700",
    warning: "text-amber-700",
  }[tone];

  return (
    <div className="card px-4 py-3.5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  // Documents
  PO: "bg-brand-50 text-brand-700 ring-brand-200",
  CONTRACT: "bg-violet-50 text-violet-700 ring-violet-200",
  FRAMEWORK: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  VARIATION: "bg-amber-50 text-amber-800 ring-amber-200",
  // Lifecycle
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ISSUED: "bg-brand-50 text-brand-700 ring-brand-200",
  PLANNED: "bg-slate-100 text-slate-600 ring-slate-200",
  PARTIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  PARTIALLY_RECEIVED: "bg-amber-50 text-amber-800 ring-amber-200",
  PARTIALLY_PAID: "bg-amber-50 text-amber-800 ring-amber-200",
  FULFILLED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  RECEIVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  POSTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-200",
  ON_HOLD: "bg-amber-50 text-amber-800 ring-amber-200",
  EXHAUSTED: "bg-red-50 text-red-700 ring-red-200",
  EXPIRED: "bg-red-50 text-red-700 ring-red-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-200",
  OVERDUE: "bg-red-50 text-red-700 ring-red-200",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = BADGE_TONES[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={`badge ${tone}`}>{label ?? status.replace(/_/g, " ").toLowerCase()}</span>;
}

export function Money({
  minor,
  currency = "USD",
  className = "",
}: {
  minor: number;
  currency?: string;
  className?: string;
}) {
  return <span className={`tabular ${className}`}>{formatMoney(minor, currency)}</span>;
}

/** A labelled proportion bar — framework ceilings, budget consumption, plan coverage. */
export function ProgressBar({
  value,
  total,
  tone = "brand",
  showPct = true,
}: {
  value: number;
  total: number;
  tone?: "brand" | "emerald" | "amber" | "red";
  showPct?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, percentOf(value, total)));
  const barTone = {
    brand: "bg-brand-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  }[tone];

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
      </div>
      {showPct && <span className="w-12 shrink-0 text-right text-xs text-slate-500 tabular">{formatPercent(pct, 0)}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tones}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** Ordered → planned → received, the three numbers a PM checks on a PO line. */
export function CoverageCell({
  ordered,
  planned,
  received,
  uom,
}: {
  ordered: number;
  planned: number;
  received: number;
  uom: string;
}) {
  const unplanned = Math.max(0, ordered - planned);
  return (
    <div className="min-w-[150px]">
      <div className="flex items-baseline justify-between text-xs text-slate-500">
        <span className="tabular">
          {received} / {ordered} {uom}
        </span>
        {unplanned > 0 && <span className="text-amber-700">{unplanned} unplanned</span>}
      </div>
      <div className="mt-1">
        <ProgressBar value={received} total={ordered} tone={received >= ordered ? "emerald" : "brand"} showPct={false} />
      </div>
    </div>
  );
}
