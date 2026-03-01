import { AppHeader } from "@/app/_components/app-header";
import { HeaderConfigProvider } from "@/app/_components/header-config";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderConfigProvider>
      <AppHeader />
      <main>{children}</main>
    </HeaderConfigProvider>
  );
}
