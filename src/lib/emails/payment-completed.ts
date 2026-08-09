import type { PaidMethod } from "@/db/schema";
import { formatEpochDatetime } from "@/lib/format";
import { type Billing, formatYen, PAID_METHOD_LABELS } from "@/lib/payment";

export type PaymentCompletedMailInput = {
  eventName: string;
  guestName: string;
  /** 実際に受領した金額（invitations.paid_amount） */
  paidAmount: number;
  paidMethod: PaidMethod;
  /** 受領日時（epoch ミリ秒） */
  paidAt: number;
  invitationUrl: string;
  /**
   * 受領時点の請求内訳。受領額と合計が一致する場合のみ本文に載せる。
   * 決済後に回答が変更されると現請求額は動くため、控えとして正しいのは受領額の方
   */
  billing?: Billing | null;
};

export type PaymentCompletedMail = {
  subject: string;
  text: string;
};

export function buildPaymentCompletedMail(
  input: PaymentCompletedMailInput,
): PaymentCompletedMail {
  const {
    eventName,
    guestName,
    paidAmount,
    paidMethod,
    paidAt,
    invitationUrl,
    billing = null,
  } = input;

  // subject ヘッダのヘッダーインジェクション対策と、本文中の表示崩れ防止を
  // 兼ねて event 名から CR/LF/Tab を除去する
  const safeEventName = eventName.replace(/[\r\n\t]+/g, " ").trim();

  const subject = `[Lull]「${safeEventName}」のお支払いを承りました`;

  // 内訳は受領額と一致するときだけ。ズレたまま並べるとどちらが請求なのか
  // 読み手に判断させることになる
  const breakdownLines: string[] = [];
  if (billing && billing.total === paidAmount) {
    const rows: string[] = [];
    if (billing.attendanceSubtotal > 0) {
      rows.push(
        `- 参加費: ${formatYen(billing.attendanceFee)} × ${billing.attendeeCount}名 = ${formatYen(billing.attendanceSubtotal)}`,
      );
    }
    if (billing.afterPartySubtotal > 0) {
      rows.push(
        `- 懇親会費: ${formatYen(billing.afterPartyFee)} × ${billing.afterPartyCount}名 = ${formatYen(billing.afterPartySubtotal)}`,
      );
    }
    // 内訳が 1 行だけなら受領額の再掲にしかならないので出さない
    if (rows.length > 1) {
      breakdownLines.push("", "■ 内訳", ...rows);
    }
  }

  const text = [
    `${guestName} 様`,
    "",
    `「${safeEventName}」のお支払いを承りました。`,
    "",
    "■ お支払い",
    `- 受領額: ${formatYen(paidAmount)}`,
    `- お支払い方法: ${PAID_METHOD_LABELS[paidMethod]}`,
    `- 受領日時: ${formatEpochDatetime(paidAt)}`,
    ...breakdownLines,
    "",
    "■ 招待状",
    invitationUrl,
    "",
    "当日の受付は、招待状ページの QR コードで行います。",
    "",
    "— Lull",
  ].join("\n");

  return { subject, text };
}
