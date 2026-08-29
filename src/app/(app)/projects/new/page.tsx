import Link from "next/link";
import { OpenProjectForm } from "@/components/OpenProjectForm";
import { PageHeader, Alert } from "@/components/ui";
import { prisma } from "@/server/db";
import { toDateInput } from "@/lib/dates";
import { getT } from "@/server/locale";

export default async function NewProjectPage() {
  const [clients, managers] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "PROJECT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t.projects.openAProject}
        subtitle={t.projects.openSubtitle}
        breadcrumb={[{ label: t.projects.title, href: "/projects" }, { label: t.projects.openAProject }]}
      />

      {clients.length === 0 ? (
        <Alert tone="warning" title={t.projects.noClients}>
          {t.projects.noClientsHint}{" "}
          <Link href="/clients" className="link">
            {t.projects.goToClients}
          </Link>
        </Alert>
      ) : (
        <OpenProjectForm clients={clients} managers={managers} today={toDateInput(new Date())} />
      )}
    </>
  );
}
