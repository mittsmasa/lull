import { Suspense } from "react";
import { AppHeader } from "@/app/_components/app-header";
import { HeaderConfigProvider } from "@/app/_components/header-config";
import { NavEvents, NavEventsSkeleton } from "@/app/_components/nav-events";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderConfigProvider>
      <AppHeader
        eventsSlot={
          <Suspense fallback={<NavEventsSkeleton />}>
            <NavEvents />
          </Suspense>
        }
      />
      <main>{children}</main>
    </HeaderConfigProvider>
  );
}
