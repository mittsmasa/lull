import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { notoSerifJP, shipporiMincho } from "@/lib/fonts";

// Cloudflare D1 はリクエストスコープでのみ利用可能なため、全ルートを動的に設定
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ja"
      className={`${notoSerifJP.variable} ${shipporiMincho.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
