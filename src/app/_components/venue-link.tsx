import { ArrowUpRight, MapPin } from "@phosphor-icons/react/dist/ssr";

type Props = {
  venue: string;
  address?: string | null;
  className?: string;
};

/**
 * Google マップを新タブで開く導線。
 * lull 側で地図 iframe を持たない代わりに、ユーザーが慣れた地図アプリへ
 * 渡すだけのリンクを提供する。
 */
export function VenueLink({ venue, address, className }: Props) {
  const query = address ? `${venue} ${address}` : venue;
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 self-start rounded-sm border border-border/60 bg-card px-4 py-2.5 text-sm tracking-wider transition-colors hover:border-foreground/40 hover:bg-muted/40 ${className ?? ""}`}
    >
      <MapPin className="size-4 text-muted-foreground" aria-hidden />
      <span>Google マップで開く</span>
      <ArrowUpRight className="size-3 text-muted-foreground" aria-hidden />
    </a>
  );
}
