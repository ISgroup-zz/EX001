import { notFound } from "next/navigation";
import { GrnForm } from "@/components/GrnForm";
import { PageHeader } from "@/components/ui";
import { startGrnDraft } from "@/server/services/grn";

export const metadata = { title: "Receive goods · Procurement Hub" };

export default async function NewGrnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ planItemId?: string }>;
}) {
  const [{ id }, { planItemId }] = await Promise.all([params, searchParams]);

  let draft;
  try {
    draft = await startGrnDraft(id, planItemId ?? null);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Receive goods"
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          { label: draft.projectName, href: `/projects/${draft.projectId}` },
          { label: draft.poNumber, href: `/vendor-pos/${id}` },
          { label: "Receive" },
        ]}
        subtitle={`${draft.vendorName} · ${draft.poNumber}`}
      />

      <GrnForm draft={draft} />
    </div>
  );
}
