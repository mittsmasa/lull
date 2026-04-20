"use client";

import { ArrowLeft, List } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHeaderConfig } from "@/app/_components/header-config";
import {
  type NavigationEvent,
  NavigationSheet,
} from "@/app/_components/navigation-sheet";
import { Button } from "@/components/ui/button";

type AppHeaderProps = {
  events?: NavigationEvent[];
};

export function AppHeader({ events = [] }: AppHeaderProps) {
  const router = useRouter();
  const { showBackButton } = useHeaderConfig();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <header className="sticky top-0 z-header h-14 border-b border-border/50 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
      <div className="grid h-full grid-cols-3 items-center px-1">
        {/* 左: 戻るボタン */}
        <div className="justify-self-start">
          {showBackButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              aria-label="戻る"
              className="text-muted-foreground transition-transform duration-200 hover:-translate-x-0.5"
            >
              <ArrowLeft weight="light" className="size-5" />
            </Button>
          )}
        </div>

        {/* 中央: ロゴ（常に中央固定）→ タップでダッシュボードへ */}
        <div className="justify-self-center">
          <Link
            href="/dashboard"
            aria-label="ホームへ"
            className="font-serif text-lg font-light tracking-widest text-primary"
          >
            Lull
          </Link>
        </div>

        {/* 右: ハンバーガーメニュー */}
        <div className="justify-self-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSheetOpen(true)}
            aria-label="メニュー"
            className="text-muted-foreground"
          >
            <List weight="light" className="size-5" />
          </Button>
        </div>
      </div>

      <NavigationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        events={events}
      />
    </header>
  );
}
