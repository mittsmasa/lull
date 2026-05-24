"use client";

import { useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  defaultVenue?: string;
  defaultAddress?: string | null;
  venueError?: string;
  addressError?: string;
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
  venueError,
  addressError,
  mode = "create",
}: Props) {
  const [venue, setVenue] = useState(defaultVenue);
  const [address, setAddress] = useState<string>(defaultAddress ?? "");

  const venueId = useId();
  const addressId = useId();

  const initial = useRef({
    venue: defaultVenue,
    address: defaultAddress ?? "",
  });
  const shouldSend = (changed: boolean) => mode !== "update" || changed;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={venueId}>会場</Label>
        <Input
          type="text"
          id={venueId}
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          required
          maxLength={200}
          placeholder="例: 東京文化会館"
          aria-invalid={venueError ? true : undefined}
        />
        {venueError && <p className="text-destructive text-xs">{venueError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={addressId}>住所（任意）</Label>
        <Input
          type="text"
          id={addressId}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={300}
          placeholder="例: 東京都台東区上野公園 5-45"
          aria-invalid={addressError ? true : undefined}
        />
        {addressError && (
          <p className="text-destructive text-xs">{addressError}</p>
        )}
      </div>

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
        value={address}
      />
    </div>
  );
}
