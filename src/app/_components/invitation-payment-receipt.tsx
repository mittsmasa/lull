import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import type { PaidMethod } from "@/db/schema";
import { formatEpochDatetime } from "@/lib/format";
import { formatYen, PAID_METHOD_LABELS } from "@/lib/payment";
import { cn } from "@/lib/utils";

type InvitationPaymentReceiptProps = {
  paidAmount: number;
  paidMethod: PaidMethod;
  /** 受領日時（epoch ミリ秒） */
  paidAt: number;
  /** 決済から戻った直後か。完了の一文と入場アニメーションの出し分けに使う */
  justPaid: boolean;
};

/**
 * 支払い済みの控え。
 *
 * ページ内の他の区切りは実線 hairline で、このセクションの区切りだけ破線にする
 * （控え = 切り取れるもの）。金額はページ内で最も大きい数字として置く。
 *
 * 完了の一文とアニメーションは決済直後だけ。後日の再訪では同じ情報を
 * 静かに表示する
 */
export function InvitationPaymentReceipt({
  paidAmount,
  paidMethod,
  paidAt,
  justPaid,
}: InvitationPaymentReceiptProps) {
  return (
    <section
      className={cn(
        // 区切りは上のみ（他セクションと同じ構造）。線種だけがここの差異になる
        "flex flex-col gap-4 border-t border-dashed border-border/50 pt-6",
        justPaid &&
          "animate-in fade-in slide-in-from-bottom-2 duration-700 motion-reduce:animate-none",
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Paid
      </p>

      {justPaid && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle className="size-4 shrink-0" weight="fill" aria-hidden />
          お支払いが完了しました
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="font-serif text-3xl leading-none tabular-nums">
          {formatYen(paidAmount)}
        </p>
        <p className="text-xs text-muted-foreground">
          {PAID_METHOD_LABELS[paidMethod]} ・ {formatEpochDatetime(paidAt)} 受領
        </p>
      </div>
    </section>
  );
}
