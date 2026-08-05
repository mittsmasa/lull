"use client";

import { CircleNotch } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  confirmCheckoutPayment,
  createCheckoutSession,
} from "@/app/i/[token]/_actions";
import { Button } from "@/components/ui/button";
import { formatYen } from "@/lib/payment";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_COUNT = 20; // 約 1 分で打ち切り

type InvitationPaymentSectionProps = {
  token: string;
  amount: number;
  /** URL クエリ（?payment=...）。表示の出し分けにのみ使い、支払済み判定には使わない */
  paymentStatus: "success" | "cancelled" | null;
  /** success_url に付与された Checkout セッション ID（?session_id=...） */
  sessionId: string | null;
};

/**
 * 招待状ページの「オンラインで支払う」セクション。
 * 未払い + prepaid 選択時のみサーバー側でレンダリング判定される。
 * 決済から戻った直後（?payment=success）は、セッション ID を使って
 * サーバー側で入金確認を行いつつ、DB の paid_at 反映
 * （= このコンポーネントが消えること）をポーリングで待つ。
 * webhook が届かない場合でもこの確認経路で反映される。
 */
export function InvitationPaymentSection({
  token,
  amount,
  paymentStatus,
  sessionId,
}: InvitationPaymentSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pollCount, setPollCount] = useState(0);
  const confirming = paymentStatus === "success" && pollCount < POLL_MAX_COUNT;
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (paymentStatus !== "success") return;
    let cancelled = false;

    // 入金確認 → サーバーコンポーネント再取得。paid_at が反映されると
    // 親の条件によりこのセクション自体が消える
    const sync = async () => {
      if (sessionId) {
        try {
          await confirmCheckoutPayment(token, sessionId);
        } catch {
          // 確認に失敗しても webhook 経由の反映があり得るのでポーリングは続ける
        }
      }
      if (!cancelled) router.refresh();
    };

    // 戻ってきた直後に 1 回。以降はフォールバックとして定期実行する
    void sync();
    const timer = setInterval(() => {
      pollCountRef.current += 1;
      setPollCount(pollCountRef.current);
      if (pollCountRef.current >= POLL_MAX_COUNT) {
        clearInterval(timer);
        return;
      }
      void sync();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [paymentStatus, sessionId, token, router]);

  const handlePay = () => {
    startTransition(async () => {
      const result = await createCheckoutSession(token);
      // 決済済みだった場合（webhook 未達）はこの場で記録が入っている
      if ("paid" in result) {
        toast.success("お支払いはすでに完了しています");
        router.refresh();
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      window.location.assign(result.url);
    });
  };

  if (confirming) {
    return (
      <section className="flex flex-col gap-3 border-t border-border/50 pt-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Payment
        </p>
        <div className="flex items-center gap-3 rounded-sm border border-border/50 p-5">
          <CircleNotch
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm">お支払いを確認しています…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border/50 pt-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Payment
      </p>
      {paymentStatus === "success" && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          お支払いの反映に時間がかかっています。しばらくしてからページを再読み込みしてください。すでに決済がお済みの場合、二重に請求されることはありません
        </p>
      )}
      {paymentStatus === "cancelled" && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          お支払いはキャンセルされました。あらためてお手続きいただけます
        </p>
      )}
      <Button
        type="button"
        onClick={handlePay}
        disabled={isPending}
        className="h-12 w-full bg-foreground text-background tracking-[0.15em] hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending
          ? "決済ページを開いています..."
          : `オンラインで支払う ${formatYen(amount)}`}
      </Button>
      <p className="text-muted-foreground text-xs">
        カード / PayPay 決済（Stripe）のページへ移動します
      </p>
    </section>
  );
}
