import "./globals.css";
import { notoSerifJP, shipporiMincho } from "@/lib/fonts";

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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
