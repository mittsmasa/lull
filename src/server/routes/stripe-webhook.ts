import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type Stripe from "stripe";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { calcBilling } from "@/lib/payment";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe webhook（checkout.session.completed）の受け口。
 * 認証セッションは不要な公開エンドポイントで、Stripe 署名検証がアクセス制御を兼ねる。
 *
 * レスポンスコードの方針:
 * - 200: 処理完了 / 処理不能だが Stripe にリトライさせても意味がないもの（招待不明等）
 * - 400: 署名検証失敗
 * - 503: サーバー側の設定不備（Stripe にリトライさせる）
 */
const app = new Hono().post("/webhook", async (c) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();

  // secret 未設定なら body を一切パースせず即時拒否する。
  // 未検証 body を処理するコードパスを実装上存在させない
  if (!secret || !stripe) {
    console.error(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not configured",
    );
    return c.json({ error: "webhook is not configured" }, 503);
  }

  // 署名検証は raw body に対して行う（JSON パース前）
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "missing signature" }, 400);
  }
  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      secret,
    );
  } catch (err) {
    console.warn("[stripe-webhook] signature verification failed", err);
    return c.json({ error: "invalid signature" }, 400);
  }

  // 対象外のイベントは受領のみ
  if (event.type !== "checkout.session.completed") {
    return c.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // カード限定（payment_method_types: ["card"]）のため通常ここには来ないが、
  // 遅延決済（コンビニ等）では completed が payment_status: "unpaid" のまま
  // 発火し得るため多層防御として確認する。
  // 将来遅延決済を許す場合は checkout.session.async_payment_succeeded の
  // ハンドリングを別途追加すること
  if (session.payment_status !== "paid") {
    console.warn(
      `[stripe-webhook] session ${session.id} completed with payment_status=${session.payment_status}, skipping`,
    );
    return c.json({ received: true });
  }

  const invitationId = session.metadata?.invitationId;
  if (!invitationId) {
    console.error(
      `[stripe-webhook] session ${session.id} has no metadata.invitationId`,
    );
    return c.json({ received: true });
  }

  const invitation = await db.query.invitations.findFirst({
    where: eq(invitations.id, invitationId),
    with: { event: true, companions: true },
  });
  // 招待が見つからない（削除済み・metadata 不整合）場合は 200 を返して
  // Stripe の無限リトライを避ける
  if (!invitation) {
    console.error(
      `[stripe-webhook] invitation ${invitationId} not found for session ${session.id}`,
    );
    return c.json({ received: true });
  }

  if (invitation.paidAt !== null) {
    // 同一セッションの再送・二重配信への冪等性
    if (invitation.stripeCheckoutSessionId === session.id) {
      return c.json({ received: true });
    }
    // 支払済みの招待に別セッションの completed が届いた場合は上書きしない。
    // 二重支払いの可能性があるため監査ログに残す（返金は Stripe ダッシュボード運用）
    console.error(
      `[stripe-webhook] invitation ${invitationId} is already paid (session ${invitation.stripeCheckoutSessionId}), ignoring duplicate payment session ${session.id}`,
    );
    return c.json({ received: true });
  }

  // JPY はゼロ小数通貨のため amount_total は円の整数値がそのまま届く
  // （100 で割る変換は不要）。paid_amount には額面どおり記録する
  const amountTotal = session.amount_total ?? 0;

  // 現時点の請求額と照合。不一致でも額面どおり記録し、差額は管理画面・受付の
  // 差額表示で検知する（決済後に回答・設定が変わったケース等）
  const billing = calcBilling(
    {
      attendanceFee: invitation.event.attendanceFee,
      afterPartyEnabled: invitation.event.afterPartyEnabled,
      afterPartyFee: invitation.event.afterPartyFee,
    },
    {
      status: invitation.status,
      companionCount: invitation.companions.length,
      afterPartyAttendance: invitation.afterPartyAttendance,
      afterPartyCompanionCount: invitation.companions.filter(
        (companion) => companion.afterPartyAttending,
      ).length,
    },
  );
  if (amountTotal !== billing.total) {
    console.warn(
      `[stripe-webhook] amount mismatch for invitation ${invitationId}: paid ${amountTotal}, current billing ${billing.total} (session ${session.id})`,
    );
  }

  await db
    .update(invitations)
    .set({
      paidAt: Date.now(),
      paidMethod: "stripe",
      paidAmount: amountTotal,
      stripeCheckoutSessionId: session.id,
    })
    .where(eq(invitations.id, invitation.id));

  return c.json({ received: true });
});

export { app as stripeWebhookRoute };
