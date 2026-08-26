import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Money, PageHeader, StatusBadge } from "@/components/ui";
import { PostGrnActions } from "@/components/PostGrnActions";
import { prisma } from "@/server/db";
import { getGrn } from "@/server/services/grn";
import { getBillableLines } from "@/server/services/invoice";
import { formatDate } from "@/lib/dates";
import { formatQty, lineTotalMinor, sumMinor } from "@/lib/money";

export default async function GrnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const grn = await getGrn(id);
  if (!grn) notFound();

  const currency = grn.vendorPo.project.currency;
  const valueMinor = sumMinor(
    grn.lines.map((line) => lineTotalMinor(line.quantityAccepted, line.vendorPoLine.unitCostMinor)),
  );

  // After posting, show what this receipt just made billable — the natural next step.
  let billableNow: { agreementId: string; reference: string; valueMinor: number } | null = null;
  if (grn.status === "POSTED" && grn.vendorPo.clientAgreementId) {
    const billable = await getBillableLines(grn.vendorPo.clientAgreementId);
    const value = sumMinor(billable.map((line) => lineTotalMinor(line.billableQty, line.unitPriceMinor)));
    if (value > 0) {
      const agreement = await prisma.clientAgreement.findUnique({
        where: { id: grn.vendorPo.clientAgreementId },
        select: { id: true, reference: true },
      });
      if (agreement) billableNow = { agreementId: agreement.id, reference: agreement.reference, valueMinor: value };
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={grn.grnNumber}
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          { label: grn.vendorPo.project.code, href: `/projects/${grn.vendorPo.project.id}` },
          { label: grn.vendorPo.poNumber, href: `/vendor-pos/${grn.vendorPo.id}` },
          { label: grn.grnNumber },
        ]}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={grn.status} />
            <span>{grn.vendorPo.vendor.name}</span>
            <span className="text-slate-300">·</span>
            <span>received {formatDate(grn.receivedDate)}</span>
            {grn.deliveryPlanItem && (
              <>
                <span className="text-slate-300">·</span>
                <span>
                  against {grn.deliveryPlanItem.label ?? `delivery ${grn.deliveryPlanItem.seq}`} (planned{" "}
                  {formatDate(grn.deliveryPlanItem.plannedDate)})
                </span>
              </>
            )}
            {grn.deliveryNoteRef && (
              <>
                <span className="text-slate-300">·</span>
                <span>DN {grn.deliveryNoteRef}</span>
              </>
            )}
          </span>
        }
        actions={<PostGrnActions grnId={grn.id} vendorPoId={grn.vendorPo.id} status={grn.status} />}
      />

      {grn.status === "DRAFT" && (
        <div className="mb-5">
          <Alert tone="warning" title="This receipt is still a draft">
            Draft receipts do not count as delivered and cannot be invoiced. Post it once the quantities are confirmed.
          </Alert>
        </div>
      )}

      {billableNow && (
        <div className="mb-5">
          <Alert tone="success" title="Ready to invoice">
            <span className="flex flex-wrap items-center gap-2">
              <span>
                <Money minor={billableNow.valueMinor} currency={currency} /> is now billable against{" "}
                {billableNow.reference}.
              </span>
              <Link
                href={`/projects/${grn.vendorPo.project.id}/invoices/new?agreementId=${billableNow.agreementId}`}
                className="btn-primary btn-sm"
              >
                Create invoice
              </Link>
            </span>
          </Alert>
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Received lines</h2>
          <span className="text-sm text-slate-600">
            Value <Money minor={valueMinor} currency={currency} />
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num text-right">Received</th>
                <th className="num text-right">Accepted</th>
                <th className="num text-right">Rejected</th>
                <th className="num text-right">Unit cost</th>
                <th className="num text-right">Value</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {grn.lines.map((line) => (
                <tr key={line.id}>
                  <td className="text-slate-900">{line.vendorPoLine.description}</td>
                  <td className="num text-right tabular">
                    {formatQty(line.quantityReceived)} {line.vendorPoLine.uom}
                  </td>
                  <td className="num text-right font-medium tabular text-emerald-700">
                    {formatQty(line.quantityAccepted)}
                  </td>
                  <td className={`num text-right tabular ${line.quantityRejected > 0 ? "text-red-700" : "text-slate-400"}`}>
                    {formatQty(line.quantityRejected)}
                  </td>
                  <td className="num text-right">
                    <Money minor={line.vendorPoLine.unitCostMinor} currency={currency} />
                  </td>
                  <td className="num text-right font-medium">
                    <Money
                      minor={lineTotalMinor(line.quantityAccepted, line.vendorPoLine.unitCostMinor)}
                      currency={currency}
                    />
                  </td>
                  <td className="text-sm text-slate-500">{line.remarks ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {grn.notes && (
        <section className="card mt-6 p-5">
          <h2 className="card-title mb-2">Notes</h2>
          <p className="whitespace-pre-line text-sm text-slate-600">{grn.notes}</p>
        </section>
      )}
    </div>
  );
}
