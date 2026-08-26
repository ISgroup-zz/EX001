import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, EmptyState, KpiCard, Money, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { getAgreementDetail } from "@/server/services/agreement";
import { getBillableLines } from "@/server/services/invoice";
import { formatDate, isPast } from "@/lib/dates";
import { formatMoney, formatPercent, formatQty, lineTotalMinor } from "@/lib/money";

export default async function AgreementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agreement = await getAgreementDetail(id);
  if (!agreement) notFound();

  const currency = agreement.project.currency;
  const billable = agreement.type === "FRAMEWORK" ? [] : await getBillableLines(id);
  const billableByLine = new Map(billable.map((line) => [line.clientAgreementLineId, line]));
  const expired = agreement.validTo ? isPast(agreement.validTo) : false;

  return (
    <>
      <PageHeader
        title={agreement.reference}
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          { label: agreement.project.code, href: `/projects/${agreement.project.id}` },
          { label: "Client documents", href: `/projects/${agreement.project.id}/agreements` },
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
            <span>issued {formatDate(agreement.issueDate)}</span>
            {agreement.parentAgreement && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  {agreement.type === "VARIATION" ? "amends" : "call-off on"}
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
              Invoice against this
            </Link>
          ) : null
        }
      />

      {expired && (
        <div className="mb-5">
          <Alert tone="warning" title="This document has expired">
            Its validity ended on {formatDate(agreement.validTo)}. Record an extension or a new document before billing
            further against it.
          </Alert>
        </div>
      )}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Document value" value={formatMoney(agreement.valueMinor, currency)} />
        <KpiCard
          label="Invoiced against it"
          value={formatMoney(agreement.invoicedMinor, currency)}
          hint={formatPercent((agreement.invoicedMinor / (agreement.valueMinor || 1)) * 100, 0) + " of value"}
        />
        {agreement.frameworkUsage ? (
          <>
            <KpiCard label="Called off" value={formatMoney(agreement.frameworkUsage.calledOffMinor, currency)} />
            <KpiCard
              label="Ceiling remaining"
              value={formatMoney(agreement.frameworkUsage.remainingMinor, currency)}
              tone={agreement.frameworkUsage.remainingMinor <= 0 ? "negative" : "default"}
            />
          </>
        ) : (
          <>
            <KpiCard label="Lines" value={agreement.lines.length} />
            <KpiCard label="Invoices" value={agreement.invoices.length} />
          </>
        )}
      </section>

      {agreement.frameworkUsage && (
        <section className="card mb-6 p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="card-title">Ceiling usage</h2>
            <span className="text-sm text-slate-600 tabular">
              {formatMoney(agreement.frameworkUsage.calledOffMinor, currency)} of{" "}
              {formatMoney(agreement.frameworkUsage.ceilingMinor, currency)}
            </span>
          </div>
          <ProgressBar
            value={agreement.frameworkUsage.calledOffMinor}
            total={agreement.frameworkUsage.ceilingMinor}
            tone={agreement.frameworkUsage.usedPct >= 90 ? "red" : agreement.frameworkUsage.usedPct >= 70 ? "amber" : "brand"}
          />

          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Call-offs</h3>
          {agreement.frameworkUsage.callOffs.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing has been called off yet.</p>
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
            <h2 className="card-title">Lines</h2>
            <p className="text-xs text-slate-500">
              Delivered and invoiced columns come from goods actually received against linked vendor POs.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Description</th>
                  <th className="num text-right">Qty</th>
                  <th className="num text-right">Unit price</th>
                  <th className="num text-right">Line total</th>
                  <th className="num text-right">Delivered</th>
                  <th className="num text-right">Invoiced</th>
                  <th className="num text-right">Billable now</th>
                </tr>
              </thead>
              <tbody>
                {agreement.lines.map((line) => {
                  const stats = billableByLine.get(line.id);
                  return (
                    <tr key={line.id}>
                      <td className="text-xs text-slate-400">{line.lineNo}</td>
                      <td className="text-slate-900">{line.description}</td>
                      <td className="num text-right tabular">
                        {formatQty(line.quantity)} {line.uom}
                      </td>
                      <td className="num text-right">
                        <Money minor={line.unitPriceMinor} currency={currency} />
                      </td>
                      <td className="num text-right font-medium">
                        <Money minor={lineTotalMinor(line.quantity, line.unitPriceMinor)} currency={currency} />
                      </td>
                      <td className="num text-right tabular">{stats ? formatQty(stats.deliveredQty) : "—"}</td>
                      <td className="num text-right tabular">{stats ? formatQty(stats.invoicedQty) : "—"}</td>
                      <td className="num text-right tabular">
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
          <h2 className="card-title">Invoices raised against this document</h2>
        </div>
        {agreement.invoices.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Issued</th>
                <th>Status</th>
                <th className="num text-right">Net</th>
                <th className="num text-right">Total</th>
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
                  <td className="num text-right">
                    <Money minor={invoice.subtotalMinor} currency={currency} />
                  </td>
                  <td className="num text-right font-medium">
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
