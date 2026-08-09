import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { buildPaymentCompletedMail } from "@/lib/emails/payment-completed";
import { MailerConfigError, sendMail } from "@/lib/mailer";
import { calcBilling } from "@/lib/payment";

/**
 * 入金記録の完了をゲストに知らせる。
 *
 * 呼び出しは `recordStripeCheckoutPayment` が `"recorded"` を返したときだけ。
 * 記録は `paid_at IS NULL` 条件付き UPDATE のため、webhook と招待状ページからの
 * 確認が同時に走っても `"recorded"` はちょうど 1 回しか返らない。
 * 送信回数の制御はその一点に委ね、ここでは送信済みフラグを持たない。
 *
 * 通知は best-effort。招待が引けない等の失敗は入金記録そのものを巻き戻す理由に
 * ならないためログのみで握りつぶす（設定漏れを示す `MailerConfigError` は除く）
 */
export async function sendPaymentCompletedMail(
  invitationId: string,
): Promise<void> {
  try {
    const invitation = await db.query.invitations.findFirst({
      where: eq(invitations.id, invitationId),
      with: { event: true, companions: true },
    });

    if (!invitation) {
      console.error(
        `[payment-completed-mail] invitation ${invitationId} not found`,
      );
      return;
    }
    if (!invitation.guestEmail) {
      console.warn(
        `[payment-completed-mail] invitation ${invitationId} has no guest email, skipping`,
      );
      return;
    }
    // 記録直後の呼び出しなので通常は埋まっている。読み取り時点で欠けていれば
    // 控えとして成立しないため送らない
    if (invitation.paidAt === null || invitation.paidMethod === null) {
      console.error(
        `[payment-completed-mail] invitation ${invitationId} has no payment record`,
      );
      return;
    }

    // 受領額と一致する場合のみ本文に内訳が載る（判定は文面組み立て側）
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

    const mail = buildPaymentCompletedMail({
      eventName: invitation.event.name,
      guestName: invitation.guestName ?? "ゲスト",
      paidAmount: invitation.paidAmount ?? 0,
      paidMethod: invitation.paidMethod,
      paidAt: invitation.paidAt,
      invitationUrl: `${getBaseUrl()}/i/${invitation.token}`,
      billing,
    });

    await sendMail({ to: invitation.guestEmail, ...mail });
  } catch (err) {
    console.error(
      `[payment-completed-mail] failed to send for invitation ${invitationId}`,
      err,
    );
    // 設定漏れ系は監視で拾えるよう Next.js runtime に伝播させる
    // （回答メールと同じ扱い）
    if (err instanceof MailerConfigError) {
      throw err;
    }
  }
}
