import { AppHeader } from "@/app/_components/app-header";
import { HeaderConfigProvider } from "@/app/_components/header-config";
import type { NavigationEvent } from "@/app/_components/navigation-sheet";
import { getEventsByUserId } from "@/lib/queries/events";
import { getSession } from "@/lib/session";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const events: NavigationEvent[] = session
    ? (await getEventsByUserId(session.user.id)).map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
      }))
    : [];

  return (
    <HeaderConfigProvider>
      <AppHeader events={events} />
      <main>{children}</main>
    </HeaderConfigProvider>
  );
}
