import { UserManager } from "@/components/UserManager";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser, hasRole } from "@/server/auth";
import { listUsers } from "@/server/services/masterData";
import { getT } from "@/server/locale";

export default async function UsersPage() {
  const currentUser = await requireUser();
  const t = await getT();

  if (!hasRole(currentUser, "ADMIN")) {
    return (
      <>
        <PageHeader title={t.users.title} />
        <Alert tone="warning" title={t.users.adminsOnly}>
          {t.users.adminsOnlyHint}
        </Alert>
      </>
    );
  }

  const users = await listUsers();

  return (
    <>
      <PageHeader title={t.users.title} subtitle={t.users.subtitle} />
      <UserManager users={users} />
    </>
  );
}
