import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Money, StatusBadge } from "@/components/ui";
import { InvoiceActions } from "@/components/InvoiceActions";
import { getInvoice } from "@/server/services/invoice";
import { formatDate } from "@/lib/dates";
import { formatQty, lineTotalMinor } from "@/lib/money";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const currency = invoice.currency;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <Link href="/invoices" className="hover:text-slate-700 hover:underline">
              Invoices
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
              against
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
          <Alert tone="warning" title="Draft invoice">
            This invoice has no number yet and has not gone to the client. Issuing it assigns the number and locks its
            totals.
          </Alert>
        </div>
      )}

      {/* The document itself — what prints. */}
      <article className="card print-plain p-8">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900">Procurement Hub</p>
            <p className="mt-1 text-sm text-slate-500">
              Project {invoice.project.code} · {invoice.project.name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">Invoice</p>
            <p className="mt-1 text-sm text-slate-600 tabular">{invoice.invoiceNumber}</p>
          </div>
        </header>

        <div className="mb-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
            <p className="font-medium text-slate-900">{invoice.client.name}</p>
            {invoice.client.contactName && <p className="text-sm text-slate-600">{invoice.client.contactName}</p>}
            {invoice.client.address && <p className="whitespace-pre-line text-sm text-slate-600">{invoice.client.address}</p>}
            {invoice.client.taxId && <p className="mt-1 text-sm text-slate-500 tabular">Tax ID {invoice.client.taxId}</p>}
          </div>
          <dl className="space-y-1.5 text-sm sm:text-right">
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-slate-500">Invoice date</dt>
              <dd className="font-medium text-slate-900 tabular">{formatDate(invoice.issueDate)}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-slate-500">Due date</dt>
              <dd className="font-medium text-slate-900 tabular">{formatDate(invoice.dueDate)}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-slate-500">Your reference</dt>
              <dd className="font-medium text-slate-900 tabular">{invoice.clientAgreement.reference}</dd>
            </div>
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Description</th>
                <th className="num text-right">Qty</th>
                <th className="num text-right">Unit price</th>
                <th className="num text-right">Tax</th>
                <th className="num text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="text-xs text-slate-400">{line.lineNo}</td>
                  <td className="text-slate-900">{line.description}</td>
                  <td className="num text-right tabular">
                    {formatQty(line.quantity)} {line.uom}
                  </td>
                  <td className="num text-right">
                    <Money minor={line.unitPriceMinor} currency={currency} />
                  </td>
                  <td className="num text-right tabular text-slate-500">{line.taxRatePct}%</td>
                  <td className="num text-right font-medium">
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
              <dt className="text-slate-600">Net</dt>
              <dd className="tabular">
                <Money minor={invoice.subtotalMinor} currency={currency} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Tax</dt>
              <dd className="tabular">
                <Money minor={invoice.taxTotalMinor} currency={currency} />
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <dt>Total due</dt>
              <dd className="tabular">
                <Money minor={invoice.totalMinor} currency={currency} />
              </dd>
            </div>
            {invoice.paidMinor > 0 && (
              <>
                <div className="flex justify-between text-emerald-700">
                  <dt>Paid</dt>
                  <dd className="tabular">
                    <Money minor={invoice.paidMinor} currency={currency} />
                  </dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                  <dt>Balance</dt>
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
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
            <p className="whitespace-pre-line text-sm text-slate-600">{invoice.notes}</p>
          </div>
        )}
      </article>

      {invoice.payments.length > 0 && (
        <section className="no-print card mt-6 overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Payments</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="num text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="tabular">{formatDate(payment.paidDate)}</td>
                  <td>{payment.method ?? "—"}</td>
                  <td className="tabular">{payment.reference ?? "—"}</td>
                  <td className="num text-right font-medium">
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
