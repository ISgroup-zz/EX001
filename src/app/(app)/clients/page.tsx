import { PartyManager } from "@/components/PartyManager";
import { PageHeader } from "@/components/ui";
import { listClients } from "@/server/services/masterData";
import { getT } from "@/server/locale";

export default async function ClientsPage() {
  const clients = await listClients();
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t.parties.clientsTitle}
        subtitle={t.parties.clientsSubtitle}
      />
      <PartyManager kind="client" parties={clients} />
    </>
  );
}
