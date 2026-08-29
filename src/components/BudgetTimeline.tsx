import Link from "next/link";
import { Money, StatusBadge } from "./ui";
import { formatDate } from "@/lib/dates";
import type { BudgetTimelineEntry } from "@/server/services/budget";
import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";

/**
 * The budget's history: every client document in date order, what it added, and the
 * running budget after it. This is how "the budget went up when PO-89117 arrived"
 * becomes visible rather than something you have to work out.
 */
// Rendered from server components, so the dictionary arrives as a prop rather than
// through the client-only hook.
export function BudgetTimeline({
  entries,
  currency,
  t,
}: {
  entries: BudgetTimelineEntry[];
  currency: string;
  t: Dictionary;
}) {
  if (entries.length === 0) return null;

  return (
    <ol className="relative space-y-0">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        return (
          <li key={entry.agreementId} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && <span className="absolute start-[7px] top-4 h-full w-px bg-slate-200" aria-hidden />}
            <span
              className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white ${
                entry.deltaMinor > 0 ? "bg-emerald-500" : entry.deltaMinor < 0 ? "bg-red-500" : "bg-slate-300"
              }`}
              aria-hidden
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/agreements/${entry.agreementId}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                  {entry.reference}
                </Link>
                <StatusBadge status={entry.type} />
                {entry.isOriginating && (
                  <span className="badge bg-slate-900 text-white ring-slate-900">{t.projects.openingDocument}</span>
                )}
                {entry.isCallOff && (
                  <span className="badge bg-slate-100 text-slate-600 ring-slate-200">
                    {fill(t.agreements.callOffOn, { reference: entry.parentReference ?? "" })}
                  </span>
                )}
                {entry.status !== "ACTIVE" && <StatusBadge status={entry.status} />}
              </div>

              {entry.title && <p className="mt-0.5 truncate text-sm text-slate-600">{entry.title}</p>}
              <p className="mt-0.5 text-xs text-slate-500">{formatDate(entry.issueDate)}</p>
            </div>

            <div className="shrink-0 text-end">
              <div
                className={`text-sm font-semibold tabular ${
                  entry.deltaMinor > 0 ? "text-emerald-700" : entry.deltaMinor < 0 ? "text-red-700" : "text-slate-400"
                }`}
              >
                {entry.deltaMinor === 0 ? (
                  t.agreements.noBudgetChange
                ) : (
                  <>
                    {entry.deltaMinor > 0 ? "+" : "−"}
                    <Money minor={Math.abs(entry.deltaMinor)} currency={currency} />
                  </>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 tabular">
                {t.agreements.budgetAfter} <Money minor={entry.runningBudgetMinor} currency={currency} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
