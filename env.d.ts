// CloudflareEnv の拡張（@opennextjs/cloudflare が定義するグローバル interface）
// wrangler.jsonc の d1_databases / vars / secrets に対応
interface CloudflareEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  NEXT_PUBLIC_APP_URL: string;
}
