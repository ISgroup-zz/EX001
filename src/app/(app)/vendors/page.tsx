import { PartyManager } from "@/components/PartyManager";
import { PageHeader } from "@/components/ui";
import { listVendors } from "@/server/services/masterData";

export const metadata = { title: "Vendors · Procurement Hub" };

export default async function VendorsPage() {
  const vendors = await listVendors();

  return (
    <>
      <PageHeader title="Vendors" subtitle="The suppliers we raise purchase orders with and receive goods from." />
      <PartyManager kind="vendor" parties={vendors} />
    </>
  );
}
