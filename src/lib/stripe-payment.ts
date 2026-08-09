import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { sendPaymentCompletedMail } from "@/lib/notifications/payment-completed";
import { calcBilling } from "@/lib/payment";

/**
 * Checkout セッションのうち入金記録に必要な最小限のフィールド。
 * webhook のイベントペイロードと sessions.retrieve の戻り値の両方を受けられる形にする
 */
export type CheckoutSessionSummary = {
  id: string;
  payment_status?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string> | null;
};

export type RecordCheckoutPaymentResult =
  /** 今回の呼び出しで入金を記録した */
  | "recorded"
  /** 同一セッションで記録済み（再送・別経路との競合） */
  | "already_recorded"
  /** 別セッションで支払済み。上書きしない */
  | "duplicate_session"
  /** payment_status が paid ではない */
  | "not_paid"
  | "no_invitation_id"
  | "invitation_not_found"
  /** セッションが期待した招待のものではない */
  | "invitation_mismatch";

/** 入金記録済みとみなせる結果か（呼び出し側の分岐用） */
export function isPaymentSettled(result: RecordCheckoutPaymentResult): boolean {
  return (
    result === "recorded" ||
    result === "already_recorded" ||
    result === "duplicate_session"
  );
}

/**
 * 完了した Checkout セッションから招待の入金を記録する。
 *
 * webhook（checkout.session.completed / async_payment_succeeded）と、
 * 決済完了後に招待状ページへ戻ってきたときの確認処理の共通実装。
 * webhook が届かない・遅延する環境でも決済がゲストに反映されるよう、
 * 両経路から同じ処理を呼べるようにしてある（Stripe 推奨の二重フルフィルメント）。
 *
 * 冪等性は「paid_at が NULL の行だけを更新する条件付き UPDATE」で担保するため、
 * 両経路が同時に走っても二重記録・上書きは起きない。
 *
 * @param options.expectedInvitationId 指定時、セッションの metadata がこの招待を
 *   指していなければ記録しない（招待トークン経由の呼び出しで他招待の
 *   セッション ID を渡されても書き換わらないようにするためのガード）
 */
export async function recordStripeCheckoutPayment(
  session: CheckoutSessionSummary,
  options: { expectedInvitationId?: string } = {},
): Promise<RecordCheckoutPaymentResult> {
  // 即時決済手段限定（payment_method_types: ["card"]）のため通常ここには来ないが、
  // 遅延決済では completed が payment_status: "unpaid" のまま発火し得るため
  // 多層防御として確認する。
  // 非同期確定分は async_payment_succeeded（定義上 paid 確定）で拾う
  if (session.payment_status !== "paid") {
    return "not_paid";
  }

  const invitationId = session.metadata?.invitationId;
  if (!invitationId) {
    console.error(
      `[stripe-payment] session ${session.id} has no metadata.invitationId`,
    );
    return "no_invitation_id";
  }

  if (
    options.expectedInvitationId &&
    options.expectedInvitationId !== invitationId
  ) {
    console.error(
      `[stripe-payment] session ${session.id} belongs to invitation ${invitationId}, not ${options.expectedInvitationId}`,
    );
    return "invitation_mismatch";
  }

  const invitation = await db.query.invitations.findFirst({
    where: eq(invitations.id, invitationId),
    with: { event: true, companions: true },
  });
  // 招待が見つからない（削除済み・metadata 不整合）
  if (!invitation) {
    console.error(
      `[stripe-payment] invitation ${invitationId} not found for session ${session.id}`,
    );
    return "invitation_not_found";
  }

  if (invitation.paidAt !== null) {
    // 同一セッションの再送・二重配信への冪等性
    if (invitation.stripeCheckoutSessionId === session.id) {
      return "already_recorded";
    }
    // 支払済みの招待に別セッションの完了が届いた場合は上書きしない。
    // 二重支払いの可能性があるため監査ログに残す（返金は Stripe ダッシュボード運用）
    console.error(
      `[stripe-payment] invitation ${invitationId} is already paid (session ${invitation.stripeCheckoutSessionId}), ignoring duplicate payment session ${session.id}`,
    );
    return "duplicate_session";
  }

  // JPY はゼロ小数通貨のため amount_total は円の整数値がそのまま届く
  // （100 で割る変換は不要）。paid_amount には額面どおり記録する
  const amountTotal = session.amount_total ?? 0;

  // 現時点の請求額と照合。不一致でも額面どおり記録し、差額は管理画面・受付の
  // 差額表示で検知する（決済後に回答・設定が変わったケース等）
  const billing = calcBilling(
    {
      attendanceFee: invitation.event.attendanceFee,
      afterPartyEnabled: invitation.event.afterPartyEnabled,
      afterPartyFee: invitation.event.afterPartyFee,
    },
    {
      status: invitation.status,
      companionCount: invitation.companions.length,
      afterPartyAttendance: invitation.afterPartyAttendance,
      afterPartyCompanionCount: invitation.companions.filter(
        (companion) => companion.afterPartyAttending,
      ).length,
    },
  );
  if (amountTotal !== billing.total) {
    console.warn(
      `[stripe-payment] amount mismatch for invitation ${invitationId}: paid ${amountTotal}, current billing ${billing.total} (session ${session.id})`,
    );
  }

  const updated = await db
    .update(invitations)
    .set({
      paidAt: Date.now(),
      paidMethod: "stripe",
      paidAmount: amountTotal,
      stripeCheckoutSessionId: session.id,
    })
    // paid_at が NULL の行だけを更新する。webhook と成功ページからの確認が
    // 同時に走っても、後着は 0 行更新となり受領記録を上書きしない
    .where(and(eq(invitations.id, invitation.id), isNull(invitations.paidAt)))
    .returning({ id: invitations.id });

  // 0 行 = 直前に別経路が記録した（読み取りから UPDATE までの間の競合）
  if (updated.length === 0) {
    return "already_recorded";
  }

  // 決済完了をゲストに知らせる。
  // 通知の発火をこの関数に置くのは、記録経路が webhook・招待状ページの確認・
  // 受付の決済 QR と複数あるうえ、今後も増えうるため。呼び出し側に置くと
  // 追加のたびに通知漏れが起きる。条件付き UPDATE により "recorded" を返すのは
  // 全経路を通じて 1 回だけなので、ここに置けば二重送信も起きない
  after(() => sendPaymentCompletedMail(invitation.id));

  return "recorded";
}
