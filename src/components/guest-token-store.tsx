"use client";

import { useEffect } from "react";

const STORAGE_KEY = "lull-guest-token";

export function SaveGuestToken({ token }: { token: string }) {
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, token);
  }, [token]);

  return null;
}

export function getGuestToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}
