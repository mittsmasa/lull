"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

type QrCodeProps = {
  path: string;
  eventName?: string;
  eventDatetime?: string;
  caption?: string;
};

export function QrCode({
  path,
  eventName,
  eventDatetime,
  caption,
}: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}${path}`;
    QRCode.toDataURL(url, { width: 240, margin: 2 })
      .then(setDataUrl)
      .catch((error) => {
        console.error("Failed to generate QR code:", error);
        setDataUrl(null);
      });
  }, [path]);

  return (
    <div className="flex flex-col items-center gap-5 rounded-sm border border-border/50 bg-background px-6 py-8">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Admission Pass
      </p>
      {dataUrl ? (
        // biome-ignore lint/performance/noImgElement: data URL のため next/image 不要
        <img
          src={dataUrl}
          alt={`${eventName ?? "イベント"} のチェックイン用 QR コード`}
          width={240}
          height={240}
          className="size-60"
        />
      ) : (
        <div className="size-60 animate-pulse rounded-sm bg-muted/40" />
      )}
      {(eventName || eventDatetime) && (
        <div className="flex flex-col items-center gap-1">
          {eventName && (
            <p className="font-serif text-base leading-tight">{eventName}</p>
          )}
          {eventDatetime && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {eventDatetime}
            </p>
          )}
        </div>
      )}
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}
