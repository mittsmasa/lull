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

  const subject =
    attendance === "accepted"
      ? `[Lull] 「${eventName}」への出席を承りました`
      : `[Lull] 「${eventName}」の辞退を承りました`;

  const lead =
    prevStatus === "pending"
      ? `「${eventName}」へのご回答を承りました。`
      : `「${eventName}」への回答内容を更新しました。`;

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
