import { expect, type Page, test } from "@playwright/test";
import {
  changeEventStatus,
  createEvent,
  dismissPwaBanner,
  expectToast,
  invitationRow,
  inviteGuest,
  newGuestContext,
  ORGANIZER_STATE,
  respondAsGuest,
  runInvitationAction,
  setEventFees,
} from "./helpers/app";

// D. 支払い（Stripe sandbox）+ F1 決済失敗カード
//
// 外部依存（api.stripe.com）を伴う唯一の spec。テストモードのキー以外では
// 実行しない（live キー混入時の誤課金を構造的に防ぐ）

const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";

test.skip(!stripeKey, "STRIPE_SECRET_KEY 未設定のため決済 spec をスキップ");
if (stripeKey && !stripeKey.startsWith("sk_test_")) {
  throw new Error(
    "STRIPE_SECRET_KEY がテストキー（sk_test_）ではありません。決済 e2e は sandbox でのみ実行できます",
  );
}

test.use({ storageState: ORGANIZER_STATE });
test.describe.configure({ mode: "serial" });

const DECLINED_CARD = "4000 0000 0000 0002";
const VALID_CARD = "4242 4242 4242 4242";

const run = Date.now().toString(36);
const EVENT_NAME = `決済検証 ${run}`;
let eventId: string;
let prepaidPath: string;
let onsitePath: string;

async function fillAndSubmitCheckout(page: Page, cardNumber: string) {
  const email = page.locator('input[name="email"]');
  if ((await email.count()) > 0 && (await email.inputValue()) === "") {
    await email.fill("pay-test@example.com");
  }
  await page.locator('input[name="cardNumber"]').fill(cardNumber);
  await page.locator('input[name="cardExpiry"]').fill("12 / 34");
  await page.locator('input[name="cardCvc"]').fill("123");
  const billingName = page.locator('input[name="billingName"]');
  if (await billingName.isVisible().catch(() => false)) {
    await billingName.fill("ケッサイ タロウ");
  }
  const postal = page.locator('input[name="billingPostalCode"]');
  if (await postal.isVisible().catch(() => false)) {
    await postal.fill("100-0001");
  }
  await page.getByTestId("hosted-payment-submit-button").click();
}

test("D0: 決済ありイベントとゲスト回答を準備する", async ({
  browser,
  page,
}) => {
  eventId = await createEvent(page, { name: EVENT_NAME, seats: 4 });
  await setEventFees(page, eventId, { attendanceFee: 500 });
  await changeEventStatus(page, eventId, "公開する");
  prepaidPath = await inviteGuest(page, eventId, "決済太郎");

  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await respondAsGuest(guestPage, prepaidPath, {
    name: "決済太郎",
    email: "pay-test@example.com",
    attendance: "accept",
    payment: "prepaid",
  });
  await context.close();
});

test("D1+F1+D2+D4: Checkout 遷移 → 拒否カード → リトライ成功 → 反映", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await newGuestContext(browser);
  const page = await context.newPage();
  await page.goto(prepaidPath);
  await dismissPwaBanner(page);

  // D1: Stripe Checkout（テストモード）へ遷移
  await page.getByRole("button", { name: /オンラインで支払う ¥500/ }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  // F1: 拒否カードでは決済エラーが表示され、セッションに留まる
  await fillAndSubmitCheckout(page, DECLINED_CARD);
  await expect(
    page.getByText(/カードが拒否されました|card was declined/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(page.url()).toContain("checkout.stripe.com");

  // F1 続き: 同一セッション内でカードを差し替えてリトライ
  await fillAndSubmitCheckout(page, VALID_CARD);

  // D4: ?payment=success リダイレクト経路で反映される（webhook なし）
  await page.waitForURL(/payment=success/, { timeout: 60_000 });
  await expect(
    page.getByText(/支払済み（オンライン決済）/).first(),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("¥500").first()).toBeVisible();

  // D5: 決済成功後は支払いボタンが再表示されない
  await page.reload();
  await expect(
    page.getByRole("button", { name: /オンラインで支払う/ }),
  ).toHaveCount(0);
  await context.close();
});

test("D6: 主催者が手動で入金済みにできる", async ({ browser, page }) => {
  onsitePath = await inviteGuest(page, eventId, "現金花子");
  const context = await newGuestContext(browser);
  const guestPage = await context.newPage();
  await respondAsGuest(guestPage, onsitePath, {
    name: "現金花子",
    email: "cash@example.com",
    attendance: "accept",
    payment: "onsite",
  });
  await context.close();

  await page.goto(`/events/${eventId}/invitations`);
  await runInvitationAction(
    page,
    "現金花子",
    "入金済みにする",
    "入金済みにする",
  );
  await expectToast(page, "入金済みにしました");
  await expect(
    invitationRow(page, "現金花子").getByText(/支払済（手動記録）/),
  ).toBeVisible();
});
