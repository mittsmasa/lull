import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";

/**
 * セッションを取得（未認証なら null）
 */
export async function getSession(): Promise<Session | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

/**
 * セッションを取得（未認証ならトップページにリダイレクト）
 */
export async function requireSession(returnTo?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const target = returnTo
      ? `/?returnTo=${encodeURIComponent(returnTo)}`
      : "/";
    redirect(target);
  }
  return session;
}

/**
 * returnTo パラメータのバリデーション（オープンリダイレクト防止）
 */
export function validateReturnTo(returnTo: string | undefined): string {
  if (!returnTo) return "/dashboard";
  // 相対パスのみ許可（オープンリダイレクト防止）
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return "/dashboard";
}
