import type {
  AfterPartyAttendance,
  InvitationStatus,
  PaidMethod,
} from "@/db/schema";

// ============================================================
// 請求額算出
// ============================================================

/**
 * イベント側の料金設定（events テーブルの該当カラム）
 */
export type FeeSettings = {
  attendanceFee: number;
  afterPartyEnabled: boolean;
  afterPartyFee: number;
};

/**
 * 招待側の回答状況（invitations + companions の該当カラム）
 */
export type BillingAnswer = {
  status: InvitationStatus;
  companionCount: number;
  afterPartyAttendance: AfterPartyAttendance | null;
  /** 懇親会に参加する同伴者の数 */
  afterPartyCompanionCount: number;
};

/**
 * 請求額の内訳。金額はすべて円の整数値。
 * JPY は Stripe のゼロ小数通貨のため、この値をそのまま unit_amount に渡す（100 倍しない）
 */
export type Billing = {
  attendanceFee: number;
  attendeeCount: number;
  attendanceSubtotal: number;
  afterPartyFee: number;
  afterPartyCount: number;
  afterPartySubtotal: number;
  total: number;
};

/**
 * 現在の設定と回答から請求額を算出する。
 * 請求額は保存せず、常にこの関数で動的に計算する（受領記録とは非対称）。
 *
 * 請求額 = 参加費 × 出席人数（本人 + 同伴者）
 *        + 懇親会費 × 懇親会参加人数（本人 + 参加する同伴者）
 */
export function calcBilling(
  settings: FeeSettings,
  answer: BillingAnswer,
): Billing {
  // 出席していなければ請求は発生しない（pending / declined）
  if (answer.status !== "accepted") {
    return {
      attendanceFee: settings.attendanceFee,
      attendeeCount: 0,
      attendanceSubtotal: 0,
      afterPartyFee: settings.afterPartyFee,
      afterPartyCount: 0,
      afterPartySubtotal: 0,
      total: 0,
    };
  }

  const attendeeCount = 1 + answer.companionCount;
  const attendanceSubtotal = settings.attendanceFee * attendeeCount;

  // 懇親会が無効なら（後から無効化された場合も含め）懇親会費は請求しない。
  // 本人が参加でないとき、同伴者だけの参加はない（action 側でも強制するが二重に防ぐ）
  const afterPartyCount =
    settings.afterPartyEnabled && answer.afterPartyAttendance === "attending"
      ? 1 + answer.afterPartyCompanionCount
      : 0;
  const afterPartySubtotal = settings.afterPartyFee * afterPartyCount;

  return {
    attendanceFee: settings.attendanceFee,
    attendeeCount,
    attendanceSubtotal,
    afterPartyFee: settings.afterPartyFee,
    afterPartyCount,
    afterPartySubtotal,
    total: attendanceSubtotal + afterPartySubtotal,
  };
}

// ============================================================
// 支払い状態
// ============================================================

export type PaymentRecord = {
  paidAt: number | null;
  paidMethod: PaidMethod | null;
  paidAmount: number | null;
};

/**
 * 受領額と現請求額の差額。
 * 正 = 不足（追加受領が必要）、負 = 過受領（返金対応が必要）、0 = 一致
 */
export function calcShortfall(
  record: PaymentRecord,
  billingTotal: number,
): number {
  return billingTotal - (record.paidAmount ?? 0);
}

/** 入金記録があるか */
export function isPaid(record: PaymentRecord): boolean {
  return record.paidAt !== null;
}

/** 全額受領済みか（受領額 ≥ 現請求額）。受付の受領ボタン非活性判定に使う */
export function isFullyPaid(
  record: PaymentRecord,
  billingTotal: number,
): boolean {
  return isPaid(record) && (record.paidAmount ?? 0) >= billingTotal;
}

export const PAID_METHOD_LABELS: Record<PaidMethod, string> = {
  stripe: "オンライン決済",
  cash: "現金",
  electronic: "電子決済",
  manual: "手動記録",
};

/** 金額を「¥1,000」形式にフォーマット */
export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}
