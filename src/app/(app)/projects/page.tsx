import Link from "next/link";
import { EmptyState, Money, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { listProjects } from "@/server/services/project";
import { getProjectSummary } from "@/server/services/reporting";
import { prisma } from "@/server/db";
import { formatDate } from "@/lib/dates";
import { getT } from "@/server/locale";

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
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t.projects.title}
        subtitle={`${projects.length} ${projects.length === 1 ? t.projects.project : t.projects.projects}`}
        actions={
          <Link href="/projects/new" className="btn-primary">
            {t.projects.openProject}
          </Link>
        }
      />

      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="q">
            {t.common.search}
          </label>
          <input id="q" name="q" defaultValue={filters.q ?? ""} className="input" placeholder={t.projects.searchPlaceholder} />
        </div>
        <div className="min-w-[160px]">
          <label className="label" htmlFor="status">
            {t.common.status}
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className="select">
            <option value="">{t.common.all}</option>
            {["ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"].map((status) => (
              <option key={status} value={status}>
                {(t.statuses as Record<string, string | undefined>)[status] ?? status.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="label" htmlFor="clientId">
            {t.common.client}
          </label>
          <select id="clientId" name="clientId" defaultValue={filters.clientId ?? ""} className="select">
            <option value="">{t.common.all}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          {t.common.apply}
        </button>
      </form>

      <div className="card overflow-hidden">
        {summaries.length === 0 ? (
          <EmptyState
            title={t.projects.noProjects}
            description={t.projects.noProjectsHint}
            action={
              <Link href="/projects/new" className="btn-primary btn-sm">
                {t.projects.openProject}
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>{t.common.project}</th>
                  <th>{t.common.client}</th>
                  <th>{t.projects.openedOn}</th>
                  <th className="num text-end">{t.projects.budget}</th>
                  <th className="num text-end">{t.projects.committed}</th>
                  <th className="num text-end">{t.projects.invoiced}</th>
                  <th className="w-40">{t.projects.billedVsBudget}</th>
                  <th>{t.common.status}</th>
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
                        {project.code} · {t.projects.target} {formatDate(project.targetDate)}
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
                    <td className="num text-end font-medium">
                      <Money minor={summary.budgetMinor} currency={project.currency} />
                    </td>
                    <td className="num text-end">
                      <Money minor={summary.committedCostMinor} currency={project.currency} />
                    </td>
                    <td className="num text-end">
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
