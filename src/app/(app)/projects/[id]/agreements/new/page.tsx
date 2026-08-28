import { notFound } from "next/navigation";
import { AddAgreementForm, type ParentOption } from "@/components/AddAgreementForm";
import { getProject } from "@/server/services/project";
import { getFrameworkUsage, loadProjectAgreements } from "@/server/services/budget";
import { toDateInput } from "@/lib/dates";
import { getT } from "@/server/locale";

export default async function NewAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const agreements = await loadProjectAgreements(id);
  const live = agreements.filter((agreement) => agreement.status !== "CANCELLED");

  // Frameworks a call-off can draw on, each showing what is left of its ceiling.
  const frameworks: ParentOption[] = await Promise.all(
    live
      .filter((agreement) => agreement.type === "FRAMEWORK")
      .map(async (framework) => ({
        id: framework.id,
        reference: framework.reference,
        type: framework.type,
        remainingMinor: (await getFrameworkUsage(framework.id)).remainingMinor,
      })),
  );

  const amendable: ParentOption[] = live
    .filter((agreement) => agreement.type === "CONTRACT" || agreement.type === "FRAMEWORK")
    .map((agreement) => ({ id: agreement.id, reference: agreement.reference, type: agreement.type }));
  const t = await getT();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">{t.agreements.addTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t.agreements.addSubtitle}
        </p>
      </div>

      <AddAgreementForm
        projectId={id}
        currency={project.currency}
        frameworks={frameworks}
        amendable={amendable}
        today={toDateInput(new Date())}
      />
    </div>
  );
}
