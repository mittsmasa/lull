import { expect, test } from "@playwright/test";
import {
  changeEventStatus,
  createEvent,
  expectToast,
  invitePerformer,
  newGuestContext,
  newPerformerContext,
  ORGANIZER_STATE,
} from "./helpers/app";

// B. 出演者フロー

test.use({ storageState: ORGANIZER_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const EVENT_NAME = `出演者フロー検証 ${run}`;
let eventId: string;
let joinPath: string;

test("B1: 出演者招待リンクを発行できる", async ({ page }) => {
  eventId = await createEvent(page, { name: EVENT_NAME, seats: 5 });
  await changeEventStatus(page, eventId, "公開する");
  joinPath = await invitePerformer(page, eventId, "山田花子");
  expect(joinPath).toMatch(/^\/join\//);
});

test("B2: 招待リンクから出演者として参加できる", async ({ browser }) => {
  const context = await newPerformerContext(browser);
  const page = await context.newPage();
  await page.goto(joinPath);
  await page.getByLabel("Display Name").fill("山田花子");
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await page.waitForURL(new RegExp(`/events/${eventId}`));
  await expect(page.getByRole("heading", { name: EVENT_NAME })).toBeVisible();
  await context.close();
});

test("B3: 使用済みトークンは第三者に使えない", async ({ browser }) => {
  const context = await newGuestContext(browser);
  const page = await context.newPage();
  await page.goto(joinPath);
  await expect(
    page.getByRole("heading", { name: "この招待リンクは既に使用済みです" }),
  ).toBeVisible();
  await context.close();
});

test("B4: プログラムを追加できる", async ({ page }) => {
  await page.goto(`/events/${eventId}/programs`);
  await page.getByRole("button", { name: "プログラムを追加" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("曲名").fill("ノクターン 第2番");
  await dialog.getByPlaceholder("作曲者・作詞者・編曲者など").fill("ショパン");
  await dialog.getByLabel("山田花子").check();
  await dialog
    .getByRole("button", { name: "プログラムを追加", exact: true })
    .click();
  await expectToast(page, "プログラムを追加しました");
  await expect(page.getByText("ノクターン 第2番")).toBeVisible();
});
