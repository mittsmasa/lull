import { describe, expect, it } from "vitest";
import {
  calcBilling,
  calcShortfall,
  formatYen,
  isFullyPaid,
  isPaid,
} from "./payment";

const settings = {
  attendanceFee: 500,
  afterPartyEnabled: true,
  afterPartyFee: 1000,
};

describe("calcBilling", () => {
  it("参加費 + 懇親会費: 本人 + 同伴者 1、全員懇親会参加 → 500×2 + 1000×2 = 3000", () => {
    const billing = calcBilling(settings, {
      status: "accepted",
      companionCount: 1,
      afterPartyAttendance: "attending",
      afterPartyCompanionCount: 1,
    });
    expect(billing).toEqual({
      attendanceFee: 500,
      attendeeCount: 2,
      attendanceSubtotal: 1000,
      afterPartyFee: 1000,
      afterPartyCount: 2,
      afterPartySubtotal: 2000,
      total: 3000,
    });
  });

  it("参加費のみ（懇親会不参加）", () => {
    const billing = calcBilling(settings, {
      status: "accepted",
      companionCount: 2,
      afterPartyAttendance: "declined",
      afterPartyCompanionCount: 0,
    });
    expect(billing.attendanceSubtotal).toBe(1500);
    expect(billing.afterPartyCount).toBe(0);
    expect(billing.total).toBe(1500);
  });

  it("懇親会費のみ（参加費 0 円）", () => {
    const billing = calcBilling(
      { ...settings, attendanceFee: 0 },
      {
        status: "accepted",
        companionCount: 0,
        afterPartyAttendance: "attending",
        afterPartyCompanionCount: 0,
      },
    );
    expect(billing.attendanceSubtotal).toBe(0);
    expect(billing.total).toBe(1000);
  });

  it("どちらも 0 円なら合計 0", () => {
    const billing = calcBilling(
      { attendanceFee: 0, afterPartyEnabled: false, afterPartyFee: 0 },
      {
        status: "accepted",
        companionCount: 3,
        afterPartyAttendance: null,
        afterPartyCompanionCount: 0,
      },
    );
    expect(billing.total).toBe(0);
  });

  it("欠席・未回答なら請求 0", () => {
    for (const status of ["pending", "declined"] as const) {
      const billing = calcBilling(settings, {
        status,
        companionCount: 2,
        afterPartyAttendance: "attending",
        afterPartyCompanionCount: 2,
      });
      expect(billing.total).toBe(0);
      expect(billing.attendeeCount).toBe(0);
      expect(billing.afterPartyCount).toBe(0);
    }
  });

  it("懇親会が無効化されたら懇親会費は請求しない（回答が残っていても）", () => {
    const billing = calcBilling(
      { ...settings, afterPartyEnabled: false },
      {
        status: "accepted",
        companionCount: 1,
        afterPartyAttendance: "attending",
        afterPartyCompanionCount: 1,
      },
    );
    expect(billing.afterPartySubtotal).toBe(0);
    expect(billing.total).toBe(1000);
  });

  it("本人が懇親会不参加なら同伴者のみの参加は数えない", () => {
    const billing = calcBilling(settings, {
      status: "accepted",
      companionCount: 1,
      afterPartyAttendance: "declined",
      afterPartyCompanionCount: 1,
    });
    expect(billing.afterPartyCount).toBe(0);
  });
});

describe("支払い状態", () => {
  const unpaid = { paidAt: null, paidMethod: null, paidAmount: null };
  const paid3000 = {
    paidAt: 1000,
    paidMethod: "stripe" as const,
    paidAmount: 3000,
  };

  it("isPaid は paidAt の有無で判定", () => {
    expect(isPaid(unpaid)).toBe(false);
    expect(isPaid(paid3000)).toBe(true);
  });

  it("isFullyPaid: 受領額 ≥ 現請求額のときのみ true", () => {
    expect(isFullyPaid(paid3000, 3000)).toBe(true);
    expect(isFullyPaid(paid3000, 2000)).toBe(true);
    expect(isFullyPaid(paid3000, 4500)).toBe(false);
    expect(isFullyPaid(unpaid, 0)).toBe(false);
  });

  it("calcShortfall: 正 = 不足、負 = 過受領", () => {
    expect(calcShortfall(paid3000, 4500)).toBe(1500);
    expect(calcShortfall(paid3000, 2000)).toBe(-1000);
    expect(calcShortfall(paid3000, 3000)).toBe(0);
    expect(calcShortfall(unpaid, 500)).toBe(500);
  });
});

describe("formatYen", () => {
  it("3 桁区切りで ¥ を付ける", () => {
    expect(formatYen(0)).toBe("¥0");
    expect(formatYen(500)).toBe("¥500");
    expect(formatYen(3000)).toBe("¥3,000");
    expect(formatYen(1234567)).toBe("¥1,234,567");
  });
});
