import type { InvitationStatus } from "@/db/schema";

export type InvitationResponseMailInput = {
  eventName: string;
  guestName: string;
  guestEmail: string;
  attendance: Exclude<InvitationStatus, "pending">;
  prevStatus: InvitationStatus;
  companionNames: string[];
  invitationUrl: string;
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
    `- 出欠: ${attendance === "accepted" ? "出席" : "辞退"}`,
    `- お名前: ${guestName}`,
    `- メール: ${guestEmail}`,
  ];

  if (attendance === "accepted") {
    const companionsLabel =
      companionNames.length > 0 ? companionNames.join("、") : "なし";
    responseLines.push(`- 同伴者: ${companionsLabel}`);
  }

  const text = [
    `${guestName} 様`,
    "",
    lead,
    "",
    "■ 回答内容",
    ...responseLines,
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
