import { expect, test } from "@playwright/test";
import {
  changeEventStatus,
  createEvent,
  inviteGuest,
  newGuestContext,
  ORGANIZER_STATE,
  respondAsGuest,
} from "./helpers/app";

// E. 当日フロー（チェックイン）

test.use({ storageState: ORGANIZER_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const EVENT_NAME = `当日フロー検証 ${run}`;
let eventId: string;
let guestPath: string;

test("E1: 開催を開始できる", async ({ browser, page }) => {
  eventId = await createEvent(page, {
    name: EVENT_NAME,
    seats: "unlimited",
  });
  await changeEventStatus(page, eventId, "公開する");
  guestPath = await inviteGuest(page, eventId, "田中一");

  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await respondAsGuest(guestPage, guestPath, {
    name: "田中一",
    email: "tanaka@example.com",
    attendance: "accept",
    companions: ["田中二"],
  });
  await context.close();

  await changeEventStatus(page, eventId, "開催を開始");
  await page.goto(`/events/${eventId}`);
  await expect(page.getByText("開催中").first()).toBeVisible();
});

test("E2+E3: 部分チェックイン・取り消し・一括チェックイン", async ({
  page,
}) => {
  await page.goto(`/events/${eventId}/checkin`);
  await page.getByPlaceholder("名前で絞り込み").fill("田中");
  await page.getByRole("button", { name: /田中一/ }).click();

  const dialog = page.getByRole("dialog");
  // 本人のみチェックイン（部分来場）
  await dialog
    .getByRole("button", { name: "チェックイン", exact: true })
    .first()
    .click();
  await expect(dialog.getByRole("button", { name: "取り消し" })).toBeVisible();

  // E3: 取り消しで未チェックインに戻る
  await dialog.getByRole("button", { name: "取り消し" }).click();
  await expect(
    dialog.getByRole("button", { name: "チェックイン", exact: true }),
  ).toHaveCount(2);

  // 一括チェックインで同伴者含め全員記録
  await dialog
    .getByRole("button", { name: /残り 2 名を一括チェックイン/ })
    .click();
  await expect(dialog.getByText(/All checked in/)).toBeVisible();
  await dialog.getByRole("button", { name: "閉じる" }).click();
});

test("E4: ゲスト側に受付状況が表示される", async ({ browser }) => {
  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await guestPage.goto(guestPath);
  await expect(guestPage.getByText("受付状況")).toBeVisible();
  await expect(guestPage.getByText(/受付済み/)).toHaveCount(2);
  // ongoing 中は回答変更不可
  await expect(
    guestPage.getByText("回答の変更期間は終了しました"),
  ).toBeVisible();
  await context.close();
});

test("E5: 終了後はゲストページが読み取り専用になる", async ({
  browser,
  page,
}) => {
  await changeEventStatus(page, eventId, "終了する");

  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await guestPage.goto(guestPath);
  await expect(
    guestPage.getByText(
      /このイベントは終了しました。お越しいただきありがとうございました/,
    ),
  ).toBeVisible();
  await expect(
    guestPage.getByRole("button", { name: "回答を変更する" }),
  ).toHaveCount(0);
  await context.close();
});
