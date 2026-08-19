import { ArrowUpRight, MapPin } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

type Props = {
  venue: string;
  address?: string | null;
  className?: string;
  /**
   * button: 枠付きの独立ボタン（招待状などの単独 CTA 向け）
   * inline: テキストリンク（会場情報の直下に添える用途向け）
   */
  variant?: "button" | "inline";
};

/**
 * Google マップを新タブで開く導線。
 * lull 側で地図 iframe を持たない代わりに、ユーザーが慣れた地図アプリへ
 * 渡すだけのリンクを提供する。
 */
export function VenueLink({
  venue,
  address,
  className,
  variant = "button",
}: Props) {
  const query = address ? `${venue} ${address}` : venue;
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 self-start tracking-wider transition-colors",
        variant === "button" &&
          "rounded-sm border border-border/60 bg-card px-4 py-2.5 text-sm hover:border-foreground/40 hover:bg-muted/40",
        variant === "inline" &&
          "gap-1.5 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline",
        className,
      )}
    >
      {variant === "button" && (
        <MapPin className="size-4 text-muted-foreground" aria-hidden />
      )}
      <span>Google マップで開く</span>
      <ArrowUpRight className="size-3 text-muted-foreground" aria-hidden />
    </a>
  );
}
