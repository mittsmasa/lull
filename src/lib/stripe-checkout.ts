import "server-only";

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import {
  calcBilling,
  calcDue,
  formatYen,
  STRIPE_MIN_AMOUNT_JPY,
} from "@/lib/payment";
import { getStripe } from "@/lib/stripe";
import {
  isCheckoutSessionSettled,
  isPaymentSettled,
  recordStripeCheckoutPayment,
} from "@/lib/stripe-payment";

export type CheckoutSessionResult =
  | { url: string }
  /**
   * 直前のセッションが決済済みだったため生成せず、入金記録を反映した。
   * 反映後にまだ差額が残る場合は、呼び出し側が再表示したうえで再度生成する
   */
  | { paid: true }
  | { error: string };

const CHECKOUT_UNAVAILABLE_ERROR =
  "決済ページを開けませんでした。時間をおいて再試行してください";

/**
 * 招待の Checkout セッションを生成する。
 *
 * ゲスト自身が招待状ページから支払う経路と、受付が決済 QR を提示する経路の
 * 共通実装。どちらから呼んでも同じ success_url（招待状ページ）へ戻すため、
 * 決済後のゲストは自分の招待状に着地する。
 *
 * 有効なセッションは常に 1 本だけに保つ（旧セッションを失効させてから生成）。
 * 決済するのは「現請求額 − 受領額」の差額のため、回答変更で金額が増えた
 * 支払済みの招待でも、増えた分だけをこの経路で追加決済できる。
 * 差額が残っていない場合は生成せず、エラーまたは `{ paid: true }` を返す。
 *
 * 呼び出し側の責務: 権限チェックとイベントステータスの検証。
 */
export async function createInvitationCheckoutSession(
  token: string,
): Promise<CheckoutSessionResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { error: "オンライン決済は現在ご利用いただけません" };
  }

  const invitation = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
    with: { event: true, companions: true },
  });

  if (!invitation) {
    return { error: "招待が見つかりません" };
  }

  const { event } = invitation;

  // ガード: 無効化済み招待・回答受付外のイベントステータスでは生成不可
  if (invitation.invalidatedAt) {
    return { error: "この招待ではお支払いいただけません" };
  }
  if (event.status !== "published" && event.status !== "ongoing") {
    return { error: "現在お支払いを受け付けていません" };
  }

  // 請求額は常に現在の設定・回答から算出（保存値を信用しない）
  const billing = calcBilling(
    {
      attendanceFee: event.attendanceFee,
      afterPartyEnabled: event.afterPartyEnabled,
      afterPartyFee: event.afterPartyFee,
    },
    {
      status: invitation.status,
      companionCount: invitation.companions.length,
      afterPartyAttendance: invitation.afterPartyAttendance,
      afterPartyCompanionCount: invitation.companions.filter(
        (c) => c.afterPartyAttending,
      ).length,
    },
  );
  // 実際に決済するのは未受領分だけ（差額決済）
  const received = invitation.paidAmount ?? 0;
  const due = calcDue(invitation, billing.total);
  if (due <= 0) {
    return {
      error:
        received > 0
          ? "すでにお支払い済みです"
          : "お支払いいただく金額はありません",
    };
  }
  // Stripe Checkout (JPY) は ¥50 未満のセッション生成を拒否する。
  // 料金設定側でも防いでいるが、導入前に設定された少額料金や手動の受領記録で
  // 差額が少額になった場合に、Stripe API エラーへ落とさず案内を返す
  if (due < STRIPE_MIN_AMOUNT_JPY) {
    return {
      error: `オンライン決済は ${formatYen(STRIPE_MIN_AMOUNT_JPY)} 以上のお支払いでご利用いただけます`,
    };
  }

  // 既存の未決済セッションを失効させてから新規生成する（有効なセッションは常に 1 本のみ）。
  // 入金記録済みのセッション ID は監査用に残っているだけなので対象外にする
  // （差額決済では「支払済みのセッション」と「これから作るセッション」が併存する）
  const pendingSessionId =
    invitation.stripeCheckoutSessionId &&
    !isCheckoutSessionSettled(
      invitation.settledCheckoutSessionIds,
      invitation.stripeCheckoutSessionId,
    )
      ? invitation.stripeCheckoutSessionId
      : null;

  // まず旧セッションの状態を確認する — complete（支払確定済み、または PayPay 等の
  // 非同期確定待ち）のセッションは expire できず、この状態で新規セッションを作ると
  // 二重支払いの恐れがあるため生成を中断する
  if (pendingSessionId) {
    let oldSession: Stripe.Checkout.Session | null = null;
    try {
      oldSession = await stripe.checkout.sessions.retrieve(pendingSessionId);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      // セッションが存在しない（テストデータ消去等）なら旧セッションなし扱いで続行
      if (code !== "resource_missing") {
        console.error(
          `[createInvitationCheckoutSession] failed to retrieve old session ${pendingSessionId} for invitation ${invitation.id}`,
          err,
        );
        return { error: CHECKOUT_UNAVAILABLE_ERROR };
      }
    }
    if (oldSession?.status === "complete") {
      // 支払確定済み（webhook 未達・遅延）または非同期確定待ち。
      // webhook を待たずにこの場で入金記録を試みる — webhook が届かない環境でも
      // 「支払い済みなのに支払いボタンが出続ける」状態から復帰できるようにする
      const result = await recordStripeCheckoutPayment(oldSession, {
        expectedInvitationId: invitation.id,
      });
      if (isPaymentSettled(result)) {
        return { paid: true };
      }
      // まだ paid になっていない（非同期確定待ち）ので新規セッションは作らない
      return {
        error:
          "お支払いの確認処理中です。しばらくしてからページを再読み込みしてください",
      };
    }
    if (oldSession?.status === "open") {
      // expire に失敗した場合は新規生成を中断する — 続行すると古い金額のセッションが
      // 生き残り、過少支払いの抜け穴になるため（安全側に倒す）
      try {
        await stripe.checkout.sessions.expire(pendingSessionId);
      } catch (err) {
        // retrieve と expire の間で失効した場合の expire はエラーになるが、
        // 「有効な旧セッションが残っていない」ことは保証されるため続行してよい
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: string }).code
            : undefined;
        const alreadyExpired =
          err instanceof Error &&
          (code === "checkout_session_already_expired" ||
            /already expired/i.test(err.message));
        if (!alreadyExpired) {
          console.error(
            `[createInvitationCheckoutSession] failed to expire old session ${pendingSessionId} for invitation ${invitation.id}`,
            err,
          );
          return { error: CHECKOUT_UNAVAILABLE_ERROR };
        }
      }
    }
    // expired はそのまま続行（新規セッションを生成する）
  }

  const baseUrl = getBaseUrl();
  // JPY は Stripe のゼロ小数通貨: unit_amount には円の整数値をそのまま渡す
  // （USD/EUR 前提の amount * 100 をすると請求額が 100 倍になる）。
  //
  // 一部受領済みのときは内訳どおりの明細を組めないため（受領分がどの費目に
  // 充当されたかは持たない）、差額 1 行の明細にする
  const lineItems =
    received > 0
      ? [
          {
            price_data: {
              currency: "jpy",
              product_data: { name: `追加のお支払い（${event.name}）` },
              unit_amount: due,
            },
            quantity: 1,
          },
        ]
      : [
          {
            price_data: {
              currency: "jpy",
              product_data: { name: `参加費（${event.name}）` },
              unit_amount: billing.attendanceFee,
            },
            quantity: billing.attendeeCount,
          },
          {
            price_data: {
              currency: "jpy",
              product_data: { name: `懇親会費（${event.name}）` },
              unit_amount: billing.afterPartyFee,
            },
            quantity: billing.afterPartyCount,
          },
        ].filter(
          (item) => item.price_data.unit_amount > 0 && item.quantity > 0,
        );

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // コンビニ等の遅延決済（payment_status: unpaid のまま completed 発火）を
      // 排除するため即時決済手段のみに明示制限する。
      // "paypay" は本番アカウントで未有効化のため除外中（有効化審査の通過後に
      // 復帰させる。指定すると sessions.create が invalid で失敗する）
      // https://docs.stripe.com/payments/paypay/accept-a-payment
      payment_method_types: ["card"],
      line_items: lineItems,
      metadata: { invitationId: invitation.id },
      success_url: `${baseUrl}/i/${token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/i/${token}?payment=cancelled`,
      ...(invitation.guestEmail
        ? { customer_email: invitation.guestEmail }
        : {}),
    });
    if (!session.url) {
      console.error(
        `[createInvitationCheckoutSession] session created without url for invitation ${invitation.id}`,
      );
      return { error: CHECKOUT_UNAVAILABLE_ERROR };
    }
    // 新セッションの ID を保存（失効管理・webhook 冪等性のため）
    await db
      .update(invitations)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(invitations.id, invitation.id));
    return { url: session.url };
  } catch (err) {
    console.error(
      `[createInvitationCheckoutSession] failed to create session for invitation ${invitation.id}`,
      err,
    );
    return { error: CHECKOUT_UNAVAILABLE_ERROR };
  }
}

/**
 * 保存済みの Checkout セッションを Stripe に問い合わせ、支払い済みなら入金を記録する。
 *
 * webhook の設定漏れ・配信失敗・遅延で「Stripe 上は決済成功なのに画面に
 * 反映されない」状態を、招待状ページと受付のどちらからでも解消できるようにする。
 * 記録処理自体が冪等なため、何度呼んでも二重記録にはならない。
 *
 * @returns 入金が記録済みとみなせるか
 */
export async function syncCheckoutPayment(
  invitationId: string,
  sessionId: string,
): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return false;

  // 明らかに Checkout セッション ID でないものは Stripe に問い合わせない
  if (!sessionId.startsWith("cs_")) return false;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error(
      `[syncCheckoutPayment] failed to retrieve session ${sessionId} for invitation ${invitationId}`,
      err,
    );
    return false;
  }

  // セッションが本当にこの招待のものかは metadata で検証する
  // （招待トークンの持ち主が任意のセッション ID を渡しても他招待は書き換わらない）
  const result = await recordStripeCheckoutPayment(session, {
    expectedInvitationId: invitationId,
  });
  return isPaymentSettled(result);
}
