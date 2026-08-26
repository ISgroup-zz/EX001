import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceForm } from "@/components/InvoiceForm";
import { Alert } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { getBillableLines } from "@/server/services/invoice";
import { prisma } from "@/server/db";
import { addDays, toDateInput } from "@/lib/dates";

export const metadata = { title: "New invoice · Procurement Hub" };

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ agreementId?: string }>;
}) {
  const [{ id }, { agreementId }] = await Promise.all([params, searchParams]);
  const project = await getProject(id);
  if (!project) notFound();

  // Frameworks are billed through their call-offs, not directly.
  const agreements = await prisma.clientAgreement.findMany({
    where: { projectId: id, status: { notIn: ["CANCELLED", "DRAFT"] }, type: { not: "FRAMEWORK" } },
    select: { id: true, reference: true, type: true },
    orderBy: { issueDate: "asc" },
  });

  if (agreements.length === 0) {
    return (
      <Alert tone="warning" title="Nothing to invoice against">
        This project has no purchase order, contract or variation to bill against.{" "}
        <Link href={`/projects/${id}/agreements/new`} className="link">
          Record a client document
        </Link>
      </Alert>
    );
  }

  const selectedId = agreementId && agreements.some((a) => a.id === agreementId) ? agreementId : agreements[0].id;
  const billable = await getBillableLines(selectedId);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">New invoice</h2>
        <p className="mt-1 text-sm text-slate-500">
          Billing {project.client.name} for goods that have actually been received.
        </p>
      </div>

      <InvoiceForm
        projectId={id}
        currency={project.currency}
        agreements={agreements}
        selectedAgreementId={selectedId}
        billable={billable}
        today={toDateInput(new Date())}
        dueDate={toDateInput(addDays(new Date(), project.client.paymentTermsDays))}
      />
    </div>
  );
}
