"use client";

import { Info, MagnifyingGlass, MapPin, X } from "@phosphor-icons/react";
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
  addressError?: string;
  latitudeError?: string;
  longitudeError?: string;
  /**
   * "update" のときは初期値から変更があったフィールドだけ hidden input に
   * name を付ける。変更されていないフィールドは form に乗らないので、
   * Server Action 側で他者が並行更新した値を上書きしない。
   */
  mode?: "create" | "update";
};

export function VenueField({
  defaultVenue = "",
  defaultAddress = null,
  defaultLatitude = null,
  defaultLongitude = null,
  venueError,
  addressError,
  latitudeError,
  longitudeError,
  mode = "create",
}: Props) {
  const [venue, setVenue] = useState(defaultVenue);
  const [address, setAddress] = useState<string | null>(defaultAddress);
  const [latitude, setLatitude] = useState<number | null>(defaultLatitude);
  const [longitude, setLongitude] = useState<number | null>(defaultLongitude);

  // サジェストから選んだ会場名を保持。venue と一致しているときだけ
  // 「地図と整合した状態」とみなす。
  const [selectedName, setSelectedName] = useState<string | null>(
    defaultLatitude !== null && defaultLongitude !== null ? defaultVenue : null,
  );

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hasError, setHasError] = useState(false);

  const venueId = useId();
  const addressId = useId();
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCoordinates = latitude !== null && longitude !== null;
  const isMapMatchingVenue = hasCoordinates && venue === selectedName;
  const showSuggestions =
    isFocused && suggestions.length > 0 && !isMapMatchingVenue;

  // 初期値スナップショット — update モードでの dirty 判定に使う
  const initial = useRef({
    venue: defaultVenue,
    address: defaultAddress,
    latitude: defaultLatitude,
    longitude: defaultLongitude,
  });
  const shouldSend = (changed: boolean) => mode !== "update" || changed;

  const clearBlurTimer = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  useEffect(() => {
    const trimmed = venue.trim();
    // 地図と venue が一致しているときだけ検索をスキップ。
    // ユーザーが会場名を編集して selectedName と乖離したら再検索が走る。
    if (trimmed.length < 2 || isMapMatchingVenue) {
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
        // 上流が NaN を返したアイテムは除外（lat/lon が壊れたケース）
        const safe = data.filter(
          (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude),
        );
        if (!cancelled) setSuggestions(safe);
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
  }, [venue, isMapMatchingVenue]);

  useEffect(() => {
    // unmount 時のタイマー解放
    return () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
    };
  }, []);

  const handleSelect = (s: Suggestion) => {
    setVenue(s.name);
    setAddress(s.address);
    setLatitude(s.latitude);
    setLongitude(s.longitude);
    setSelectedName(s.name);
    setSuggestions([]);
    setIsFocused(false);
    clearBlurTimer();
  };

  const handleClearLocation = () => {
    setAddress(null);
    setLatitude(null);
    setLongitude(null);
    setSelectedName(null);
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
            onFocus={() => {
              clearBlurTimer();
              setIsFocused(true);
            }}
            onBlur={() => {
              clearBlurTimer();
              blurTimerRef.current = setTimeout(() => {
                setIsFocused(false);
                blurTimerRef.current = null;
              }, 150);
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
          {!isMapMatchingVenue && (
            <p className="flex items-start gap-2 rounded-sm border border-amber-500/40 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-900 tracking-wider dark:bg-amber-950/30 dark:text-amber-200">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              会場名を変更しました。地図と一致しない場合は、サジェストから選び直すか「クリア」してください。
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={addressId}>住所</Label>
            <Input
              type="text"
              id={addressId}
              value={address ?? ""}
              onChange={(e) => setAddress(e.target.value || null)}
              maxLength={300}
              placeholder="任意。サジェストから取得した住所が入ります"
              aria-invalid={addressError ? true : undefined}
            />
            {addressError && (
              <p className="text-destructive text-xs">{addressError}</p>
            )}
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

      {(latitudeError || longitudeError) && (
        <p className="text-destructive text-xs">
          {latitudeError ?? longitudeError}
        </p>
      )}

      {/*
        hidden inputs for form submission.
        update モードでは初期値から変更があったフィールドのみ name を付与する。
        name 無しの hidden input は formData に乗らないので、Server Action 側で
        formData.has(...) が false → updateData にセットされず、他者の並行更新を
        上書きしない。
      */}
      <input
        type="hidden"
        {...(shouldSend(venue !== initial.current.venue)
          ? { name: "venue" }
          : {})}
        value={venue}
      />
      <input
        type="hidden"
        {...(shouldSend(address !== initial.current.address)
          ? { name: "address" }
          : {})}
        value={address ?? ""}
      />
      <input
        type="hidden"
        {...(shouldSend(latitude !== initial.current.latitude)
          ? { name: "latitude" }
          : {})}
        value={latitude !== null ? String(latitude) : ""}
      />
      <input
        type="hidden"
        {...(shouldSend(longitude !== initial.current.longitude)
          ? { name: "longitude" }
          : {})}
        value={longitude !== null ? String(longitude) : ""}
      />
    </div>
  );
}
