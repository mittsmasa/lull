import "server-only";

import { and, eq, sql } from "drizzle-orm";
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
  /** payment_status が paid ではない */
  | "not_paid"
  | "no_invitation_id"
  | "invitation_not_found"
  /** セッションが期待した招待のものではない */
  | "invitation_mismatch";

/** 入金記録済みとみなせる結果か（呼び出し側の分岐用） */
export function isPaymentSettled(result: RecordCheckoutPaymentResult): boolean {
  return result === "recorded" || result === "already_recorded";
}

/**
 * 入金記録済みセッション ID リスト（",cs_a,cs_b," 形式）に含まれるか。
 *
 * 差額決済により 1 招待が複数の Checkout セッションを持ちうるため、
 * 「この招待は支払済みか」ではなく「このセッションを記録済みか」で冪等性を取る。
 * 区切りのカンマごと検索するため、ID の前方一致では誤判定しない
 */
export function isCheckoutSessionSettled(
  settledIds: string | null,
  sessionId: string,
): boolean {
  return (settledIds ?? "").includes(`,${sessionId},`);
}

/**
 * 完了した Checkout セッションから招待の入金を記録する。
 *
 * webhook（checkout.session.completed / async_payment_succeeded）と、
 * 決済完了後に招待状ページへ戻ってきたときの確認処理の共通実装。
 * webhook が届かない・遅延する環境でも決済がゲストに反映されるよう、
 * 両経路から同じ処理を呼べるようにしてある（Stripe 推奨の二重フルフィルメント）。
 *
 * 受領額は上書きせず加算する（差額決済で 1 招待が複数回決済されるため）。
 * 冪等性は「このセッション ID が settled リストに無い行だけを更新する条件付き
 * UPDATE」で担保するため、webhook と成功ページの確認が同時に走っても
 * 二重加算は起きない。
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

  // 同一セッションの再送・二重配信への冪等性（下の条件付き UPDATE と二重の防御）
  if (
    isCheckoutSessionSettled(invitation.settledCheckoutSessionIds, session.id)
  ) {
    return "already_recorded";
  }

  // JPY はゼロ小数通貨のため amount_total は円の整数値がそのまま届く
  // （100 で割る変換は不要）。paid_amount には額面どおり加算する
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
  const receivedTotal = (invitation.paidAmount ?? 0) + amountTotal;
  if (receivedTotal !== billing.total) {
    console.warn(
      `[stripe-payment] amount mismatch for invitation ${invitationId}: received ${receivedTotal} (this session ${amountTotal}), current billing ${billing.total} (session ${session.id})`,
    );
  }

  const now = Date.now();
  const updated = await db
    .update(invitations)
    .set({
      // 受領額は累計なので、日時も最後に受領した時刻に合わせる
      // （「この時点で合計 ¥X を受領済み」と読める組み合わせにする）
      paidAt: now,
      paidMethod: "stripe",
      paidAmount: sql`coalesce(${invitations.paidAmount}, 0) + ${amountTotal}`,
      stripeCheckoutSessionId: session.id,
      settledCheckoutSessionIds: sql`coalesce(${invitations.settledCheckoutSessionIds}, ',') || ${`${session.id},`}`,
    })
    // このセッションをまだ記録していない行だけを更新する。webhook と成功ページ
    // からの確認が同時に走っても、後着は 0 行更新となり二重加算にならない
    .where(
      and(
        eq(invitations.id, invitation.id),
        sql`instr(coalesce(${invitations.settledCheckoutSessionIds}, ','), ${`,${session.id},`}) = 0`,
      ),
    )
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
