import Link from "next/link";
import { notFound } from "next/navigation";
import { VendorPoForm } from "@/components/VendorPoForm";
import { Alert } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { getOrderableAgreementLines } from "@/server/services/vendorPo";
import { prisma } from "@/server/db";
import { toDateInput } from "@/lib/dates";
import { getT } from "@/server/locale";

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
  const t = await getT();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">{t.vendorPo.newTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t.vendorPo.newSubtitle}
        </p>
      </div>

      {vendors.length === 0 ? (
        <Alert tone="warning" title={t.vendorPo.noVendors}>
          {t.vendorPo.noVendorsHint}{" "}
          <Link href="/vendors" className="link">
            {t.vendorPo.goToVendors}
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
