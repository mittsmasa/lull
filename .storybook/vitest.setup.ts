import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import { setProjectAnnotations } from "@storybook/nextjs-vite";
import { beforeEach } from "vitest";
import { server } from "vitest/browser";
import * as projectAnnotations from "./preview";

declare module "vitest/internal/browser" {
  interface BrowserCommands {
    resetPointer: () => Promise<void>;
  }
}

// This is an important step to apply the right configuration when testing your stories.
// More info at: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

// ストーリーを描画する前に実ポインタをビューポート外へ出す。
// headless chromium の仮想ポインタは原点にあり、原点に重なるストーリーは
// :hover が当たったまま描画される。VRT の撮影がポインタ位置に左右されると
// 環境ごとに違うスクリーンショットになるため、毎テストの先頭で揃える。
// コマンドの実体は vitest.config.ts の browser.commands.resetPointer
beforeEach(async () => {
  await server.commands.resetPointer();
});
