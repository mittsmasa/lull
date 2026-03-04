"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { StorageKey } from "@/lib/hooks/storage-keys";

/**
 * sessionStorage を型安全に管理するカスタムフック
 *
 * - キーは `sessionStorageKeys` のファクトリ関数から取得する（plain string は渡せない）
 * - useSyncExternalStore で SSR 安全に sessionStorage を読み取る
 * - 注意: Web Storage API の仕様上、storage イベントは localStorage でのみ発火し
 *   sessionStorage では発火しない（タブごとに独立した領域のため）。
 *   subscribe は useSyncExternalStore の必須引数として no-op で提供している
 */
export function useSessionStorage<T>(
  key: StorageKey<T>,
  fallback: T,
): [T, (value: T) => void, () => void] {
  const storage = typeof window !== "undefined" ? sessionStorage : null;
  const keyStr = key as string;

  // sessionStorage では storage イベントが発火しないため、
  // subscribe は no-op（useSyncExternalStore の必須引数）
  const subscribe = useCallback(() => {
    return () => {};
  }, []);

  const getSnapshot = useCallback(() => {
    return storage?.getItem(keyStr) ?? null;
  }, [storage, keyStr]);

  const getServerSnapshot = useCallback(() => null, []);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = (raw ?? fallback) as T;

  const setValue = useCallback(
    (v: T) => {
      storage?.setItem(keyStr, String(v));
    },
    [storage, keyStr],
  );

  const removeValue = useCallback(() => {
    storage?.removeItem(keyStr);
  }, [storage, keyStr]);

  return [value, setValue, removeValue];
}
