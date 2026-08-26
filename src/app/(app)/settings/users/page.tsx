import { UserManager } from "@/components/UserManager";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser, hasRole } from "@/server/auth";
import { listUsers } from "@/server/services/masterData";

export const metadata = { title: "Users · Procurement Hub" };

export default async function UsersPage() {
  const currentUser = await requireUser();

  if (!hasRole(currentUser, "ADMIN")) {
    return (
      <>
        <PageHeader title="Users" />
        <Alert tone="warning" title="Admins only">
          Ask an administrator if you need someone added or a role changed.
        </Alert>
      </>
    );
  }

  const users = await listUsers();

  return (
    <>
      <PageHeader title="Users" subtitle="Who can sign in, and what they are allowed to do." />
      <UserManager users={users} />
    </>
  );
}
