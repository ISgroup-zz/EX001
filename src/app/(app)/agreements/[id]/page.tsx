import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, EmptyState, KpiCard, Money, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { getAgreementDetail } from "@/server/services/agreement";
import { getBillableLines } from "@/server/services/invoice";
import { formatDate, isPast } from "@/lib/dates";
import { formatMoney, formatPercent, formatQty, lineTotalMinor } from "@/lib/money";
import { getT } from "@/server/locale";
import { fill } from "@/lib/i18n";

export default async function AgreementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agreement = await getAgreementDetail(id);
  if (!agreement) notFound();

  const currency = agreement.project.currency;
  const billable = agreement.type === "FRAMEWORK" ? [] : await getBillableLines(id);
  const billableByLine = new Map(billable.map((line) => [line.clientAgreementLineId, line]));
  const expired = agreement.validTo ? isPast(agreement.validTo) : false;
  const t = await getT();

  return (
    <>
      <PageHeader
        title={agreement.reference}
        breadcrumb={[
          { label: t.projects.title, href: "/projects" },
          { label: agreement.project.code, href: `/projects/${agreement.project.id}` },
          { label: t.agreements.clientDocuments, href: `/projects/${agreement.project.id}/agreements` },
          { label: agreement.reference },
        ]}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={agreement.type} />
            <StatusBadge status={agreement.status} />
            {agreement.isOriginating && (
              <span className="badge bg-slate-900 text-white ring-slate-900">opening document</span>
            )}
            {agreement.title && <span>{agreement.title}</span>}
            <span className="text-slate-300">·</span>
            <span>{t.common.issued} {formatDate(agreement.issueDate)}</span>
            {agreement.parentAgreement && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  {agreement.type === "VARIATION" ? t.agreements.amends : t.agreements.calledOff}
                  <Link href={`/agreements/${agreement.parentAgreement.id}`} className="link tabular">
                    {agreement.parentAgreement.reference}
                  </Link>
                </span>
              </>
            )}
          </span>
        }
        actions={
          agreement.type !== "FRAMEWORK" ? (
            <Link href={`/projects/${agreement.project.id}/invoices/new?agreementId=${id}`} className="btn-primary">
              {t.agreements.invoiceAgainst}
            </Link>
          ) : null
        }
      />

      {expired && (
        <div className="mb-5">
          <Alert tone="warning" title={t.agreements.expired}>
            {fill(t.agreements.expiredHint, { date: formatDate(agreement.validTo) })}
          </Alert>
        </div>
      )}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t.agreements.documentValue} value={formatMoney(agreement.valueMinor, currency)} />
        <KpiCard
          label={t.agreements.invoicedAgainstIt}
          value={formatMoney(agreement.invoicedMinor, currency)}
          hint={`${formatPercent((agreement.invoicedMinor / (agreement.valueMinor || 1)) * 100, 0)} ${t.agreements.ofValue}`}
        />
        {agreement.frameworkUsage ? (
          <>
            <KpiCard label={t.agreements.calledOff} value={formatMoney(agreement.frameworkUsage.calledOffMinor, currency)} />
            <KpiCard
              label={t.agreements.ceilingRemaining}
              value={formatMoney(agreement.frameworkUsage.remainingMinor, currency)}
              tone={agreement.frameworkUsage.remainingMinor <= 0 ? "negative" : "default"}
            />
          </>
        ) : (
          <>
            <KpiCard label={t.common.lines} value={agreement.lines.length} />
            <KpiCard label={t.projects.invoices} value={agreement.invoices.length} />
          </>
        )}
      </section>

      {agreement.frameworkUsage && (
        <section className="card mb-6 p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="card-title">{t.agreements.ceilingUsage}</h2>
            <span className="text-sm text-slate-600 tabular">
              {fill(t.dashboard.amountOfTotal, {
                amount: formatMoney(agreement.frameworkUsage.calledOffMinor, currency),
                total: formatMoney(agreement.frameworkUsage.ceilingMinor, currency),
              })}
            </span>
          </div>
          <ProgressBar
            value={agreement.frameworkUsage.calledOffMinor}
            total={agreement.frameworkUsage.ceilingMinor}
            tone={agreement.frameworkUsage.usedPct >= 90 ? "red" : agreement.frameworkUsage.usedPct >= 70 ? "amber" : "brand"}
          />

          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.agreements.callOffs}</h3>
          {agreement.frameworkUsage.callOffs.length === 0 ? (
            <p className="text-sm text-slate-500">{t.agreements.nothingCalledOff}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {agreement.frameworkUsage.callOffs.map((callOff) => (
                <li key={callOff.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/agreements/${callOff.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700 tabular">
                    {callOff.reference}
                  </Link>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={callOff.status} />
                    <Money minor={callOff.valueMinor} currency={currency} className="text-sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {agreement.lines.length > 0 && (
        <section className="card mb-6 overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">{t.common.lines}</h2>
            <p className="text-xs text-slate-500">
              {t.agreements.linesHint}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>{t.common.description}</th>
                  <th className="num text-end">{t.common.quantity}</th>
                  <th className="num text-end">{t.common.unitPrice}</th>
                  <th className="num text-end">{t.common.lineTotal}</th>
                  <th className="num text-end">{t.agreements.delivered}</th>
                  <th className="num text-end">{t.agreements.invoicedCol}</th>
                  <th className="num text-end">{t.agreements.billableNow}</th>
                </tr>
              </thead>
              <tbody>
                {agreement.lines.map((line) => {
                  const stats = billableByLine.get(line.id);
                  return (
                    <tr key={line.id}>
                      <td className="text-xs text-slate-400">{line.lineNo}</td>
                      <td className="text-slate-900">{line.description}</td>
                      <td className="num text-end tabular">
                        {formatQty(line.quantity)} {line.uom}
                      </td>
                      <td className="num text-end">
                        <Money minor={line.unitPriceMinor} currency={currency} />
                      </td>
                      <td className="num text-end font-medium">
                        <Money minor={lineTotalMinor(line.quantity, line.unitPriceMinor)} currency={currency} />
                      </td>
                      <td className="num text-end tabular">{stats ? formatQty(stats.deliveredQty) : "—"}</td>
                      <td className="num text-end tabular">{stats ? formatQty(stats.invoicedQty) : "—"}</td>
                      <td className="num text-end tabular">
                        {stats ? (
                          <span className={stats.billableQty > 0 ? "font-semibold text-emerald-700" : "text-slate-400"}>
                            {formatQty(stats.billableQty)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">{t.agreements.invoicesAgainst}</h2>
        </div>
        {agreement.invoices.length === 0 ? (
          <EmptyState title={t.agreements.noInvoices} />
        ) : (
          <table className="table table-hover">
            <thead>
              <tr>
                <th>{t.invoices.invoice}</th>
                <th>{t.common.issued}</th>
                <th>{t.common.status}</th>
                <th className="num text-end">{t.common.net}</th>
                <th className="num text-end">{t.common.total}</th>
              </tr>
            </thead>
            <tbody>
              {agreement.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link href={`/invoices/${invoice.id}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="tabular">{formatDate(invoice.issueDate)}</td>
                  <td>
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="num text-end">
                    <Money minor={invoice.subtotalMinor} currency={currency} />
                  </td>
                  <td className="num text-end font-medium">
                    <Money minor={invoice.totalMinor} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
