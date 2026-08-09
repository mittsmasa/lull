import { expect, test } from "@playwright/test";
import {
  changeEventStatus,
  createEvent,
  expectInvitationStat,
  expectToast,
  fillGuestResponse,
  inviteGuest,
  newGuestContext,
  ORGANIZER_STATE,
  respondAsGuest,
  setEventFees,
  submitGuestResponse,
} from "./helpers/app";

// C. ゲスト招待・出欠

test.use({ storageState: ORGANIZER_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const EVENT_NAME = `ゲスト回答検証 ${run}`;
const FULL_EVENT_NAME = `満席検証 ${run}`;
let eventId: string;
let fullEventId: string;
let satoPath: string;
let suzukiPath: string;

test("C1: ゲスト招待リンクを発行できる", async ({ page }) => {
  eventId = await createEvent(page, { name: EVENT_NAME, seats: 3 });
  await setEventFees(page, eventId, {
    attendanceFee: 1000,
    afterParty: { venue: "近くのカフェ", startTime: "17:00", fee: 2000 },
  });
  await changeEventStatus(page, eventId, "公開する");
  satoPath = await inviteGuest(page, eventId, "佐藤太郎");
  expect(satoPath).toMatch(/^\/i\//);
});

test("C2: 同伴者・懇親会つきの出席回答で金額内訳が計算される", async ({
  browser,
}) => {
  const context = await newGuestContext(browser);
  const page = await context.newPage();
  await page.goto(satoPath);
  await fillGuestResponse(page, {
    name: "佐藤太郎",
    email: "taro@example.com",
    attendance: "accept",
    companions: ["佐藤良子"],
    afterParty: true,
    afterPartyCompanions: ["佐藤良子"],
  });
  // 参加費 ¥1,000×2 + 懇親会 ¥2,000×2 = ¥6,000
  await expect(page.getByText("¥6,000").first()).toBeVisible();
  await submitGuestResponse(page);
  await expectToast(page, "回答を受け取りました");
  await expect(page.getByText("現在の回答")).toBeVisible();
  await expect(page.getByText("佐藤良子").first()).toBeVisible();
  await context.close();
});

test("C3: 辞退への変更で座席が解放される", async ({ browser, page }) => {
  suzukiPath = await inviteGuest(page, eventId, "鈴木一郎");
  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await respondAsGuest(guestPage, suzukiPath, {
    name: "鈴木一郎",
    email: "ichiro@example.com",
    attendance: "accept",
    afterParty: false,
  });

  await page.goto(`/events/${eventId}/invitations`);
  await expectInvitationStat(page, "残り", "0");

  await respondAsGuest(guestPage, suzukiPath, {
    name: "鈴木一郎",
    email: "ichiro@example.com",
    attendance: "decline",
  });
  await page.goto(`/events/${eventId}/invitations`);
  await expectInvitationStat(page, "残り", "1");
  await context.close();
});

test("C4: 満席でも辞退回答は受理される", async ({ browser, page }) => {
  fullEventId = await createEvent(page, { name: FULL_EVENT_NAME, seats: 1 });
  await changeEventStatus(page, fullEventId, "公開する");
  const firstPath = await inviteGuest(page, fullEventId, "先着ゲスト");
  const declinePath = await inviteGuest(page, fullEventId, "辞退ゲスト");

  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  // 1 席を埋めて満席にする
  await respondAsGuest(guestPage, firstPath, {
    name: "先着ゲスト",
    email: "first@example.com",
    attendance: "accept",
  });
  // 満席でも辞退は受理される
  await respondAsGuest(guestPage, declinePath, {
    name: "辞退ゲスト",
    email: "decline@example.com",
    attendance: "decline",
  });
  await context.close();
});

test("C5: 満席時の出席回答はサーバー側で拒否される", async ({
  browser,
  page,
}) => {
  const rejectedPath = await inviteGuest(page, fullEventId, "あふれゲスト");
  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await guestPage.goto(rejectedPath);
  await fillGuestResponse(guestPage, {
    name: "あふれゲスト",
    email: "overflow@example.com",
    attendance: "accept",
  });
  await submitGuestResponse(guestPage);
  await expectToast(guestPage, "満席のため出席回答を受け付けられません");
  await context.close();
});

test("C6: ゲスト管理の集計が正しい", async ({ page }) => {
  await page.goto(`/events/${eventId}/invitations`);
  await expectInvitationStat(page, "総座席", "3");
  await expectInvitationStat(page, "残り", "1");
  await expectInvitationStat(page, "出席", "2");
});
