"use client";

import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type QrScannerProps = {
  onScan: (decodedText: string) => void;
};

type ScannerStatus = "starting" | "scanning" | "error";

export function QrScanner({ onScan }: QrScannerProps) {
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [attempt, setAttempt] = useState(0);
  const onScanRef = useRef(onScan);
  const reactId = useId();
  // attempt を id に含めることで、再試行時に effect の依存が変わり再実行される
  const elementId = `qr-scanner-${reactId.replace(/:/g, "")}-${attempt}`;

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
        if (cancelled) return;
        setStatus("scanning");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "カメラの起動に失敗しました",
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

  const retry = () => {
    setErrorMessage("");
    setStatus("starting");
    setAttempt((n) => n + 1);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {status === "starting" && (
        <p className="text-muted-foreground text-sm">カメラを起動中...</p>
      )}
      {status === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-destructive text-sm text-center">
            {errorMessage || "カメラの起動に失敗しました"}
          </p>
          <Button variant="outline" size="sm" onClick={retry}>
            再試行
          </Button>
        </div>
      )}
      <div
        id={elementId}
        className="w-full max-w-sm overflow-hidden rounded-lg"
      />
    </div>
  );
}
