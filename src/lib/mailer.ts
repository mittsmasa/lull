import "server-only";

import { Resend } from "resend";

const DEFAULT_FROM = "Lull <invitation@lull.live>";

// 設定漏れを呼び出し側で型分岐するための専用エラー（transient な送信失敗と
// 区別したい）
export class MailerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailerConfigError";
  }
}

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail({
  to,
  subject,
  text,
}: SendMailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  // 空文字 / 空白のみを「未設定」として扱うため `||` を使う
  const from = process.env.MAIL_FROM?.trim() || DEFAULT_FROM;

  if (!apiKey) {
    // 本番では設定漏れに fail-fast、PII を含む本文をログに残さない。
    // dev / test では宛先と件名のみ出す（本文は出さない）
    if (process.env.NODE_ENV === "production") {
      throw new MailerConfigError(
        "[mailer] RESEND_API_KEY is required in production",
      );
    }
    console.info(
      `[mailer] would send (RESEND_API_KEY not set) to=${to} subject=${subject}`,
    );
    return;
  }

  // Resend のインスタンス化は安価。シングルトンにすると key ローテーション
  // 時に古いインスタンスが残るため都度生成する
  const client = new Resend(apiKey);
  const result = await client.emails.send({
    from,
    to,
    subject,
    text,
  });

  if (result.error) {
    throw new Error(
      `[mailer] resend send failed: ${result.error.name}: ${result.error.message}`,
    );
  }
}
