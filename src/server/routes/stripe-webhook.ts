import { Hono } from "hono";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { recordStripeCheckoutPayment } from "@/lib/stripe-payment";

/**
 * Stripe webhook（checkout.session.completed / async_payment_succeeded /
 * async_payment_failed）の受け口。
 * 認証セッションは不要な公開エンドポイントで、Stripe 署名検証がアクセス制御を兼ねる。
 *
 * 入金記録そのものは `@/lib/stripe-payment` の共通実装に委譲する
 * （招待状ページの決済完了確認と同じ処理を通す）。
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

  // 決済失敗の async 通知は記録せず受領のみ（顧客は Checkout から再試行できる）
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.warn(
      `[stripe-webhook] session ${session.id} async payment failed (invitation ${session.metadata?.invitationId})`,
    );
    return c.json({ received: true });
  }

  // 対象外のイベントは受領のみ。
  // async_payment_succeeded は、決済手段が確定を非同期通知するケース
  // （PayPay は原則即時だが防御的に対応）で completed の後に発火する
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return c.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const result = await recordStripeCheckoutPayment(session);

  if (result === "not_paid") {
    console.warn(
      `[stripe-webhook] session ${session.id} ${event.type} with payment_status=${session.payment_status}, skipping`,
    );
  }

  // 記録できないケース（招待不明・metadata 不整合等）も 200 を返して
  // Stripe の無限リトライを避ける（詳細は共通実装側でログに残している）
  return c.json({ received: true });
});

export { app as stripeWebhookRoute };
