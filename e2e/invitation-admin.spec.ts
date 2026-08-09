import { expect, test } from "@playwright/test";
import {
  changeEventStatus,
  createEvent,
  expectInvitationStat,
  expectToast,
  invitationRow,
  inviteGuest,
  newGuestContext,
  ORGANIZER_STATE,
  respondAsGuest,
  runInvitationAction,
} from "./helpers/app";

// F2. 招待の無効化・代理変更

test.use({ storageState: ORGANIZER_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const EVENT_NAME = `招待管理検証 ${run}`;
let eventId: string;
let acceptedPath: string;

test("準備: 出席済みゲストと回答待ち招待を作る", async ({ browser, page }) => {
  eventId = await createEvent(page, { name: EVENT_NAME, seats: 1 });
  await changeEventStatus(page, eventId, "公開する");
  acceptedPath = await inviteGuest(page, eventId, "青木花");
  await inviteGuest(page, eventId, "回答待ちさん");

  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await respondAsGuest(guestPage, acceptedPath, {
    name: "青木花",
    email: "aoki@example.com",
    attendance: "accept",
  });
  await context.close();
});

test("F2-1: 代理で辞退に変更 → 出席に戻す", async ({ page }) => {
  await page.goto(`/events/${eventId}/invitations`);
  await expectInvitationStat(page, "残り", "0");

  await runInvitationAction(page, "青木花", "辞退に変更", "辞退に変更");
  await expectToast(page, "出欠を変更しました");
  await expectInvitationStat(page, "残り", "1");

  await runInvitationAction(page, "青木花", "出席に変更", "出席に変更");
  await expectToast(page, "出欠を変更しました");
  await expectInvitationStat(page, "残り", "0");
});

test("F2-2: 回答待ちの招待には代理変更メニューが出ない", async ({ page }) => {
  await page.goto(`/events/${eventId}/invitations`);
  await invitationRow(page, "回答待ちさん").getByLabel("操作メニュー").click();
  await expect(page.getByRole("menuitem", { name: "出席に変更" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("menuitem", { name: "辞退に変更" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("menuitem", { name: "招待を無効化" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("F2-3: 出席済み招待の無効化で座席が解放される", async ({
  browser,
  page,
}) => {
  await page.goto(`/events/${eventId}/invitations`);
  await runInvitationAction(page, "青木花", "招待を無効化", "無効化する");
  await expectToast(page, "招待を無効化しました");
  await expect(
    invitationRow(page, "青木花").getByText("無効化済み"),
  ).toBeVisible();
  await expectInvitationStat(page, "残り", "1");

  // 無効化済みリンクはゲストから見ると無効
  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await guestPage.goto(acceptedPath);
  await expect(
    guestPage.getByRole("heading", { name: "招待リンクは無効です" }),
  ).toBeVisible();
  await context.close();
});

test("F2-4: 回答待ちの招待も無効化できる", async ({ page }) => {
  await page.goto(`/events/${eventId}/invitations`);
  await runInvitationAction(page, "回答待ちさん", "招待を無効化", "無効化する");
  await expectToast(page, "招待を無効化しました");
  await expect(
    invitationRow(page, "回答待ちさん").getByText("無効化済み"),
  ).toBeVisible();
});
