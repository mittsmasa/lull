import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";

/**
 * セッションを取得（未認証なら null）
 *
 * Server Action と Route Handler から呼ぶ。キャッシュしない。
 * 描画経路（page / layout）からは `getSessionForRender()` を使う。
 */
export async function getSession(): Promise<Session | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

/**
 * セッションを取得（未認証ならトップページにリダイレクト）
 *
 * Server Action と Route Handler から呼ぶ。キャッシュしない。
 * 描画経路（page / layout）からは `requireSessionForRender()` を使う。
 */
export async function requireSession(returnTo?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(signInPath(returnTo));
  }
  return session;
}

/**
 * 描画経路（page / layout）用のセッション取得（未認証なら null）
 *
 * `'use cache: private'` なのでブラウザにのみ保持され、サーバーには残らない。
 * これによりセッションを読むルートが per-session の App Shell を作り、prefetch に乗る。
 *
 * Server Action と Route Handler からは呼ばない。キャッシュ済みの古いセッションで
 * mutation が認可される余地を作らないため、そちらは `getSession()` を使う。
 *
 * `cacheLife` は指定しない。既定 profile の stale 5 分が App Shell に含まれる下限のため、
 * 短くすると prefetch から外れる。
 */
export async function getSessionForRender(): Promise<Session | null> {
  "use cache: private";

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

/**
 * 描画経路（page / layout）用のセッション取得（未認証ならトップページにリダイレクト）
 *
 * この関数自体はキャッシュしない。`redirect()` をキャッシュ関数の外で throw させることで、
 * 認証ゲートがキャッシュの影響を受けないようにしている。
 *
 * Server Action と Route Handler からは呼ばない（`requireSession()` を使う）。
 */
export async function requireSessionForRender(
  returnTo?: string,
): Promise<Session> {
  const session = await getSessionForRender();
  if (!session) {
    redirect(signInPath(returnTo));
  }
  return session;
}

function signInPath(returnTo?: string): string {
  return returnTo ? `/?returnTo=${encodeURIComponent(returnTo)}` : "/";
}

/**
 * returnTo パラメータのバリデーション（オープンリダイレクト防止）
 */
export function validateReturnTo(
  returnTo: string | string[] | undefined,
): string {
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  if (!value) return "/dashboard";
  // 相対パスのみ許可（オープンリダイレクト防止）
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}
