import { type Browser, expect, type Page } from "@playwright/test";

export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 3000}`;
export const ORGANIZER_STATE = "e2e/.auth/organizer.json";
export const PERFORMER_STATE = "e2e/.auth/performer.json";

// 同名トーストが連続表示されても strict mode violation にしない
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible();
}

// ゲスト（未ログイン）用のブラウザコンテキスト。手動で作るコンテキストには
// playwright.config.ts の use が適用されないため baseURL を明示する
export function newGuestContext(browser: Browser) {
  return browser.newContext({ baseURL: BASE_URL, locale: "ja-JP" });
}

export function newPerformerContext(browser: Browser) {
  return browser.newContext({
    baseURL: BASE_URL,
    locale: "ja-JP",
    storageState: PERFORMER_STATE,
  });
}

type CreateEventOptions = {
  name: string;
  venue?: string;
  date?: string;
  startTime?: string;
  openTime?: string;
  seats?: number | "unlimited";
};

// ダッシュボードの作成ダイアログからイベントを作り、イベント ID を返す
export async function createEvent(
  page: Page,
  options: CreateEventOptions,
): Promise<string> {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "イベントを作成" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("イベント名").fill(options.name);
  await dialog
    .getByLabel("会場", { exact: true })
    .fill(options.venue ?? "小さなホール");
  await dialog.getByLabel("開催日").fill(options.date ?? "2026-12-20");
  await dialog.getByLabel("開演時刻").fill(options.startTime ?? "14:00");
  if (options.openTime) {
    await dialog.getByLabel("開場時刻（任意）").fill(options.openTime);
  }
  if (options.seats === "unlimited") {
    await dialog.getByLabel("座席数を無制限にする").check();
  } else {
    await dialog
      .getByLabel("座席数", { exact: true })
      .fill(String(options.seats ?? 3));
  }
  await dialog.getByRole("button", { name: "作成", exact: true }).click();
  await expectToast(page, "イベントを作成しました");
  await page
    .getByRole("link", { name: new RegExp(escapeRegExp(options.name)) })
    .click();
  await page.waitForURL(/\/events\/[^/]+$/);
  const eventId = page.url().split("/").pop();
  if (!eventId) throw new Error("イベント ID を URL から取得できませんでした");
  return eventId;
}

type EventFeeOptions = {
  attendanceFee?: number;
  afterParty?: { venue?: string; startTime?: string; fee: number };
  paymentNote?: string;
};

// イベント詳細の編集フォームで参加費・懇親会を設定する
export async function setEventFees(
  page: Page,
  eventId: string,
  options: EventFeeOptions,
) {
  await page.goto(`/events/${eventId}`);
  await page.getByRole("button", { name: "編集", exact: true }).click();
  if (options.attendanceFee !== undefined) {
    await page
      .getByLabel("参加費（円/人、0 = 無料）")
      .fill(String(options.attendanceFee));
  }
  if (options.afterParty) {
    const partySwitch = page.getByRole("switch", { name: "懇親会を開催する" });
    if ((await partySwitch.getAttribute("aria-checked")) !== "true") {
      await partySwitch.click();
    }
    if (options.afterParty.venue) {
      await page
        .getByLabel("懇親会会場（任意）")
        .fill(options.afterParty.venue);
    }
    if (options.afterParty.startTime) {
      await page
        .getByLabel("懇親会開始時刻（任意）")
        .fill(options.afterParty.startTime);
    }
    await page
      .getByLabel("懇親会費（円/人、0 = 無料）")
      .fill(String(options.afterParty.fee));
  }
  if (options.paymentNote !== undefined) {
    await page.getByLabel("支払い案内文（任意）").fill(options.paymentNote);
  }
  await page.getByRole("button", { name: "イベントを更新" }).click();
  await expectToast(page, "イベントを更新しました");
}

// ステータス遷移（transitionLabels: 公開する / 開催を開始 / 終了する / 下書きに戻す）
export async function changeEventStatus(
  page: Page,
  eventId: string,
  transitionLabel: string,
) {
  await page.goto(`/events/${eventId}`);
  await page.getByRole("button", { name: "ステータスを変更" }).click();
  await page
    .getByRole("button", { name: transitionLabel, exact: true })
    .click();
  await expectToast(page, "ステータスを変更しました");
}

// クリップボードにコピーされた招待文から URL のパス部分を取り出す
async function readInvitationPath(page: Page): Promise<string> {
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const url = clip.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`招待リンクを取得できませんでした: ${clip}`);
  return new URL(url).pathname;
}

// ゲスト招待リンクを発行して /i/{token} のパスを返す
export async function inviteGuest(
  page: Page,
  eventId: string,
  guestName?: string,
): Promise<string> {
  await page.goto(`/events/${eventId}/invitations`);
  // ヘッダーと空状態 CTA の 2 箇所に同名ボタンがあるため first で拾う
  await page.getByRole("button", { name: "ゲストを招待" }).first().click();
  const dialog = page.getByRole("dialog");
  if (guestName) {
    await dialog.getByLabel("ゲスト名（任意）").fill(guestName);
  }
  await dialog.getByRole("button", { name: "発行してコピー" }).click();
  await expectToast(page, /招待リンクをコピーしました/);
  return readInvitationPath(page);
}

// 出演者招待リンクを発行して /join/{token} のパスを返す
export async function invitePerformer(
  page: Page,
  eventId: string,
  displayName: string,
): Promise<string> {
  await page.goto(`/events/${eventId}/members`);
  await page.getByRole("button", { name: "出演者を招待" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("表示名").fill(displayName);
  await dialog.getByRole("button", { name: "発行してコピー" }).click();
  await expectToast(page, /招待リンクをコピーしました/);
  return readInvitationPath(page);
}

export type GuestResponse = {
  name: string;
  email: string;
  attendance: "accept" | "decline";
  companions?: string[];
  afterParty?: boolean;
  afterPartyCompanions?: string[];
  payment?: "prepaid" | "onsite";
};

// 招待ページの回答フォームを入力する（送信はしない）。
// 出欠・懇親会・支払い方法の radio は sr-only input でアクセシブルネームを
// 持たないため、ラベルテキストのクリックで選択する
export async function fillGuestResponse(page: Page, response: GuestResponse) {
  const toggle = page.getByRole("button", { name: "回答を変更する" });
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
  const form = page.locator("form").filter({ hasText: "発表会の出欠" });
  await form.getByLabel("お名前").fill(response.name);
  await form.getByLabel("メールアドレス").fill(response.email);
  await form
    .getByText(response.attendance === "accept" ? "出席します" : "辞退します", {
      exact: true,
    })
    .click();
  for (const [index, companion] of (response.companions ?? []).entries()) {
    await form.getByRole("button", { name: "同伴者を追加" }).click();
    await form.getByPlaceholder(`同伴者 ${index + 1} のお名前`).fill(companion);
  }
  if (response.afterParty !== undefined) {
    await form
      .getByText(response.afterParty ? "参加します" : "参加しません", {
        exact: true,
      })
      .click();
  }
  for (const companion of response.afterPartyCompanions ?? []) {
    await form.getByLabel(companion).check();
  }
  if (response.payment) {
    await form
      .getByText(
        response.payment === "prepaid"
          ? "事前支払い（オンライン決済）"
          : "当日支払い",
        { exact: true },
      )
      .click();
  }
}

export async function submitGuestResponse(page: Page) {
  await page
    .getByRole("button", { name: /回答を(送信|変更)する/ })
    .last()
    .click();
}

export async function respondAsGuest(
  page: Page,
  invitationPath: string,
  response: GuestResponse,
) {
  await page.goto(invitationPath);
  await fillGuestResponse(page, response);
  await submitGuestResponse(page);
  await expectToast(page, "回答を受け取りました");
}

// 初回回答後に出る PWA インストールバナーが操作を遮らないよう閉じる
export async function dismissPwaBanner(page: Page) {
  const banner = page.getByTestId("pwa-install-banner");
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "あとで" }).click();
  }
}

// ゲスト管理ページ上段のサマリセル（値が上・ラベルが下の DOM 順）を検証する。
// ラベル文字列は一覧セクション見出しと重複しうるため先頭一致で拾う
export async function expectInvitationStat(
  page: Page,
  label: string,
  value: string,
) {
  const stat = page
    .getByText(label, { exact: true })
    .first()
    .locator("xpath=preceding-sibling::*[1]");
  await expect(stat).toHaveText(value);
}

// 招待一覧の行（li 要素）を名前で特定する
export function invitationRow(page: Page, guestName: string) {
  return page.getByRole("listitem").filter({ hasText: guestName });
}

// 行メニューから項目を選び、確認ダイアログ（alertdialog）で実行する
export async function runInvitationAction(
  page: Page,
  guestName: string,
  menuLabel: string,
  confirmLabel: string,
) {
  await invitationRow(page, guestName).getByLabel("操作メニュー").click();
  await page.getByRole("menuitem", { name: menuLabel }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: confirmLabel, exact: true })
    .click();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
