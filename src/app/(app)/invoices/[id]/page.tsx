import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Money, StatusBadge } from "@/components/ui";
import { InvoiceActions } from "@/components/InvoiceActions";
import { getInvoice } from "@/server/services/invoice";
import { formatDate } from "@/lib/dates";
import { formatQty, lineTotalMinor } from "@/lib/money";
import { getT } from "@/server/locale";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const currency = invoice.currency;
  const t = await getT();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <Link href="/invoices" className="hover:text-slate-700 hover:underline">
              {t.invoices.title}
            </Link>
            <span className="text-slate-300">/</span>
            <Link href={`/projects/${invoice.project.id}`} className="hover:text-slate-700 hover:underline">
              {invoice.project.code}
            </Link>
            <span className="text-slate-300">/</span>
            <span>{invoice.invoiceNumber}</span>
          </nav>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 tabular">{invoice.invoiceNumber}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <StatusBadge status={invoice.status} />
            <span>{invoice.client.name}</span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5">
              {t.invoices.againstCol}
              <Link href={`/agreements/${invoice.clientAgreement.id}`} className="link tabular">
                {invoice.clientAgreement.reference}
              </Link>
            </span>
          </div>
        </div>

        <InvoiceActions invoiceId={invoice.id} status={invoice.status} balanceMinor={invoice.balanceMinor} />
      </div>

      {invoice.status === "DRAFT" && (
        <div className="no-print mb-6">
          <Alert tone="warning" title={t.invoices.draftInvoice}>
            {t.invoices.draftInvoiceHint}
          </Alert>
        </div>
      )}

      {/* The document itself — what prints. */}
      <article className="card print-plain p-8">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900">{t.app.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t.common.project} {invoice.project.code} · {invoice.project.name}
            </p>
          </div>
          <div className="text-end">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{t.invoices.invoice}</p>
            <p className="mt-1 text-sm text-slate-600 tabular">{invoice.invoiceNumber}</p>
          </div>
        </header>

        <div className="mb-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.invoices.billTo}</p>
            <p className="font-medium text-slate-900">{invoice.client.name}</p>
            {invoice.client.contactName && <p className="text-sm text-slate-600">{invoice.client.contactName}</p>}
            {invoice.client.address && <p className="whitespace-pre-line text-sm text-slate-600">{invoice.client.address}</p>}
            {invoice.client.taxId && <p className="mt-1 text-sm text-slate-500 tabular">{t.invoices.taxId} {invoice.client.taxId}</p>}
          </div>
          <dl className="space-y-1.5 text-sm sm:text-end">
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-slate-500">{t.invoices.invoiceDate}</dt>
              <dd className="font-medium text-slate-900 tabular">{formatDate(invoice.issueDate)}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-slate-500">{t.invoices.dueDate}</dt>
              <dd className="font-medium text-slate-900 tabular">{formatDate(invoice.dueDate)}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-slate-500">{t.invoices.yourReference}</dt>
              <dd className="font-medium text-slate-900 tabular">{invoice.clientAgreement.reference}</dd>
            </div>
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>{t.common.description}</th>
                <th className="num text-end">{t.common.quantity}</th>
                <th className="num text-end">{t.common.unitPrice}</th>
                <th className="num text-end">{t.common.tax}</th>
                <th className="num text-end">{t.invoices.amount}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="text-xs text-slate-400">{line.lineNo}</td>
                  <td className="text-slate-900">{line.description}</td>
                  <td className="num text-end tabular">
                    {formatQty(line.quantity)} {line.uom}
                  </td>
                  <td className="num text-end">
                    <Money minor={line.unitPriceMinor} currency={currency} />
                  </td>
                  <td className="num text-end tabular text-slate-500">{line.taxRatePct}%</td>
                  <td className="num text-end font-medium">
                    <Money minor={lineTotalMinor(line.quantity, line.unitPriceMinor)} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">{t.common.net}</dt>
              <dd className="tabular">
                <Money minor={invoice.subtotalMinor} currency={currency} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">{t.common.tax}</dt>
              <dd className="tabular">
                <Money minor={invoice.taxTotalMinor} currency={currency} />
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <dt>{t.invoices.totalDue}</dt>
              <dd className="tabular">
                <Money minor={invoice.totalMinor} currency={currency} />
              </dd>
            </div>
            {invoice.paidMinor > 0 && (
              <>
                <div className="flex justify-between text-emerald-700">
                  <dt>{t.invoices.paid}</dt>
                  <dd className="tabular">
                    <Money minor={invoice.paidMinor} currency={currency} />
                  </dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                  <dt>{t.invoices.balance}</dt>
                  <dd className="tabular">
                    <Money minor={invoice.balanceMinor} currency={currency} />
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {invoice.notes && (
          <div className="mt-8 border-t border-slate-200 pt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.common.notes}</p>
            <p className="whitespace-pre-line text-sm text-slate-600">{invoice.notes}</p>
          </div>
        )}
      </article>

      {invoice.payments.length > 0 && (
        <section className="no-print card mt-6 overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">{t.invoices.payments}</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.date}</th>
                <th>{t.invoices.method}</th>
                <th>{t.common.reference}</th>
                <th className="num text-end">{t.invoices.amount}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="tabular">{formatDate(payment.paidDate)}</td>
                  <td>{payment.method ?? "—"}</td>
                  <td className="tabular">{payment.reference ?? "—"}</td>
                  <td className="num text-end font-medium">
                    <Money minor={payment.amountMinor} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
