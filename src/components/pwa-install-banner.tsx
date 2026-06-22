"use client";

import { Export, Plus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useIsIos } from "@/hooks/use-is-ios";
import { usePwaInstall } from "@/hooks/use-pwa-install";

function getDismissKey(id: string) {
  return `lull-pwa-dismissed-${id}`;
}

type PwaInstallBannerProps = {
  dismissId?: string;
  dismissible?: boolean;
  variant?: "guest" | "member";
};

const descriptions = {
  guest: "ホーム画面に追加すると、当日チケットにすぐアクセスできます",
  member: "ホーム画面に追加すると、イベント管理にすぐアクセスできます",
} as const;

export function PwaInstallBanner({
  dismissId = "default",
  dismissible = true,
  variant = "guest",
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

  const description = descriptions[variant];

  return (
    <div
      data-testid="pwa-install-banner"
      className="flex flex-col gap-3 rounded-sm bg-muted px-5 py-4"
    >
      {hasNativeInstall ? (
        <NativeInstallContent
          description={description}
          onInstall={promptInstall}
          onDismiss={dismissible ? handleDismiss : undefined}
        />
      ) : (
        <ManualGuideContent
          description={description}
          onDismiss={dismissible ? handleDismiss : undefined}
        />
      )}
    </div>
  );
}

function NativeInstallContent({
  description,
  onInstall,
  onDismiss,
}: {
  description: string;
  onInstall: () => void;
  onDismiss?: () => void;
}) {
  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
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

function ManualGuideContent({
  description,
  onDismiss,
}: {
  description: string;
  onDismiss?: () => void;
}) {
  const isIos = useIsIos();

  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
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
