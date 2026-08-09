import { describe, expect, it } from "vitest";
import { calcBilling } from "@/lib/payment";
import { buildPaymentCompletedMail } from "./payment-completed";

const baseInput = {
  eventName: "春の発表会",
  guestName: "山田花子",
  paidAmount: 3000,
  paidMethod: "stripe" as const,
  // JST 2026/03/15 14:00
  paidAt: Date.UTC(2026, 2, 15, 5, 0),
  invitationUrl: "https://example.com/i/token123",
};

/** 参加費 500 × 2名 + 懇親会費 1000 × 2名 = 3000 */
const billing = calcBilling(
  { attendanceFee: 500, afterPartyEnabled: true, afterPartyFee: 1000 },
  {
    status: "accepted",
    companionCount: 1,
    afterPartyAttendance: "attending",
    afterPartyCompanionCount: 1,
  },
);

describe("buildPaymentCompletedMail", () => {
  it("件名にイベント名が入る", () => {
    const mail = buildPaymentCompletedMail(baseInput);
    expect(mail.subject).toBe("[Lull]「春の発表会」のお支払いを承りました");
  });

  it("件名・本文からイベント名の CR/LF/Tab を除去する", () => {
    const mail = buildPaymentCompletedMail({
      ...baseInput,
      eventName: "春の\r\n発表会\tBcc: attacker@example.com",
    });
    expect(mail.subject).not.toMatch(/[\r\n\t]/);
    expect(mail.subject).toBe(
      "[Lull]「春の 発表会 Bcc: attacker@example.com」のお支払いを承りました",
    );
  });

  it("受領額・支払い方法・受領日時・招待状 URL が本文に含まれる", () => {
    const mail = buildPaymentCompletedMail(baseInput);
    expect(mail.text).toContain("山田花子 様");
    expect(mail.text).toContain("- 受領額: ¥3,000");
    expect(mail.text).toContain("- お支払い方法: オンライン決済");
    expect(mail.text).toContain("- 受領日時: 2026/03/15 14:00");
    expect(mail.text).toContain("https://example.com/i/token123");
  });

  it("受領日時を JST で表示する（実行環境のタイムゾーンに依存しない）", () => {
    const mail = buildPaymentCompletedMail({
      ...baseInput,
      // UTC では 2026/03/15 23:30、JST では翌日 08:30
      paidAt: Date.UTC(2026, 2, 15, 23, 30),
    });
    expect(mail.text).toContain("- 受領日時: 2026/03/16 08:30");
  });

  it("受領額と請求合計が一致すれば内訳を載せる", () => {
    const mail = buildPaymentCompletedMail({ ...baseInput, billing });
    expect(mail.text).toContain("■ 内訳");
    expect(mail.text).toContain("- 参加費: ¥500 × 2名 = ¥1,000");
    expect(mail.text).toContain("- 懇親会費: ¥1,000 × 2名 = ¥2,000");
  });

  it("受領額と請求合計が一致しなければ内訳を載せない", () => {
    // 決済後に同伴者が増えた等で現請求額が動いたケース
    const mail = buildPaymentCompletedMail({
      ...baseInput,
      paidAmount: 2000,
      billing,
    });
    expect(mail.text).not.toContain("■ 内訳");
    expect(mail.text).toContain("- 受領額: ¥2,000");
  });

  it("billing が無ければ内訳を載せない", () => {
    const mail = buildPaymentCompletedMail(baseInput);
    expect(mail.text).not.toContain("■ 内訳");
  });

  it("内訳が 1 行だけなら受領額の再掲になるため載せない", () => {
    const attendanceOnly = calcBilling(
      { attendanceFee: 1500, afterPartyEnabled: false, afterPartyFee: 0 },
      {
        status: "accepted",
        companionCount: 0,
        afterPartyAttendance: null,
        afterPartyCompanionCount: 0,
      },
    );
    const mail = buildPaymentCompletedMail({
      ...baseInput,
      paidAmount: 1500,
      billing: attendanceOnly,
    });
    expect(mail.text).not.toContain("■ 内訳");
  });

  it("現金受領でも方法ラベルが正しく出る", () => {
    const mail = buildPaymentCompletedMail({
      ...baseInput,
      paidMethod: "cash",
    });
    expect(mail.text).toContain("- お支払い方法: 現金");
  });
});
