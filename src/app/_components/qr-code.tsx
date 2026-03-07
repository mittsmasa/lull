"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrCode({ path }: { path: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}${path}`;
    QRCode.toDataURL(url, { width: 200, margin: 2 })
      .then(setDataUrl)
      .catch((error) => {
        console.error("Failed to generate QR code:", error);
        setDataUrl(null);
      });
  }, [path]);

  if (!dataUrl) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* biome-ignore lint/performance/noImgElement: data URL のため next/image 不要 */}
      <img src={dataUrl} alt="QR コード" width={200} height={200} />
      <p className="text-sm text-muted-foreground">
        受付でこの QR コードを提示してください
      </p>
    </div>
  );
}
