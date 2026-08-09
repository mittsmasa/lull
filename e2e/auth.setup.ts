import { expect, test as setup } from "@playwright/test";
import { ORGANIZER_STATE, PERFORMER_STATE } from "./helpers/app";

// OAuth エミュレータ経由でログインし storageState を保存する。
// エミュレータのアカウント選択画面は各アカウントが submit ボタンで、
// ボタン内テキストに login / email が含まれる

async function loginViaEmulator(
  page: import("@playwright/test").Page,
  email: string,
  statePath: string,
) {
  await page.goto("/");
  await page.getByRole("button", { name: "Google でサインイン" }).click();
  await page.getByRole("button", { name: new RegExp(email) }).click();
  await expect(
    page.getByRole("heading", { name: "マイイベント" }),
  ).toBeVisible();
  await page.context().storageState({ path: statePath });
}

setup("主催者（Test User）でログイン", async ({ page }) => {
  await loginViaEmulator(page, "testuser@gmail\\.com", ORGANIZER_STATE);
});

setup("出演者（Preview Tester）でログイン", async ({ page }) => {
  await loginViaEmulator(page, "preview-tester@example\\.com", PERFORMER_STATE);
});
