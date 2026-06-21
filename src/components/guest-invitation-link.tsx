"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getGuestToken } from "@/components/guest-token-store";

export function GuestInvitationLink() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getGuestToken());
  }, []);

  if (!token) return null;

  return (
    <Link
      href={`/i/${token}`}
      className="rounded-sm px-1 py-1 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
    >
      招待状を見る
    </Link>
  );
}
