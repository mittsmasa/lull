"use client";

import { ArrowLeft, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHeaderConfig } from "@/app/_components/header-config";
import { NavigationSheet } from "@/app/_components/navigation-sheet";
import { Button } from "@/components/ui/button";

export function AppHeader() {
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
              <ArrowLeft className="size-5" />
            </Button>
          )}
        </div>

        {/* 中央: ロゴ（常に中央固定） */}
        <div className="justify-self-center">
          <span className="font-serif text-lg font-light tracking-widest text-primary">
            Lull
          </span>
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
            <Menu className="size-5" />
          </Button>
        </div>
      </div>

      <NavigationSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </header>
  );
}
