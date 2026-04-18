"use client";

import { Spinner } from "@phosphor-icons/react";
import { useLinkStatus } from "next/link";

/**
 * next/link の子として使うと、遷移中にスピナーを表示する。
 * useLinkStatus は親 Link の pending 状態を購読する。
 */
export function PendingLinkIndicator({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-2">
      {pending && <Spinner className="size-4 animate-spin" />}
      {children}
    </span>
  );
}
