import Link from "next/link";
import { EmptyState, Money, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { listProjects } from "@/server/services/project";
import { getProjectSummary } from "@/server/services/reporting";
import { prisma } from "@/server/db";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Projects · Procurement Hub" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; clientId?: string; q?: string }>;
}) {
  const filters = await searchParams;
  const [projects, clients] = await Promise.all([
    listProjects({ status: filters.status, clientId: filters.clientId, search: filters.q }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const summaries = await Promise.all(
    projects.map(async (project) => ({ project, summary: await getProjectSummary(project.id) })),
  );

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
        actions={
          <Link href="/projects/new" className="btn-primary">
            Open project
          </Link>
        }
      />

      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" defaultValue={filters.q ?? ""} className="input" placeholder="Name or code" />
        </div>
        <div className="min-w-[160px]">
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className="select">
            <option value="">All</option>
            {["ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"].map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="label" htmlFor="clientId">
            Client
          </label>
          <select id="clientId" name="clientId" defaultValue={filters.clientId ?? ""} className="select">
            <option value="">All</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      <div className="card overflow-hidden">
        {summaries.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Open one against the purchase order, contract or framework the client has sent you."
            action={
              <Link href="/projects/new" className="btn-primary btn-sm">
                Open project
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Opened on</th>
                  <th className="num text-right">Budget</th>
                  <th className="num text-right">Committed</th>
                  <th className="num text-right">Invoiced</th>
                  <th className="w-40">Billed vs budget</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(({ project, summary }) => (
                  <tr key={project.id}>
                    <td>
                      <Link href={`/projects/${project.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {project.name}
                      </Link>
                      <div className="text-xs text-slate-500 tabular">
                        {project.code} · target {formatDate(project.targetDate)}
                      </div>
                    </td>
                    <td>{project.client.name}</td>
                    <td>
                      {project.originatingAgreement ? (
                        <div className="flex items-center gap-2">
                          <StatusBadge status={project.originatingAgreement.type} />
                          <span className="text-xs text-slate-500 tabular">{project.originatingAgreement.reference}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="num text-right font-medium">
                      <Money minor={summary.budgetMinor} currency={project.currency} />
                    </td>
                    <td className="num text-right">
                      <Money minor={summary.committedCostMinor} currency={project.currency} />
                    </td>
                    <td className="num text-right">
                      <Money minor={summary.invoicedNetMinor} currency={project.currency} />
                    </td>
                    <td>
                      <ProgressBar value={summary.invoicedNetMinor} total={summary.budgetMinor} />
                    </td>
                    <td>
                      <StatusBadge status={project.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
