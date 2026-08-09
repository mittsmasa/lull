import { expect, test } from "@playwright/test";
import {
  changeEventStatus,
  createEvent,
  ORGANIZER_STATE,
  setEventFees,
} from "./helpers/app";

// A. 認証・イベント管理

test.use({ storageState: ORGANIZER_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const EVENT_NAME = `秋のピアノ発表会 ${run}`;
let eventId: string;

test("A1: ログイン済みでダッシュボードが表示される", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "マイイベント" }),
  ).toBeVisible();
});

test("A2: イベントを作成できる", async ({ page }) => {
  eventId = await createEvent(page, {
    name: EVENT_NAME,
    seats: 3,
    openTime: "13:30",
  });
  await expect(page.getByRole("heading", { name: EVENT_NAME })).toBeVisible();
  await expect(page.getByText("下書き").first()).toBeVisible();
});

test("A3: 参加費・懇親会を設定できる", async ({ page }) => {
  await setEventFees(page, eventId, {
    attendanceFee: 1000,
    afterParty: { venue: "近くのカフェ", startTime: "17:00", fee: 2000 },
    paymentNote: "当日受付にて現金でもお支払いいただけます",
  });
  await expect(page.getByText("参加費 ¥1,000/人")).toBeVisible();
  await expect(page.getByText("懇親会 ¥2,000/人")).toBeVisible();
});

test("A4: 公開できる", async ({ page }) => {
  await changeEventStatus(page, eventId, "公開する");
  await page.goto(`/events/${eventId}`);
  await expect(page.getByText("公開中").first()).toBeVisible();
});
