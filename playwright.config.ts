import { defineConfig, devices } from "@playwright/test";

// ローカルで port 3000 が別プロセスと競合する場合は E2E_PORT で変更できる
// （CI は常に 3000）。e2e/helpers/app.ts の BASE_URL も同じ値を参照する
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

// 事前に以下を実行しておくこと（webServer は起動のみを担当する）:
//   TURSO_DATABASE_URL=file:e2e-local.db pnpm db:migrate
//   NEXT_PUBLIC_VERCEL_ENV=preview pnpm build
export default defineConfig({
  testDir: "e2e",
  // シナリオがステートフル（イベント状態を積み上げる）なため直列実行に固定
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // 招待リンク発行はクリップボード経由で URL を受け取るため
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // shell 側に本番 Turso の env が入っていても e2e 専用 DB に強制する
      TURSO_DATABASE_URL: "file:e2e-local.db",
      TURSO_AUTH_TOKEN: "",
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "e2e-only-dummy-secret-0123456789abcdef",
      APP_PUBLIC_URL: BASE_URL,
      NEXT_PUBLIC_VERCEL_ENV: "preview",
      GOOGLE_CLIENT_ID: "emulate-client",
      GOOGLE_CLIENT_SECRET: "emulate-secret",
      // production モードでは未設定だと MailerConfigError になるためダミーを
      // 入れる（送信は失敗するが catch されて log のみ）
      RESEND_API_KEY: "re_e2e_dummy",
    },
  },
});
