"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as z from "zod";
import { db } from "@/db";
import { companions, invitations } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { buildInvitationResponseMail } from "@/lib/emails/invitation-response";
import { MailerConfigError, sendMail } from "@/lib/mailer";
import {
  BILLING_REDUCTION_BLOCKED_MESSAGE,
  calcBilling,
  calcChangeFloor,
} from "@/lib/payment";
import { getConsumedSeats } from "@/lib/queries/invitations";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import {
  type CheckoutSessionResult,
  createInvitationCheckoutSession,
  syncCheckoutPayment,
} from "@/lib/stripe-checkout";
import { isCheckoutSessionSettled } from "@/lib/stripe-payment";

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
    with: {
      event: true,
      // 変更前の請求額を出すため、懇親会の参加状況まで取る
      companions: { columns: { id: true, afterPartyAttending: true } },
    },
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

  // ------------------------------------------------------------
  // 減額方向の変更はセルフサービスで受け付けない
  // ------------------------------------------------------------
  //
  // 増額（同伴者追加・懇親会参加への変更など）は差額決済で解消できるが、
  // 減額は返金・キャンセル対応を伴うため主催者の判断が要る。
  // 下限は「変更前の請求額」と「受領額」の大きい方（= calcChangeFloor）。
  // 初回回答（pending）と会費 0 円のイベントでは下限が 0 になるため素通りする
  const currentBilling = calcBilling(
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
  const changeFloor = calcChangeFloor(invitation, currentBilling.total);
  if (billing.total < changeFloor) {
    return { error: BILLING_REDUCTION_BLOCKED_MESSAGE };
  }

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

  // 未決済のまま残っている Checkout セッション（あれば失効させる対象）。
  // 決済済みのセッション ID は監査用の保存値なので触らない
  const pendingSessionId =
    invitation.stripeCheckoutSessionId &&
    !isCheckoutSessionSettled(
      invitation.settledCheckoutSessionIds,
      invitation.stripeCheckoutSessionId,
    )
      ? invitation.stripeCheckoutSessionId
      : null;

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
    // 未決済の Checkout セッションは回答変更で請求額が変わり得るため ID をクリアし、
    // トランザクション成功後に expire する。
    // 入金記録済みのセッション ID は監査用にそのまま残す
    await tx
      .update(invitations)
      .set({
        ...guestInfo,
        status: attendance,
        afterPartyAttendance,
        paymentMethod,
        respondedAt: Date.now(),
        ...(pendingSessionId ? { stripeCheckoutSessionId: null } : {}),
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

  // 未決済の古い Checkout セッションを失効させる（古い金額では支払えないように）。
  // expire の失敗は回答処理を止めない（webhook の金額照合・差額表示が後段の防御）
  if (pendingSessionId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        await stripe.checkout.sessions.expire(pendingSessionId);
      } catch (err) {
        console.error(
          `[respondToInvitation] failed to expire checkout session ${pendingSessionId} for invitation ${invitation.id}`,
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

/**
 * ゲスト自身が招待状ページから支払うための Checkout セッションを生成する。
 * 生成条件の検証はすべて共通実装側に持たせている。
 */
export async function createCheckoutSession(
  token: string,
): Promise<CheckoutSessionResult> {
  const result = await createInvitationCheckoutSession(token);

  // 支払い済みが判明して入金を記録した場合は表示を更新する
  if ("paid" in result) {
    const invitation = await db.query.invitations.findFirst({
      where: eq(invitations.token, token),
      columns: { eventId: true },
    });
    revalidatePath(`/i/${token}`);
    if (invitation) {
      revalidatePath(`/events/${invitation.eventId}/invitations`);
    }
  }

  return result;
}

// ============================================================
// 決済完了後の入金確認（webhook のフォールバック）
// ============================================================

export type ConfirmPaymentResult = { paid: boolean };

/**
 * Checkout から招待状ページへ戻ってきた直後に、セッションの状態を Stripe に
 * 直接問い合わせて入金を記録する。
 *
 * 入金反映を webhook だけに依存すると、webhook の設定漏れ・配信失敗・遅延で
 * 「Stripe 上は決済成功なのに招待状には支払いボタンが出続ける」状態になる。
 * success_url の `session_id` を使ってこちらからも確認することで、
 * webhook が届かなくてもゲストの画面が正しくなるようにする（記録処理は冪等）。
 */
export async function confirmCheckoutPayment(
  token: string,
  sessionId: string,
): Promise<ConfirmPaymentResult> {
  const invitation = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
    columns: {
      id: true,
      eventId: true,
      paidAt: true,
      settledCheckoutSessionIds: true,
    },
  });
  if (!invitation) return { paid: false };
  // 「支払済みか」ではなく「このセッションを記録済みか」で判定する。
  // 差額決済では 1 回目の受領があるまま 2 回目の決済から戻ってくる
  if (isCheckoutSessionSettled(invitation.settledCheckoutSessionIds, sessionId))
    return { paid: true };

  const paid = await syncCheckoutPayment(invitation.id, sessionId);
  if (paid) {
    revalidatePath(`/i/${token}`);
    revalidatePath(`/events/${invitation.eventId}/invitations`);
  }

  return { paid };
}
