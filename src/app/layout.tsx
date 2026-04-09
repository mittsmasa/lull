import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SerwistProvider } from "@/components/register-sw";
import { Toaster } from "@/components/ui/sonner";
import { notoSerifJP, shipporiMincho } from "@/lib/fonts";

export const metadata: Metadata = {
  applicationName: "Lull",
  title: {
    default: "Lull",
    template: "%s - Lull",
  },
  description: "ピアノ発表会の招待・座席・当日体験を一つに繋ぐアプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lull",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

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
        <SerwistProvider swUrl="/sw.js">
          {children}
          <Toaster />
        </SerwistProvider>
      </body>
    </html>
  );
}
