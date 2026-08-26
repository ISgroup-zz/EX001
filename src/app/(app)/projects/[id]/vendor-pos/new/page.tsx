import Link from "next/link";
import { notFound } from "next/navigation";
import { VendorPoForm } from "@/components/VendorPoForm";
import { Alert } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { getOrderableAgreementLines } from "@/server/services/vendorPo";
import { prisma } from "@/server/db";
import { toDateInput } from "@/lib/dates";

export const metadata = { title: "New vendor PO · Procurement Hub" };

export default async function NewVendorPoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [vendors, orderable, agreements] = await Promise.all([
    prisma.vendor.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getOrderableAgreementLines(id),
    prisma.clientAgreement.findMany({
      where: { projectId: id, status: { notIn: ["CANCELLED", "DRAFT"] } },
      select: { id: true, reference: true, type: true },
      orderBy: { issueDate: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">New vendor purchase order</h2>
        <p className="mt-1 text-sm text-slate-500">
          Order from a vendor against this project, and record when the vendor has promised to deliver.
        </p>
      </div>

      {vendors.length === 0 ? (
        <Alert tone="warning" title="No vendors yet">
          Add a vendor first.{" "}
          <Link href="/vendors" className="link">
            Go to vendors
          </Link>
        </Alert>
      ) : (
        <VendorPoForm
          projectId={id}
          currency={project.currency}
          vendors={vendors}
          orderable={orderable}
          agreements={agreements}
          today={toDateInput(new Date())}
        />
      )}
    </div>
  );
}
