import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/server/auth";
import { getUpcomingDeliveries } from "@/server/services/forecast";

/** Everything inside this group needs a signed-in user. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const upcoming = await getUpcomingDeliveries({ withinDays: 7 });
  const alerts = upcoming.filter((item) => item.isOverdue || item.daysAway <= 7).length;

  return (
    <AppShell user={user} deliveryAlerts={alerts}>
      {children}
    </AppShell>
  );
}
