import { PartyManager } from "@/components/PartyManager";
import { PageHeader } from "@/components/ui";
import { listVendors } from "@/server/services/masterData";
import { getT } from "@/server/locale";

export default async function VendorsPage() {
  const vendors = await listVendors();
  const t = await getT();

  return (
    <>
      <PageHeader title={t.parties.vendorsTitle} subtitle={t.parties.vendorsSubtitle} />
      <PartyManager kind="vendor" parties={vendors} />
    </>
  );
}
