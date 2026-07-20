import type {
  AfterPartyAttendance,
  InvitationStatus,
  PaymentMethod,
} from "@/db/schema";
import { type Billing, formatYen } from "@/lib/payment";

export type InvitationResponseMailInput = {
  eventName: string;
  guestName: string;
  guestEmail: string;
  attendance: Exclude<InvitationStatus, "pending">;
  prevStatus: InvitationStatus;
  companionNames: string[];
  invitationUrl: string;
  /** 懇親会の回答（懇親会が無効・未回答なら null） */
  afterParty?: {
    attendance: AfterPartyAttendance;
    /** 本人 + 参加する同伴者の合計人数 */
    totalCount: number;
    venue: string | null;
    startTime: string | null;
  } | null;
  /** 請求内訳（total 0 なら支払い案内は出さない） */
  billing?: Billing | null;
  paymentMethod?: PaymentMethod | null;
  /** イベント設定の支払い案内文 */
  paymentNote?: string | null;
  /** 入金記録済みか（記録済みなら支払い導線の案内を出さない） */
  paid?: boolean;
};

export type InvitationResponseMail = {
  subject: string;
  text: string;
};

export function buildInvitationResponseMail(
  input: InvitationResponseMailInput,
): InvitationResponseMail {
  const {
    eventName,
    guestName,
    guestEmail,
    attendance,
    prevStatus,
    companionNames,
    invitationUrl,
    afterParty = null,
    billing = null,
    paymentMethod = null,
    paymentNote = null,
    paid = false,
  } = input;

  // subject ヘッダのヘッダーインジェクション対策と、本文中の表示崩れ防止を
  // 兼ねて event 名から CR/LF/Tab を除去する
  const safeEventName = eventName.replace(/[\r\n\t]+/g, " ").trim();

  const subject =
    attendance === "accepted"
      ? `[Lull] 「${safeEventName}」への出席を承りました`
      : `[Lull] 「${safeEventName}」の辞退を承りました`;

  const lead =
    prevStatus === "pending"
      ? `「${safeEventName}」へのご回答を承りました。`
      : `「${safeEventName}」への回答内容を更新しました。`;

  const responseLines = [
    `- 発表会: ${attendance === "accepted" ? "出席" : "辞退"}`,
    `- お名前: ${guestName}`,
    `- メール: ${guestEmail}`,
  ];

  if (attendance === "accepted") {
    const companionsLabel =
      companionNames.length > 0 ? companionNames.join("、") : "なし";
    responseLines.push(`- 同伴者: ${companionsLabel}`);
  }

  if (attendance === "accepted" && afterParty) {
    responseLines.push(
      afterParty.attendance === "attending"
        ? `- 懇親会: 参加（${afterParty.totalCount}名）`
        : "- 懇親会: 不参加",
    );
    if (afterParty.attendance === "attending" && afterParty.venue) {
      const startLabel = afterParty.startTime
        ? ` ${afterParty.startTime}〜`
        : "";
      responseLines.push(`- 懇親会会場: ${afterParty.venue}${startLabel}`);
    }
  }

  // 請求・支払い案内（請求がある場合のみ）
  const billingLines: string[] = [];
  if (billing && billing.total > 0) {
    billingLines.push("", "■ ご請求");
    if (billing.attendanceSubtotal > 0) {
      billingLines.push(
        `- 参加費: ${formatYen(billing.attendanceFee)} × ${billing.attendeeCount}名 = ${formatYen(billing.attendanceSubtotal)}`,
      );
    }
    if (billing.afterPartySubtotal > 0) {
      billingLines.push(
        `- 懇親会費: ${formatYen(billing.afterPartyFee)} × ${billing.afterPartyCount}名 = ${formatYen(billing.afterPartySubtotal)}`,
      );
    }
    billingLines.push(`- 合計: ${formatYen(billing.total)}`);

    billingLines.push("", "■ お支払い");
    if (paid) {
      billingLines.push("お支払いは確認済みです。");
    } else if (paymentMethod === "prepaid") {
      billingLines.push(
        "招待状ページの「オンラインで支払う」から、カードまたは PayPay でお支払いいただけます。",
      );
    } else {
      billingLines.push("当日、受付にてお支払いください。");
    }
    if (!paid && paymentNote) {
      billingLines.push(paymentNote);
    }
  }

  const text = [
    `${guestName} 様`,
    "",
    lead,
    "",
    "■ 回答内容",
    ...responseLines,
    ...billingLines,
    "",
    "■ 招待状",
    invitationUrl,
    "",
    "回答内容の変更や、当日のご案内・受付の QR コードは上記リンクからご確認いただけます。",
    "",
    "— Lull",
  ].join("\n");

  return { subject, text };
}
