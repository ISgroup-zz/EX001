"use client";

import { formatQty } from "@/lib/money";
import { useT } from "./LocaleProvider";
import { ProgressBar } from "./ui";

/**
 * Status and document-type badges.
 *
 * A client component purely so it can read the dictionary — these labels appear on
 * nearly every screen, and translating them at each call site would mean threading a
 * label through a hundred places.
 */

const BADGE_TONES: Record<string, string> = {
  // Document types
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
  const t = useT();
  const tone = BADGE_TONES[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";

  // A badge carries either a document type (PO, FRAMEWORK…) or a lifecycle status.
  const documentTypes = t.documentTypes as Record<string, string | undefined>;
  const statuses = t.statuses as Record<string, string | undefined>;
  const translated = documentTypes[status] ?? statuses[status];

  return <span className={`badge ${tone}`}>{label ?? translated ?? status.replace(/_/g, " ").toLowerCase()}</span>;
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
  const t = useT();
  const unplanned = Math.max(0, ordered - planned);

  return (
    <div className="min-w-[150px]">
      <div className="flex items-baseline justify-between text-xs text-slate-500">
        <span className="tabular">
          {formatQty(received)} / {formatQty(ordered)} {uom}
        </span>
        {unplanned > 0 && (
          <span className="text-amber-700">
            {formatQty(unplanned)} {t.vendorPo.unplanned}
          </span>
        )}
      </div>
      <div className="mt-1">
        <ProgressBar value={received} total={ordered} tone={received >= ordered ? "emerald" : "brand"} showPct={false} />
      </div>
    </div>
  );
}
