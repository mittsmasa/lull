import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppSplash } from "@/app/_components/app-splash";
import { SerwistProvider } from "@/components/register-sw";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { notoSerifJP, shipporiMincho } from "@/lib/fonts";

export const metadata: Metadata = {
  applicationName: "Lull",
  title: {
    default: "Lull",
    template: "%s - Lull",
  },
  description: "発表会・リサイタルの招待・座席・当日体験を一つに繋ぐアプリ",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lull",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F0E8" },
    { media: "(prefers-color-scheme: dark)", color: "#211d18" },
  ],
  interactiveWidget: "resizes-content",
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
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SerwistProvider swUrl="/sw.js">
            {children}
            <Toaster />
            <AppSplash />
          </SerwistProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
