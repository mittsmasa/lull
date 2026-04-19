"use client";

import { CaretDown, House, Plus, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PendingLinkIndicator } from "@/app/_components/pending-link-indicator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { EventStatus } from "@/db/schema";
import { authClient } from "@/lib/auth-client";
import { statusLabels } from "@/lib/event-status";

const navItems = [
  { href: "/dashboard", label: "ホーム", icon: House },
  { href: "/events/new", label: "イベントを作成", icon: Plus },
] as const;

export type NavigationEvent = {
  id: string;
  name: string;
  status: EventStatus;
};

type NavigationSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events?: NavigationEvent[];
};

export function NavigationSheet({
  open,
  onOpenChange,
  events = [],
}: NavigationSheetProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
  };

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-72 flex-col font-sans">
        <SheetHeader>
          <SheetTitle className="font-serif text-lg font-light tracking-widest text-primary">
            Lull
          </SheetTitle>
        </SheetHeader>

        <nav className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-200 ${
                  isActive
                    ? "border-l-2 border-primary bg-accent/50 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                }`}
              >
                <Icon weight="light" className="size-4" />
                <PendingLinkIndicator>{label}</PendingLinkIndicator>
              </Link>
            );
          })}

          {events.length > 0 && (
            <div className="mt-4 flex flex-col gap-1">
              <p className="px-3 pb-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                マイイベント
              </p>
              {events.map((event) => (
                <EventNavItem
                  key={event.id}
                  event={event}
                  pathname={pathname}
                  onNavigate={close}
                />
              ))}
            </div>
          )}
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

function EventNavItem({
  event,
  pathname,
  onNavigate,
}: {
  event: NavigationEvent;
  pathname: string;
  onNavigate: () => void;
}) {
  const eventBase = `/events/${event.id}`;
  const isWithinEvent =
    pathname === eventBase || pathname.startsWith(`${eventBase}/`);
  const [open, setOpen] = useState(isWithinEvent);

  // 現在表示中のイベントに該当するアコーディオンは自動で開く。
  // 手動で閉じた状態を尊重したいので、true になったときのみ開く。
  useEffect(() => {
    if (isWithinEvent) setOpen(true);
  }, [isWithinEvent]);

  const subItems = useMemo(
    () => [
      { href: `${eventBase}`, label: "イベント詳細" },
      { href: `${eventBase}/invitations`, label: "招待管理" },
      { href: `${eventBase}/programs`, label: "プログラム管理" },
      { href: `${eventBase}/members`, label: "メンバー管理" },
      { href: `${eventBase}/checkin`, label: "チェックイン" },
    ],
    [eventBase],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-200 ${
            isWithinEvent
              ? "bg-accent/40 text-foreground"
              : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
          }`}
        >
          <CaretDown
            weight="light"
            className={`size-3 shrink-0 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <span className="flex-1 truncate">{event.name}</span>
          <span className="text-[10px] tracking-wider text-muted-foreground/80">
            {statusLabels[event.status]}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <ul className="my-1 flex flex-col gap-0.5 border-l border-border/50 pl-3">
          {subItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center rounded-md px-3 py-2 text-xs transition-colors duration-200 ${
                    isActive
                      ? "bg-accent/40 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                  }`}
                >
                  <PendingLinkIndicator>{item.label}</PendingLinkIndicator>
                </Link>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
