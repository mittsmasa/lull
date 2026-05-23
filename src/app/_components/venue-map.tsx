import { ArrowUpRight, MapPin } from "@phosphor-icons/react/dist/ssr";

type Props = {
  venue: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  height?: number;
  className?: string;
};

export function VenueMap({
  venue,
  address,
  latitude,
  longitude,
  height = 240,
  className,
}: Props) {
  const delta = 0.005;
  const minLng = longitude - delta;
  const minLat = latitude - delta;
  const maxLng = longitude + delta;
  const maxLat = latitude + delta;
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
  const openUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;

  return (
    <figure
      className={`overflow-hidden rounded-sm border border-border/60 bg-card ${className ?? ""}`}
    >
      <figcaption className="flex items-start gap-3 px-5 py-4">
        <MapPin
          className="mt-1 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <span className="font-light font-serif text-base text-foreground leading-tight">
            {venue}
          </span>
          {address && (
            <span className="text-muted-foreground text-xs leading-relaxed tracking-wider">
              {address}
            </span>
          )}
        </div>
      </figcaption>

      <div className="border-border/60 border-t bg-muted/30">
        <iframe
          title={`${venue} の地図`}
          src={embedSrc}
          width="100%"
          height={height}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="block w-full"
        />
      </div>

      <div className="flex items-center justify-between border-border/60 border-t px-5 py-3">
        <span className="text-[10px] text-muted-foreground tracking-[0.18em] uppercase">
          © OpenStreetMap contributors
        </span>
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground text-xs tracking-wider transition-colors hover:text-foreground"
        >
          地図で開く
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
      </div>
    </figure>
  );
}
