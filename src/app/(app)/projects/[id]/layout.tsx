import { notFound } from "next/navigation";
import Link from "next/link";
import { KpiCard, PageHeader, StatusBadge } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { getProject } from "@/server/services/project";
import { getProjectSummary } from "@/server/services/reporting";
import { prisma } from "@/server/db";
import { formatDate } from "@/lib/dates";
import { formatMoneyCompact, formatPercent } from "@/lib/money";
import { getT } from "@/server/locale";

/** Header, headline numbers and tabs shared by every project screen. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [summary, counts] = await Promise.all([
    getProjectSummary(id),
    Promise.all([
      prisma.clientAgreement.count({ where: { projectId: id } }),
      prisma.vendorPO.count({ where: { projectId: id } }),
      prisma.gRN.count({ where: { vendorPo: { projectId: id } } }),
      prisma.invoice.count({ where: { projectId: id } }),
    ]),
  ]);
  const [agreementCount, poCount, grnCount, invoiceCount] = counts;
  const t = await getT();

  return (
    <>
      <PageHeader
        title={project.name}
        breadcrumb={[{ label: t.projects.title, href: "/projects" }, { label: project.code }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={project.status} />
            <span>{project.client.name}</span>
            <span className="text-slate-300">·</span>
            <span className="tabular">{project.code}</span>
            {project.manager && (
              <>
                <span className="text-slate-300">·</span>
                <span>{t.projects.projectManager}: {project.manager.name}</span>
              </>
            )}
            {project.originatingAgreement && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  {t.projects.openedOn}
                  <Link href={`/agreements/${project.originatingAgreement.id}`} className="link tabular">
                    {project.originatingAgreement.reference}
                  </Link>
                </span>
              </>
            )}
            {project.targetDate && (
              <>
                <span className="text-slate-300">·</span>
                <span>{t.projects.target} {formatDate(project.targetDate)}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Link href={`/projects/${id}/agreements/new`} className="btn-secondary">
              {t.projects.addClientDocument}
            </Link>
            <Link href={`/projects/${id}/vendor-pos/new`} className="btn-primary">
              {t.vendorPo.newVendorPo}
            </Link>
          </>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label={t.projects.budget}
          value={formatMoneyCompact(summary.budgetMinor, project.currency)}
          hint={`${agreementCount} ${agreementCount === 1 ? t.projects.clientDocumentCountOne : t.projects.clientDocumentCount}`}
        />
        <KpiCard
          label={t.projects.committedCost}
          value={formatMoneyCompact(summary.committedCostMinor, project.currency)}
          hint={`${t.dashboard.received} ${formatMoneyCompact(summary.receivedCostMinor, project.currency)}`}
        />
        <KpiCard
          label={t.dashboard.margin}
          value={formatMoneyCompact(summary.marginMinor, project.currency)}
          hint={formatPercent(summary.marginPct)}
          tone={summary.marginMinor >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label={t.projects.invoiced}
          value={formatMoneyCompact(summary.invoicedNetMinor, project.currency)}
          hint={`${formatMoneyCompact(summary.budgetRemainingMinor, project.currency)} ${t.projects.ofBudgetLeft}`}
        />
        <KpiCard
          label={t.dashboard.readyToInvoice}
          value={formatMoneyCompact(summary.unbilledDeliveredMinor, project.currency)}
          hint={t.projects.deliveredNotYetBilled}
          tone={summary.unbilledDeliveredMinor > 0 ? "warning" : "default"}
        />
      </section>

      <Tabs
        tabs={[
          { href: `/projects/${id}`, label: t.projects.overview },
          { href: `/projects/${id}/agreements`, label: t.projects.clientDocuments, badge: agreementCount },
          { href: `/projects/${id}/vendor-pos`, label: t.projects.vendorPos, badge: poCount },
          { href: `/projects/${id}/grns`, label: t.projects.goodsReceipts, badge: grnCount },
          { href: `/projects/${id}/invoices`, label: t.projects.invoices, badge: invoiceCount },
          { href: `/projects/${id}/forecast`, label: t.projects.forecast },
        ]}
      />

      {children}
    </>
  );
}
