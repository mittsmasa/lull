"use client";

import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type QrScannerProps = {
  onScan: (decodedText: string) => void;
};

type ScannerStatus =
  | "requesting"
  | "starting"
  | "scanning"
  | "denied"
  | "error";

/** カメラ権限状態を取得（未対応ブラウザでは null） */
async function queryCameraPermission(): Promise<PermissionState | null> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return null;
  }
  try {
    const result = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return result.state;
  } catch {
    return null;
  }
}

/** getUserMedia を明示的に呼び出して権限を取得する（PWA / iOS Safari 対策） */
async function requestCameraPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
  // Html5Qrcode が内部で getUserMedia を呼ぶため、取得済み stream はここで停止
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function isPermissionDeniedError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
  );
}

export function QrScanner({ onScan }: QrScannerProps) {
  const [status, setStatus] = useState<ScannerStatus>("requesting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [attempt, setAttempt] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const reactId = useId();
  const elementId = `qr-scanner-${reactId.replace(/:/g, "")}`;

  onScanRef.current = onScan;

  const handleScan = useCallback((decodedText: string) => {
    onScanRef.current(decodedText);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt は再試行時に effect を強制再実行するためのトリガー
  useEffect(() => {
    let cancelled = false;
    let html5QrCode: Html5Qrcode | null = null;
    let startPromise: Promise<unknown> = Promise.resolve();

    const run = async () => {
      // 1. 権限状態を事前確認。denied の場合はダイアログを出さずに即エラー表示
      const permission = await queryCameraPermission();
      if (cancelled) return;
      if (permission === "denied") {
        setStatus("denied");
        return;
      }

      // 2. 明示的に getUserMedia を呼んで権限ダイアログを発火させる。
      //    PWA / iOS Safari では html5-qrcode の内部呼び出しだけだと
      //    プロンプトが表示されないケースがあるため、ここで必ず叩く
      try {
        await requestCameraPermission();
      } catch (err: unknown) {
        if (cancelled) return;
        if (isPermissionDeniedError(err)) {
          setStatus("denied");
        } else {
          setStatus("error");
          setErrorMessage(
            err instanceof Error ? err.message : "カメラの起動に失敗しました",
          );
        }
        return;
      }
      if (cancelled) return;

      // 3. スキャナー起動
      setStatus("starting");
      html5QrCode = new Html5Qrcode(elementId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      startPromise = html5QrCode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            html5QrCode?.pause(false);
            handleScan(decodedText);
          },
          () => {},
        )
        .then(() => {
          if (cancelled) {
            return html5QrCode
              ?.stop()
              .then(() => html5QrCode?.clear())
              .catch(() => {});
          }
          setStatus("scanning");
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (isPermissionDeniedError(err)) {
            setStatus("denied");
          } else {
            setStatus("error");
            setErrorMessage(
              err instanceof Error ? err.message : "カメラの起動に失敗しました",
            );
          }
        });
    };

    run();

    return () => {
      cancelled = true;
      // start() 完了を待ってから停止する（play() interrupted 回避）
      startPromise.then(() => {
        if (!html5QrCode) return;
        const state = html5QrCode.getState();
        // 2 = SCANNING, 3 = PAUSED
        if (state === 2 || state === 3) {
          html5QrCode
            .stop()
            .then(() => html5QrCode?.clear())
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
  }, [elementId, handleScan, attempt]);

  const retry = () => {
    setErrorMessage("");
    setStatus("requesting");
    setAttempt((n) => n + 1);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {status === "requesting" && (
        <p className="text-muted-foreground text-sm">
          カメラへのアクセスを許可してください...
        </p>
      )}
      {status === "starting" && (
        <p className="text-muted-foreground text-sm">カメラを起動中...</p>
      )}
      {status === "denied" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-destructive text-sm text-center">
            カメラへのアクセスが許可されていません。
            <br />
            ブラウザまたは端末の設定からカメラを許可した上で、再試行してください。
          </p>
          <Button variant="outline" size="sm" onClick={retry}>
            再試行
          </Button>
        </div>
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
