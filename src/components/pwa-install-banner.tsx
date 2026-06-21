"use client";

import { Export, Plus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

function getDismissKey(id: string) {
  return `lull-pwa-dismissed-${id}`;
}

type PwaInstallBannerProps = {
  dismissId?: string;
  dismissible?: boolean;
};

export function PwaInstallBanner({
  dismissId = "default",
  dismissible = true,
}: PwaInstallBannerProps) {
  const { hasNativeInstall, showManualGuide, isInstalled, promptInstall } =
    usePwaInstall();

  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissible) {
      setDismissed(localStorage.getItem(getDismissKey(dismissId)) === "1");
    }
  }, [dismissible, dismissId]);

  if (isInstalled) return null;
  if (!hasNativeInstall && !showManualGuide) return null;
  if (dismissible && dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(getDismissKey(dismissId), "1");
    setDismissed(true);
  };

  return (
    <div
      data-testid="pwa-install-banner"
      className="flex flex-col gap-3 rounded-sm border border-border/50 px-5 py-4"
    >
      {hasNativeInstall ? (
        <NativeInstallContent
          onInstall={promptInstall}
          onDismiss={dismissible ? handleDismiss : undefined}
        />
      ) : (
        <ManualGuideContent
          onDismiss={dismissible ? handleDismiss : undefined}
        />
      )}
    </div>
  );
}

function NativeInstallContent({
  onInstall,
  onDismiss,
}: {
  onInstall: () => void;
  onDismiss?: () => void;
}) {
  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        ホーム画面に追加すると、当日チケットにすぐアクセスできます
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onInstall}
          className="rounded-sm bg-foreground px-4 py-2 text-xs tracking-[0.1em] text-background transition-colors hover:bg-foreground/90"
        >
          ホーム画面に追加
        </button>
        {onDismiss && <DismissButton onClick={onDismiss} />}
      </div>
    </>
  );
}

function ManualGuideContent({ onDismiss }: { onDismiss?: () => void }) {
  const isIos =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        ホーム画面に追加すると、当日チケットにすぐアクセスできます
      </p>
      <div className="flex flex-col gap-2 text-xs text-muted-foreground">
        {isIos ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <Export className="size-3.5 shrink-0" />
              共有ボタンをタップ
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-3.5 shrink-0" />
              「ホーム画面に追加」を選択
            </span>
          </>
        ) : (
          <span>
            ブラウザのメニューから「ホーム画面に追加」を選択してください
          </span>
        )}
      </div>
      {onDismiss && (
        <div>
          <DismissButton onClick={onDismiss} />
        </div>
      )}
    </>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm px-1 py-1 text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
    >
      あとで
    </button>
  );
}
