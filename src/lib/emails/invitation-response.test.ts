import { describe, expect, it } from "vitest";
import { calcBilling } from "@/lib/payment";
import { buildInvitationResponseMail } from "./invitation-response";

const baseInput = {
  eventName: "春の発表会",
  guestName: "山田花子",
  guestEmail: "hanako@example.com",
  attendance: "accepted" as const,
  prevStatus: "pending" as const,
  companionNames: ["山田太郎"],
  invitationUrl: "https://example.com/i/token123",
};

const billing = calcBilling(
  { attendanceFee: 500, afterPartyEnabled: true, afterPartyFee: 1000 },
  {
    status: "accepted",
    companionCount: 1,
    afterPartyAttendance: "attending",
    afterPartyCompanionCount: 1,
  },
);

describe("buildInvitationResponseMail - 懇親会・請求", () => {
  it("懇親会参加と請求内訳・合計・支払い案内が本文に含まれる", () => {
    const mail = buildInvitationResponseMail({
      ...baseInput,
      afterParty: {
        attendance: "attending",
        totalCount: 2,
        venue: "カフェ・ルル",
        startTime: "18:30",
      },
      billing,
      paymentMethod: "onsite",
      paymentNote: "お釣りのないようご準備ください",
    });

    expect(mail.text).toContain("- 懇親会: 参加（2名）");
    expect(mail.text).toContain("- 懇親会会場: カフェ・ルル 18:30〜");
    expect(mail.text).toContain("- 参加費: ¥500 × 2名 = ¥1,000");
    expect(mail.text).toContain("- 懇親会費: ¥1,000 × 2名 = ¥2,000");
    expect(mail.text).toContain("- 合計: ¥3,000");
    expect(mail.text).toContain("当日、受付にてお支払いください。");
    expect(mail.text).toContain("お釣りのないようご準備ください");
  });

  it("prepaid 選択時はオンライン決済の導線を案内する", () => {
    const mail = buildInvitationResponseMail({
      ...baseInput,
      billing,
      paymentMethod: "prepaid",
    });
    expect(mail.text).toContain("オンラインで支払う");
  });

  it("支払済みなら支払い導線を出さず確認済みと案内する", () => {
    const mail = buildInvitationResponseMail({
      ...baseInput,
      billing,
      paymentMethod: "prepaid",
      paymentNote: "当日案内",
      paid: true,
    });
    expect(mail.text).toContain("お支払いは確認済みです。");
    expect(mail.text).not.toContain("オンラインで支払う");
    expect(mail.text).not.toContain("当日案内");
  });

  it("請求額 0 なら請求・支払いセクション自体が出ない", () => {
    const zeroBilling = calcBilling(
      { attendanceFee: 0, afterPartyEnabled: false, afterPartyFee: 0 },
      {
        status: "accepted",
        companionCount: 0,
        afterPartyAttendance: null,
        afterPartyCompanionCount: 0,
      },
    );
    const mail = buildInvitationResponseMail({
      ...baseInput,
      billing: zeroBilling,
    });
    expect(mail.text).not.toContain("■ ご請求");
    expect(mail.text).not.toContain("■ お支払い");
  });

  it("懇親会未回答（null）なら懇親会の行が出ない（後方互換）", () => {
    const mail = buildInvitationResponseMail(baseInput);
    expect(mail.text).not.toContain("懇親会");
  });
});
