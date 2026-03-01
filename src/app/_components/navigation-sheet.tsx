"use client";

import { House, Plus, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";

const navItems = [
  { href: "/dashboard", label: "ホーム", icon: House },
  { href: "/events/new", label: "イベントを作成", icon: Plus },
  // { href: "/settings", label: "設定", icon: Settings },
] as const;

type NavigationSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NavigationSheet({ open, onOpenChange }: NavigationSheetProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 font-sans">
        <SheetHeader>
          <SheetTitle className="font-serif text-lg font-light tracking-widest text-primary">
            Lull
          </SheetTitle>
        </SheetHeader>

        <nav className="mt-8 flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => onOpenChange(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-200 ${
                  isActive
                    ? "border-l-2 border-primary bg-accent/50 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                }`}
              >
                <Icon weight="light" className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t py-4">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent/30 hover:text-foreground"
          >
            <SignOut weight="light" className="size-4" />
            ログアウト
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
