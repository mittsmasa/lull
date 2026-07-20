"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type Stripe from "stripe";
import * as z from "zod";
import { db } from "@/db";
import { companions, invitations } from "@/db/schema";
import { buildInvitationResponseMail } from "@/lib/emails/invitation-response";
import { MailerConfigError, sendMail } from "@/lib/mailer";
import { calcBilling } from "@/lib/payment";
import { getConsumedSeats } from "@/lib/queries/invitations";
import { getStripe, isStripeEnabled } from "@/lib/stripe";

function getBaseUrl(): string {
  // 明示設定（trim 後の非空）が最優先
  const explicit =
    process.env.APP_PUBLIC_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (explicit) return explicit;
  // Vercel の preview deploy 等では VERCEL_BRANCH_URL / VERCEL_URL を使う
  // （src/lib/auth.ts の組み立て方と揃える）
  const vercelHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}

// NOTE: 成功時は undefined を返す（既存パターンに統一）
export type ResponseActionState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
    }
  | undefined;

const companionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  afterPartyAttending: z.boolean().optional().default(false),
});

const responseSchema = z
  .object({
    guestName: z.string().trim().min(1).max(100),
    guestEmail: z.string().trim().email(),
    attendance: z.enum(["accepted", "declined"]),
    companions: z.array(companionSchema).max(4).optional().default([]),
    afterPartyAttendance: z
      .enum(["attending", "declined"])
      .nullable()
      .optional()
      .default(null),
    paymentMethod: z
      .enum(["prepaid", "onsite"])
      .nullable()
      .optional()
      .default(null),
  })
  .superRefine((data, ctx) => {
    if (data.attendance === "declined" && data.companions.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "辞退の場合、同伴者は入力できません",
        path: ["companions"],
      });
    }
    if (
      data.attendance === "declined" &&
      data.afterPartyAttendance === "attending"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "辞退の場合、懇親会には参加できません",
        path: ["afterPartyAttendance"],
      });
    }
  });

export async function respondToInvitation(
  token: string,
  data: {
    guestName: string;
    guestEmail: string;
    attendance: string;
    companions: { name: string; afterPartyAttending?: boolean }[];
    afterPartyAttendance?: string | null;
    paymentMethod?: string | null;
  },
): Promise<ResponseActionState> {
  const invitation = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
    with: { event: true, companions: { columns: { id: true } } },
  });

  if (!invitation) {
    return { error: "招待が見つかりません" };
  }

  const { event } = invitation;

  // イベントステータスチェック
  if (event.status === "draft") {
    return { error: "現在準備中です" };
  }
  if (event.status === "finished") {
    return { error: "この招待リンクは期限切れです" };
  }

  // 無効化チェック
  if (invitation.invalidatedAt) {
    if (invitation.status !== "accepted") {
      return { error: "この招待リンクは無効です" };
    }
    return { error: "この招待は変更できません" };
  }

  // 回答変更の制約チェック
  if (invitation.status !== "pending") {
    if (event.status !== "published") {
      return { error: "回答の変更期間は終了しました" };
    }
  } else {
    if (event.status !== "published" && event.status !== "ongoing") {
      return { error: "現在回答を受け付けていません" };
    }
  }

  // バリデーション
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "入力内容を確認してください", fieldErrors };
  }

  // 編集時の guestEmail 改ざん防止
  // 初回回答後は宛先メールアドレスを変更不可とし、招待トークンを使った
  // 任意宛先への通知メール送信（spam relay）を防ぐ。
  // 既存値が null のケース（admin 代理操作などで status だけ進められた場合）
  // でも変更不可とする
  if (
    invitation.status !== "pending" &&
    invitation.guestEmail !== parsed.data.guestEmail
  ) {
    return {
      error: "入力内容を確認してください",
      fieldErrors: { guestEmail: "メールアドレスは変更できません" },
    };
  }

  const {
    attendance,
    companions: companionEntries,
    ...guestInfo
  } = parsed.data;
  const prevStatus = invitation.status;

  // ------------------------------------------------------------
  // 懇親会・支払い方法の正規化とバリデーション
  // ------------------------------------------------------------

  // 欠席（declined）は懇親会・支払い方法を未回答扱いに戻す。
  // 懇親会が無効なイベントでは入力自体を受理しない
  const afterPartyAttendance =
    attendance === "accepted" && event.afterPartyEnabled
      ? parsed.data.afterPartyAttendance
      : null;

  // 懇親会有効時、出席者には懇親会の回答を求める
  if (
    attendance === "accepted" &&
    event.afterPartyEnabled &&
    afterPartyAttendance === null
  ) {
    return {
      error: "入力内容を確認してください",
      fieldErrors: {
        afterPartyAttendance: "懇親会の参加可否を選択してください",
      },
    };
  }

  // 本人が懇親会参加でない場合、同伴者だけの参加はできない（全件 false に強制）
  const normalizedCompanions = companionEntries.map((c) => ({
    name: c.name,
    afterPartyAttending:
      afterPartyAttendance === "attending" && c.afterPartyAttending,
  }));

  const billing = calcBilling(
    {
      attendanceFee: event.attendanceFee,
      afterPartyEnabled: event.afterPartyEnabled,
      afterPartyFee: event.afterPartyFee,
    },
    {
      status: attendance,
      companionCount: normalizedCompanions.length,
      afterPartyAttendance,
      afterPartyCompanionCount: normalizedCompanions.filter(
        (c) => c.afterPartyAttending,
      ).length,
    },
  );

  // 請求額 0 なら支払い方法は不要（指定されていても無視）
  const paymentMethod = billing.total > 0 ? parsed.data.paymentMethod : null;

  if (billing.total > 0) {
    if (paymentMethod === null) {
      return {
        error: "入力内容を確認してください",
        fieldErrors: { paymentMethod: "お支払い方法を選択してください" },
      };
    }
    // 事前支払いは Stripe 設定済みの環境でのみ選択できる
    if (paymentMethod === "prepaid" && !isStripeEnabled()) {
      return {
        error: "入力内容を確認してください",
        fieldErrors: {
          paymentMethod: "オンライン決済は現在ご利用いただけません",
        },
      };
    }
  }

  // DB 更新（トランザクションで座席競合を防止）
  const txError = await db.transaction(async (tx) => {
    // accepted の場合: 座席枠チェック
    if (attendance === "accepted" && event.totalSeats > 0) {
      const consumed = await getConsumedSeats(event.id);
      const currentCompanionCount =
        invitation.status === "accepted" ? invitation.companions.length : 0;
      const selfSeats =
        invitation.status === "accepted" ? 1 + currentCompanionCount : 0;
      const remaining = event.totalSeats - consumed + selfSeats;
      const needed = 1 + normalizedCompanions.length;
      if (remaining < needed) {
        return "満席のため出席回答を受け付けられません";
      }
    }

    // 既存の同伴者を削除
    await tx
      .delete(companions)
      .where(eq(companions.invitationId, invitation.id));

    // 招待ステータス更新。
    // 入金記録（paidAt / paidMethod / paidAmount）には一切触れない（受領記録は不変）。
    // 未払いの Checkout セッションは回答変更で請求額が変わり得るため ID をクリアし、
    // トランザクション成功後に expire する
    const shouldExpireSession =
      invitation.paidAt === null && invitation.stripeCheckoutSessionId !== null;
    await tx
      .update(invitations)
      .set({
        ...guestInfo,
        status: attendance,
        afterPartyAttendance,
        paymentMethod,
        respondedAt: Date.now(),
        ...(shouldExpireSession ? { stripeCheckoutSessionId: null } : {}),
        ...(attendance === "declined"
          ? { checkedIn: false, checkedInAt: null }
          : {}),
      })
      .where(eq(invitations.id, invitation.id));

    // accepted の場合: 同伴者を登録
    if (attendance === "accepted" && normalizedCompanions.length > 0) {
      await tx.insert(companions).values(
        normalizedCompanions.map((c) => ({
          invitationId: invitation.id,
          name: c.name,
          afterPartyAttending: c.afterPartyAttending,
        })),
      );
    }

    return undefined;
  });

  if (txError) {
    return { error: txError };
  }

  // 未払いの古い Checkout セッションを失効させる（古い金額では支払えないように）。
  // expire の失敗は回答処理を止めない（webhook の金額照合・差額表示が後段の防御）
  if (
    invitation.paidAt === null &&
    invitation.stripeCheckoutSessionId !== null
  ) {
    const stripe = getStripe();
    if (stripe) {
      try {
        await stripe.checkout.sessions.expire(
          invitation.stripeCheckoutSessionId,
        );
      } catch (err) {
        console.error(
          `[respondToInvitation] failed to expire checkout session ${invitation.stripeCheckoutSessionId} for invitation ${invitation.id}`,
          err,
        );
      }
    }
  }

  const mail = buildInvitationResponseMail({
    eventName: event.name,
    guestName: guestInfo.guestName,
    guestEmail: guestInfo.guestEmail,
    attendance,
    prevStatus,
    companionNames:
      attendance === "accepted" ? normalizedCompanions.map((c) => c.name) : [],
    invitationUrl: `${getBaseUrl()}/i/${token}`,
    afterParty:
      attendance === "accepted" && afterPartyAttendance
        ? {
            attendance: afterPartyAttendance,
            totalCount:
              1 +
              normalizedCompanions.filter((c) => c.afterPartyAttending).length,
            venue: event.afterPartyVenue,
            startTime: event.afterPartyStartTime,
          }
        : null,
    billing,
    paymentMethod,
    paymentNote: event.paymentNote,
    paid: invitation.paidAt !== null,
  });
  // レスポンス返却後に走らせる（serverless 環境で fire-and-forget が
  // 切られる挙動を避ける）
  after(async () => {
    try {
      await sendMail({ to: guestInfo.guestEmail, ...mail });
    } catch (err) {
      console.error("[respondToInvitation] failed to send mail", err);
      // 設定漏れ系は監視で拾えるよう Next.js runtime に伝播させる
      if (err instanceof MailerConfigError) {
        throw err;
      }
    }
  });

  revalidatePath(`/i/${token}`);
  revalidatePath(`/events/${event.id}/invitations`);
}

// ============================================================
// Stripe Checkout セッション生成
// ============================================================

export type CheckoutSessionResult = { url: string } | { error: string };

const CHECKOUT_UNAVAILABLE_ERROR =
  "決済ページを開けませんでした。時間をおいて再試行してください";

export async function createCheckoutSession(
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

  // ガード: 支払済み・事前支払い以外は生成不可
  if (invitation.paidAt !== null) {
    return { error: "すでにお支払い済みです" };
  }
  if (invitation.paymentMethod !== "prepaid") {
    return { error: "オンライン決済が選択されていません" };
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
  if (billing.total <= 0) {
    return { error: "お支払いいただく金額はありません" };
  }

  // 既存の未払いセッションを失効させてから新規生成する（有効なセッションは常に 1 本のみ）。
  // まず旧セッションの状態を確認する — complete（支払確定済み、または PayPay 等の
  // 非同期確定待ち）のセッションは expire できず、この状態で新規セッションを作ると
  // 二重支払いの恐れがあるため生成を中断する
  if (invitation.stripeCheckoutSessionId) {
    let oldSessionStatus: string | null = null;
    try {
      const oldSession = await stripe.checkout.sessions.retrieve(
        invitation.stripeCheckoutSessionId,
      );
      oldSessionStatus = oldSession.status;
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      // セッションが存在しない（テストデータ消去等）なら旧セッションなし扱いで続行
      if (code !== "resource_missing") {
        console.error(
          `[createCheckoutSession] failed to retrieve old session ${invitation.stripeCheckoutSessionId} for invitation ${invitation.id}`,
          err,
        );
        return { error: CHECKOUT_UNAVAILABLE_ERROR };
      }
    }
    if (oldSessionStatus === "complete") {
      // 支払確定済み（webhook 反映待ち）または非同期確定待ち。
      // 反映は webhook に任せ、ここでは新規セッションを作らない
      return {
        error:
          "お支払いの確認処理中です。しばらくしてからページを再読み込みしてください",
      };
    }
    if (oldSessionStatus === "open") {
      // expire に失敗した場合は新規生成を中断する — 続行すると古い金額のセッションが
      // 生き残り、過少支払いの抜け穴になるため（安全側に倒す）
      try {
        await stripe.checkout.sessions.expire(
          invitation.stripeCheckoutSessionId,
        );
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
            `[createCheckoutSession] failed to expire old session ${invitation.stripeCheckoutSessionId} for invitation ${invitation.id}`,
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
  // （USD/EUR 前提の amount * 100 をすると請求額が 100 倍になる）
  const lineItems = [
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
  ].filter((item) => item.price_data.unit_amount > 0 && item.quantity > 0);

  let sessionUrl: string;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // コンビニ等の遅延決済（payment_status: unpaid のまま completed 発火）を
      // 排除するため即時決済手段のみに明示制限する。
      // "paypay" は API では有効だが SDK の型 union に未収載のためアサーションで補う
      // https://docs.stripe.com/payments/paypay/accept-a-payment
      payment_method_types: [
        "card",
        "paypay",
      ] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
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
        `[createCheckoutSession] session created without url for invitation ${invitation.id}`,
      );
      return { error: CHECKOUT_UNAVAILABLE_ERROR };
    }
    // 新セッションの ID を保存（失効管理・webhook 冪等性のため）
    await db
      .update(invitations)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(invitations.id, invitation.id));
    sessionUrl = session.url;
  } catch (err) {
    console.error(
      `[createCheckoutSession] failed to create session for invitation ${invitation.id}`,
      err,
    );
    return { error: CHECKOUT_UNAVAILABLE_ERROR };
  }

  return { url: sessionUrl };
}
