import { expect, test } from "@playwright/test";
import {
  changeEventStatus,
  createEvent,
  inviteGuest,
  newGuestContext,
  ORGANIZER_STATE,
  respondAsGuest,
} from "./helpers/app";

// F3. published → draft 差し戻しと再公開

test.use({ storageState: ORGANIZER_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const EVENT_NAME = `差し戻し検証 ${run}`;
let eventId: string;
let guestPath: string;

test("準備: 公開イベントに出席回答を入れる", async ({ browser, page }) => {
  eventId = await createEvent(page, { name: EVENT_NAME, seats: 2 });
  await changeEventStatus(page, eventId, "公開する");
  guestPath = await inviteGuest(page, eventId, "冬野ゆき");

  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await respondAsGuest(guestPage, guestPath, {
    name: "冬野ゆき",
    email: "fuyuno@example.com",
    attendance: "accept",
  });
  await context.close();
});

test("F3-1: 下書きに戻すとゲストページが準備中になる", async ({
  browser,
  page,
}) => {
  await changeEventStatus(page, eventId, "下書きに戻す");

  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await guestPage.goto(guestPath);
  await expect(
    guestPage.getByRole("heading", { name: "現在準備中です" }),
  ).toBeVisible();
  await context.close();
});

test("F3-2: 再公開で回答内容ごと復活する", async ({ browser, page }) => {
  await changeEventStatus(page, eventId, "公開する");

  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await guestPage.goto(guestPath);
  await expect(guestPage.getByText("回答は送信済みです")).toBeVisible();
  await expect(guestPage.getByText("現在の回答")).toBeVisible();
  await expect(guestPage.getByText("出席", { exact: true })).toBeVisible();
  await context.close();
});
