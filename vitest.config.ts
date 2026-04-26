import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
    },
  },
  test: {
    projects: [
      // ユニットテスト（Node.js 環境）
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/lib/queries/**/*.test.ts"],
          environment: "node",
        },
      },
      // DB を含むテスト（Node.js 環境、直列実行、test DB に向ける）
      {
        extends: true,
        resolve: {
          alias: {
            "server-only": path.resolve(
              dirname,
              "tests/db/__mocks__/server-only.ts",
            ),
          },
        },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts", "src/lib/queries/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/db/setup.ts"],
          pool: "forks",
          // @ts-expect-error vitest v4 の ProjectConfig 型に forks が未反映だが実行時は受け付ける
          forks: { singleFork: true },
        },
      },
      // Storybook テスト（ブラウザ環境）
      {
        extends: true,
        plugins: [
          storybookTest({ configDir: path.join(dirname, ".storybook") }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
          setupFiles: [".storybook/vitest.setup.ts"],
        },
      },
    ],
  },
});
