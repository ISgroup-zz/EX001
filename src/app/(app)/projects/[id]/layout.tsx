import { notFound } from "next/navigation";
import Link from "next/link";
import { KpiCard, PageHeader, StatusBadge } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { getProject } from "@/server/services/project";
import { getProjectSummary } from "@/server/services/reporting";
import { prisma } from "@/server/db";
import { formatDate } from "@/lib/dates";
import { formatMoneyCompact, formatPercent } from "@/lib/money";

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

  return (
    <>
      <PageHeader
        title={project.name}
        breadcrumb={[{ label: "Projects", href: "/projects" }, { label: project.code }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={project.status} />
            <span>{project.client.name}</span>
            <span className="text-slate-300">·</span>
            <span className="tabular">{project.code}</span>
            {project.manager && (
              <>
                <span className="text-slate-300">·</span>
                <span>PM {project.manager.name}</span>
              </>
            )}
            {project.originatingAgreement && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  opened on
                  <Link href={`/agreements/${project.originatingAgreement.id}`} className="link tabular">
                    {project.originatingAgreement.reference}
                  </Link>
                </span>
              </>
            )}
            {project.targetDate && (
              <>
                <span className="text-slate-300">·</span>
                <span>target {formatDate(project.targetDate)}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Link href={`/projects/${id}/agreements/new`} className="btn-secondary">
              Add client document
            </Link>
            <Link href={`/projects/${id}/vendor-pos/new`} className="btn-primary">
              New vendor PO
            </Link>
          </>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Budget"
          value={formatMoneyCompact(summary.budgetMinor, project.currency)}
          hint={`${agreementCount} client document${agreementCount === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Committed cost"
          value={formatMoneyCompact(summary.committedCostMinor, project.currency)}
          hint={`Received ${formatMoneyCompact(summary.receivedCostMinor, project.currency)}`}
        />
        <KpiCard
          label="Margin"
          value={formatMoneyCompact(summary.marginMinor, project.currency)}
          hint={formatPercent(summary.marginPct)}
          tone={summary.marginMinor >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label="Invoiced"
          value={formatMoneyCompact(summary.invoicedNetMinor, project.currency)}
          hint={`${formatMoneyCompact(summary.budgetRemainingMinor, project.currency)} of budget left`}
        />
        <KpiCard
          label="Ready to invoice"
          value={formatMoneyCompact(summary.unbilledDeliveredMinor, project.currency)}
          hint="Delivered, not yet billed"
          tone={summary.unbilledDeliveredMinor > 0 ? "warning" : "default"}
        />
      </section>

      <Tabs
        tabs={[
          { href: `/projects/${id}`, label: "Overview" },
          { href: `/projects/${id}/agreements`, label: "Client documents", badge: agreementCount },
          { href: `/projects/${id}/vendor-pos`, label: "Vendor POs", badge: poCount },
          { href: `/projects/${id}/grns`, label: "Goods receipts", badge: grnCount },
          { href: `/projects/${id}/invoices`, label: "Invoices", badge: invoiceCount },
          { href: `/projects/${id}/forecast`, label: "Forecast" },
        ]}
      />

      {children}
    </>
  );
}
