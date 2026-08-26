import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetTimeline } from "@/components/BudgetTimeline";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { getBudgetTimeline } from "@/server/services/budget";
import { formatDate } from "@/lib/dates";

export default async function ProjectAgreementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const timeline = await getBudgetTimeline(id);
  const budgetMinor = timeline.at(-1)?.runningBudgetMinor ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card overflow-hidden lg:col-span-2">
        <div className="card-header">
          <div>
            <h2 className="card-title">Client documents</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Purchase orders, contracts, frameworks and variations received from {project.client.name}.
            </p>
          </div>
          <Link href={`/projects/${id}/agreements/new`} className="btn-primary btn-sm">
            Add document
          </Link>
        </div>

        {timeline.length === 0 ? (
          <EmptyState title="No documents" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Issued</th>
                  <th className="num text-right">Document value</th>
                  <th className="num text-right">Effect on budget</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((entry) => (
                  <tr key={entry.agreementId}>
                    <td>
                      <Link href={`/agreements/${entry.agreementId}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                        {entry.reference}
                      </Link>
                      {entry.title && <div className="truncate text-xs text-slate-500">{entry.title}</div>}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {entry.isOriginating && (
                          <span className="badge bg-slate-900 text-white ring-slate-900">opening document</span>
                        )}
                        {entry.isCallOff && (
                          <span className="badge bg-slate-100 text-slate-600 ring-slate-200">
                            call-off on {entry.parentReference}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={entry.type} />
                    </td>
                    <td className="tabular">{formatDate(entry.issueDate)}</td>
                    <td className="num text-right">
                      <Money minor={entry.valueMinor} currency={project.currency} />
                    </td>
                    <td className="num text-right">
                      {entry.deltaMinor === 0 ? (
                        <span className="text-xs text-slate-400">no change</span>
                      ) : (
                        <span className={entry.deltaMinor > 0 ? "font-medium text-emerald-700" : "font-medium text-red-700"}>
                          {entry.deltaMinor > 0 ? "+" : "−"}
                          <Money minor={Math.abs(entry.deltaMinor)} currency={project.currency} />
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={entry.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                    Project budget
                  </td>
                  <td className="num px-4 py-3 text-right text-sm font-semibold text-slate-900">
                    <Money minor={budgetMinor} currency={project.currency} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Budget timeline</h2>
        </div>
        <div className="p-5">
          <BudgetTimeline entries={timeline} currency={project.currency} />
        </div>
      </section>
    </div>
  );
}
