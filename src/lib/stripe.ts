import "server-only";

import Stripe from "stripe";

let client: Stripe | null | undefined;

/**
 * Stripe SDK シングルトン。
 * STRIPE_SECRET_KEY 未設定の環境では null を返し、呼び出し側は
 * 「Stripe 無効」（事前支払いの選択肢を出さない等）として扱う。
 */
export function getStripe(): Stripe | null {
  if (client === undefined) {
    const key = process.env.STRIPE_SECRET_KEY;
    client = key ? new Stripe(key) : null;
  }
  return client;
}

/** Stripe が設定済みか（事前支払いを提供できるか） */
export function isStripeEnabled(): boolean {
  return getStripe() !== null;
}
