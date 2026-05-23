import { Hono } from "hono";
import { z } from "zod";

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

const querySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

type NominatimItem = {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: Record<string, string>;
};

export type PlaceSuggestion = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

const formatAddress = (item: NominatimItem): string => {
  const addr = item.address ?? {};
  const parts = [
    addr.postcode ? `〒${addr.postcode}` : null,
    addr.state ?? addr.province ?? null,
    addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null,
    addr.suburb ?? addr.neighbourhood ?? null,
    addr.road ?? null,
    addr.house_number ?? null,
  ].filter((v): v is string => Boolean(v));
  if (parts.length > 0) return parts.join(" ");
  // address が無いか分解できない場合は display_name の末尾を落として返す
  return item.display_name.replace(/, \d+,?\s*[^,]*$/, "");
};

const extractName = (item: NominatimItem): string => {
  if (item.name?.trim()) return item.name.trim();
  const first = item.display_name.split(",")[0]?.trim();
  return first ?? item.display_name;
};

const app = new Hono().get("/search", async (c) => {
  const parsed = querySchema.safeParse({
    q: c.req.query("q") ?? "",
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid query" }, 400);
  }
  const { q, limit = 5 } = parsed.data;

  const baseUrl =
    process.env.APP_PUBLIC_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";
  const userAgent = `Lull/0.1 (${baseUrl})`;

  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "ja");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Referer: baseUrl,
      },
    });
  } catch {
    return c.json({ error: "upstream unreachable" }, 502);
  }

  if (!res.ok) {
    return c.json({ error: "upstream error", status: res.status }, 502);
  }

  const items = (await res.json()) as NominatimItem[];
  const suggestions: PlaceSuggestion[] = items.map((item) => ({
    name: extractName(item),
    address: formatAddress(item),
    latitude: Number(item.lat),
    longitude: Number(item.lon),
  }));

  return c.json(suggestions);
});

export { app as placesRoute };
