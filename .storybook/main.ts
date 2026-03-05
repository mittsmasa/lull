import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/nextjs-vite",
  viteFinal(config) {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    Object.assign(config.resolve.alias, {
      "better-sqlite3": resolve(__dirname, "mocks/better-sqlite3.ts"),
      // Server Actions のモック
      [resolve(
        __dirname,
        "../src/app/(main)/events/[eventId]/programs/_actions",
      )]: resolve(__dirname, "mocks/program-actions.ts"),
    });
    return config;
  },
};
export default config;
