import { PartyManager } from "@/components/PartyManager";
import { PageHeader } from "@/components/ui";
import { listClients } from "@/server/services/masterData";

export const metadata = { title: "Clients · Procurement Hub" };

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="The organisations that send us purchase orders, contracts and frameworks."
      />
      <PartyManager kind="client" parties={clients} />
    </>
  );
}
