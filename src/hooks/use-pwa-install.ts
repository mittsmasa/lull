"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function subscribePrompt(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function usePwaInstall() {
  const hasNativeInstall = useSyncExternalStore(
    subscribePrompt,
    () => deferredPrompt !== null,
    () => false,
  );

  const subscribeStandalone = useCallback((onChange: () => void) => {
    const mql = window.matchMedia("(display-mode: standalone)");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const isInstalled = useSyncExternalStore(
    subscribeStandalone,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        !!(navigator as Record<string, unknown>).standalone),
    () => false,
  );

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt = null;
      notify();
    }
  }, []);

  if (!isReady || isInstalled) {
    return {
      hasNativeInstall: false,
      showManualGuide: false,
      isInstalled,
      promptInstall,
    } as const;
  }

  return {
    hasNativeInstall,
    showManualGuide: !hasNativeInstall,
    isInstalled,
    promptInstall,
  } as const;
}
