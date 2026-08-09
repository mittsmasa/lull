export type SentMail = { to: string; subject: string; text: string };

/**
 * setup.ts の `@/lib/mailer` モックが記録した送信内容。
 * 記録先を globalThis にしている理由は setup.ts のコメントを参照
 */
export function sentMails(): SentMail[] {
  const g = globalThis as { __sentMails?: SentMail[] };
  return g.__sentMails ?? [];
}

/** 直前のテストの送信記録を捨てる（検証前の地ならし用） */
export function clearSentMails(): void {
  const g = globalThis as { __sentMails?: SentMail[] };
  g.__sentMails = [];
}
