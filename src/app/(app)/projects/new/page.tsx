import Link from "next/link";
import { OpenProjectForm } from "@/components/OpenProjectForm";
import { PageHeader, Alert } from "@/components/ui";
import { prisma } from "@/server/db";
import { toDateInput } from "@/lib/dates";

export const metadata = { title: "Open a project · Procurement Hub" };

export default async function NewProjectPage() {
  const [clients, managers] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "PROJECT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Open a project"
        subtitle="A project is opened on the document the client sent — a purchase order, a contract or a framework agreement. That document sets the opening budget."
        breadcrumb={[{ label: "Projects", href: "/projects" }, { label: "Open a project" }]}
      />

      {clients.length === 0 ? (
        <Alert tone="warning" title="No clients yet">
          Add the client first, then come back and open the project against their document.{" "}
          <Link href="/clients" className="link">
            Go to clients
          </Link>
        </Alert>
      ) : (
        <OpenProjectForm clients={clients} managers={managers} today={toDateInput(new Date())} />
      )}
    </>
  );
}
