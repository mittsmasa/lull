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
// オンライン決済の最低金額
// ============================================================

/**
 * Stripe Checkout (JPY) が受け付ける最低請求額。
 * 合計がこれ未満（1〜49 円）だと checkout.sessions.create が拒否される
 */
export const STRIPE_MIN_AMOUNT_JPY = 50;

/**
 * オンライン決済が有効なイベントで設定可能な料金か。
 * 0 円は無料（line_items から除外される）として許容し、
 * 1〜49 円は請求額が最低請求額を下回り得るため不可とする。
 * 料金は「料金 × 人数（適用時は 1 以上）」の和で請求されるため、
 * 各料金がこの条件を満たせば合計も必ず 0 円または 50 円以上になる
 */
export function isValidOnlineFee(fee: number): boolean {
  return fee === 0 || fee >= STRIPE_MIN_AMOUNT_JPY;
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

/**
 * 未受領の請求額（差額決済で回収する額）。過受領時は 0 とする
 */
export function calcDue(record: PaymentRecord, billingTotal: number): number {
  return Math.max(0, calcShortfall(record, billingTotal));
}

/**
 * 未受領の残額があるか（請求額 > 受領額）。
 * 請求 0 円と過受領はいずれも false になる。
 * 一覧の未払い判定・セクション分割はすべてこの述語を通す
 */
export function isUnderpaid(
  record: PaymentRecord,
  billingTotal: number,
): boolean {
  return calcDue(record, billingTotal) > 0;
}

/**
 * ゲスト自身の回答変更で下回れない請求額。
 *
 * 増額方向（差額決済で解消できる）は許可し、減額方向は許可しない。
 * 減額は返金・キャンセル対応を伴うため、主催者への問い合わせ / 当日相談に倒す。
 * 現請求額と受領額の大きい方を下限にすることで、一部受領済み（差額あり）でも
 * 「今の請求額より安くなる変更」を防ぐ
 */
export function calcChangeFloor(
  record: PaymentRecord,
  currentBillingTotal: number,
): number {
  return Math.max(currentBillingTotal, record.paidAmount ?? 0);
}

/** 減額方向の変更を断るときの案内文（サーバー・フォームで共有） */
export const BILLING_REDUCTION_BLOCKED_MESSAGE =
  "ご請求額が減る変更は、こちらの画面では承れません。恐れ入りますが招待者・主催者へお問い合わせいただくか、当日受付でご相談ください";

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

// ============================================================
// イベント全体の集計
// ============================================================

/** 集計対象の招待 1 件分（回答状況 + 受領記録） */
export type BillingSummaryInput = BillingAnswer & PaymentRecord;

export type BillingTotals = {
  /** 出席者への請求総額 */
  billingTotal: number;
  /** 出席者からの受領総額 */
  paidTotal: number;
};

/**
 * イベント全体の請求総額・受領総額を集計する。
 *
 * 母集団は accepted のみ。辞退者に入金記録が残る場合（返金対応待ち）は請求も受領も数えない。
 * 受領額を全件から集めると未返金分が受領を膨らませ、回収漏れを隠す方向に働くため。
 *
 * 合算値は概況把握の補助指標であることに注意。過受領と過小受領が別々の招待にあると
 * 相殺されて差がゼロに見える。個別の回収漏れ検知は一覧の未払いセクションが一次手段
 */
export function summarizeBilling(
  invitations: BillingSummaryInput[],
  settings: FeeSettings,
): BillingTotals {
  return invitations.reduce<BillingTotals>(
    (totals, invitation) => {
      if (invitation.status !== "accepted") return totals;
      return {
        billingTotal:
          totals.billingTotal + calcBilling(settings, invitation).total,
        paidTotal: totals.paidTotal + (invitation.paidAmount ?? 0),
      };
    },
    { billingTotal: 0, paidTotal: 0 },
  );
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
