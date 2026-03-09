"use client";

import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type QrScannerProps = {
  onScan: (decodedText: string) => void;
};

type ScannerStatus = "starting" | "scanning" | "error";

export function QrScanner({ onScan }: QrScannerProps) {
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const reactId = useId();
  const elementId = `qr-scanner-${reactId.replace(/:/g, "")}`;

  onScanRef.current = onScan;

  const handleScan = useCallback((decodedText: string) => {
    onScanRef.current(decodedText);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const html5QrCode = new Html5Qrcode(elementId, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    scannerRef.current = html5QrCode;

    const startPromise = html5QrCode
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          html5QrCode.pause(false);
          handleScan(decodedText);
        },
        () => {},
      )
      .then(() => {
        if (cancelled) {
          return html5QrCode
            .stop()
            .then(() => html5QrCode.clear())
            .catch(() => {});
        }
        setStatus("scanning");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "カメラの起動に失敗しました。カメラへのアクセスを許可してください。",
        );
      });

    return () => {
      cancelled = true;
      // start() 完了を待ってから停止する（play() interrupted 回避）
      startPromise.then(() => {
        const state = html5QrCode.getState();
        // 2 = SCANNING, 3 = PAUSED
        if (state === 2 || state === 3) {
          html5QrCode
            .stop()
            .then(() => html5QrCode.clear())
            .catch(() => {});
        } else {
          try {
            html5QrCode.clear();
          } catch {
            // ignore
          }
        }
      });
    };
  }, [elementId, handleScan]);

  return (
    <div className="flex flex-col items-center gap-4">
      {status === "starting" && (
        <p className="text-muted-foreground text-sm">カメラを起動中...</p>
      )}
      {status === "error" && (
        <p className="text-destructive text-sm">{errorMessage}</p>
      )}
      <div
        id={elementId}
        className="w-full max-w-sm overflow-hidden rounded-lg"
      />
    </div>
  );
}
