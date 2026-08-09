import "server-only";

/**
 * メール本文等に載せる、公開アクセス可能なベース URL。
 *
 * リクエストのホストではなく環境変数から組み立てる。webhook のように
 * リクエスト元が Stripe のケースでも同じ URL を返す必要があるため
 */
export function getBaseUrl(): string {
  // 明示設定（trim 後の非空）が最優先
  const explicit =
    process.env.APP_PUBLIC_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (explicit) return explicit;
  // Vercel の preview deploy 等では VERCEL_BRANCH_URL / VERCEL_URL を使う
  // （src/lib/auth.ts の組み立て方と揃える）
  const vercelHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}
