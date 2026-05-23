import "server-only";

import { Resend } from "resend";

const DEFAULT_FROM = "Lull <invitation@lull.live>";

let cachedClient: Resend | null = null;

function getClient(apiKey: string): Resend {
  if (!cachedClient) {
    cachedClient = new Resend(apiKey);
  }
  return cachedClient;
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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? DEFAULT_FROM;

  if (!apiKey) {
    // 本番では設定漏れに即時気付くよう fail-fast し、PII を含む本文を
    // ログに残さない。dev / test では fallback として宛先と件名のみ出す
    // （本文は出さない）
    if (process.env.NODE_ENV === "production") {
      throw new Error("[mailer] RESEND_API_KEY is required in production");
    }
    console.info(
      `[mailer] would send (RESEND_API_KEY not set) to=${to} subject=${subject}`,
    );
    return;
  }

  const client = getClient(apiKey);
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
