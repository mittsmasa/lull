import { Noto_Serif_JP, Shippori_Mincho } from "next/font/google";

export const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--font-noto-serif-jp",
});

export const shipporiMincho = Shippori_Mincho({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-shippori-mincho",
});
