"use client";

import { MagnifyingGlass, MapPin, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/lib/rpc";
import { VenueMap } from "./venue-map";

type Suggestion = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  defaultVenue?: string;
  defaultAddress?: string | null;
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
  venueError?: string;
};

export function VenueField({
  defaultVenue = "",
  defaultAddress = null,
  defaultLatitude = null,
  defaultLongitude = null,
  venueError,
}: Props) {
  const [venue, setVenue] = useState(defaultVenue);
  const [address, setAddress] = useState<string | null>(defaultAddress);
  const [latitude, setLatitude] = useState<number | null>(defaultLatitude);
  const [longitude, setLongitude] = useState<number | null>(defaultLongitude);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hasError, setHasError] = useState(false);

  const venueId = useId();
  const addressId = useId();
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCoordinates = latitude !== null && longitude !== null;
  const showSuggestions =
    isFocused && suggestions.length > 0 && !hasCoordinates;

  useEffect(() => {
    const trimmed = venue.trim();
    if (trimmed.length < 2 || hasCoordinates) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setHasError(false);

    const timer = setTimeout(async () => {
      try {
        const res = await client.api.places.search.$get({
          query: { q: trimmed, limit: "5" },
        });
        if (!res.ok) {
          if (!cancelled) {
            setHasError(true);
            setSuggestions([]);
          }
          return;
        }
        const data = (await res.json()) as Suggestion[];
        if (!cancelled) setSuggestions(data);
      } catch {
        if (!cancelled) {
          setHasError(true);
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [venue, hasCoordinates]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const handleSelect = (s: Suggestion) => {
    setVenue(s.name);
    setAddress(s.address);
    setLatitude(s.latitude);
    setLongitude(s.longitude);
    setSuggestions([]);
    setIsFocused(false);
  };

  const handleClearLocation = () => {
    setAddress(null);
    setLatitude(null);
    setLongitude(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={venueId}>会場</Label>
        <div className="relative">
          <Input
            type="text"
            id={venueId}
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              // クリック判定のため少し遅延
              blurTimerRef.current = setTimeout(() => setIsFocused(false), 150);
            }}
            required
            maxLength={200}
            placeholder="例: 東京文化会館"
            aria-invalid={venueError ? true : undefined}
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            className="pr-9"
          />
          <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground/60">
            {isSearching ? (
              <span className="block size-3 animate-spin rounded-full border border-current border-t-transparent" />
            ) : (
              <MagnifyingGlass className="size-4" aria-hidden />
            )}
          </span>

          {showSuggestions && (
            <ul className="absolute z-20 mt-1 flex w-full flex-col divide-y divide-border/40 overflow-hidden rounded-sm border border-border/60 bg-popover shadow-sm">
              {suggestions.map((s, i) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: ordering by API rank is stable per query
                  key={`${s.latitude}-${s.longitude}-${i}`}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // input の blur より先に発火させる
                      e.preventDefault();
                      handleSelect(s);
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                  >
                    <MapPin
                      className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-light font-serif text-foreground text-sm">
                        {s.name}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground tracking-wider">
                        {s.address}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {venueError && <p className="text-destructive text-xs">{venueError}</p>}
        {hasError && !venueError && (
          <p className="text-muted-foreground text-xs">
            場所の検索に失敗しました。会場名は手入力で保存できます。
          </p>
        )}
        {!hasCoordinates && !venueError && (
          <p className="text-[11px] text-muted-foreground/80 tracking-wider">
            会場名を入力するとサジェストが出ます。地図に載っていない場所はそのまま入力してください。
          </p>
        )}
      </div>

      {hasCoordinates && latitude !== null && longitude !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={addressId}>住所</Label>
            <Input
              type="text"
              id={addressId}
              value={address ?? ""}
              onChange={(e) => setAddress(e.target.value || null)}
              maxLength={300}
              placeholder="任意。サジェストから取得した住所が入ります"
            />
          </div>

          <VenueMap
            venue={venue || "会場"}
            address={address}
            latitude={latitude}
            longitude={longitude}
            height={200}
          />

          <button
            type="button"
            onClick={handleClearLocation}
            className="inline-flex items-center gap-1 self-start text-muted-foreground text-xs tracking-wider transition-colors hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
            地図と住所をクリア
          </button>
        </div>
      )}

      {/* hidden inputs for form submission */}
      <input type="hidden" name="venue" value={venue} />
      <input type="hidden" name="address" value={address ?? ""} />
      <input
        type="hidden"
        name="latitude"
        value={latitude !== null ? String(latitude) : ""}
      />
      <input
        type="hidden"
        name="longitude"
        value={longitude !== null ? String(longitude) : ""}
      />
    </div>
  );
}
