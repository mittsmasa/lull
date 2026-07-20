import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { stripeWebhookRoute } from "@/server/routes/stripe-webhook";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";

type MockStripe = {
  webhooks: { constructEventAsync: ReturnType<typeof vi.fn> };
};

function enableStripe(): MockStripe {
  const mock: MockStripe = {
    webhooks: { constructEventAsync: vi.fn() },
  };
  (globalThis as { __mockStripe?: unknown }).__mockStripe = mock;
  return mock;
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete (globalThis as { __mockStripe?: unknown }).__mockStripe;
});

function postWebhook(body = "{}", signature: string | null = "sig") {
  return stripeWebhookRoute.request("/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body,
  });
}

function completedEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_paid",
        payment_status: "paid",
        amount_total: 3000,
        metadata: {},
        ...overrides,
      },
    },
  };
}

async function setupInvitation(
  invitationOverrides: Record<string, unknown> = {},
) {
  const user = await createUser();
  const event = await createEvent({
    status: "published",
    totalSeats: 10,
    attendanceFee: 500,
    afterPartyEnabled: true,
    afterPartyFee: 1000,
  });
  const memberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role: "organizer",
  });
  const inv = await addInvitation({
    eventId: event.id,
    memberId,
    status: "accepted",
    afterPartyAttendance: "attending",
    paymentMethod: "prepaid",
    ...invitationOverrides,
  });
  return { event, inv };
}

describe("stripe webhook", () => {
  it("STRIPE_WEBHOOK_SECRET 未設定なら body をパースせず 503", async () => {
    const stripe = enableStripe();
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const res = await postWebhook("not-even-json");
    expect(res.status).toBe(503);
    expect(stripe.webhooks.constructEventAsync).not.toHaveBeenCalled();
  });

  it("署名ヘッダなし・署名検証失敗は 400", async () => {
    const stripe = enableStripe();
    stripe.webhooks.constructEventAsync.mockRejectedValue(
      new Error("bad signature"),
    );

    const noHeader = await postWebhook("{}", null);
    expect(noHeader.status).toBe(400);

    const badSig = await postWebhook();
    expect(badSig.status).toBe(400);
  });

  it("checkout.session.completed 以外のイベントは 200 で無視", async () => {
    const stripe = enableStripe();
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "payment_intent.succeeded",
      data: { object: {} },
    });

    const res = await postWebhook();
    expect(res.status).toBe(200);
  });

  it("payment_status !== paid は記録せず 200", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation();
    stripe.webhooks.constructEventAsync.mockResolvedValue(
      completedEvent({
        payment_status: "unpaid",
        metadata: { invitationId: inv.id },
      }),
    );

    const res = await postWebhook();
    expect(res.status).toBe(200);

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeNull();
  });

  it("async_payment_succeeded は completed と同様に支払記録する", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation();
    await addCompanion({ invitationId: inv.id, afterPartyAttending: true });
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          id: "cs_test_paid",
          payment_status: "paid",
          amount_total: 3000,
          metadata: { invitationId: inv.id },
        },
      },
    });

    const res = await postWebhook();
    expect(res.status).toBe(200);

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeTruthy();
    expect(after?.paidMethod).toBe("stripe");
    expect(after?.paidAmount).toBe(3000);
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_paid");
  });

  it("async_payment_failed は記録せず 200 + 警告ログ", async () => {
    const stripe = enableStripe();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { inv } = await setupInvitation();
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: "cs_test_failed",
          payment_status: "unpaid",
          amount_total: 3000,
          metadata: { invitationId: inv.id },
        },
      },
    });

    const res = await postWebhook();
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("async payment failed"),
    );
    warnSpy.mockRestore();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeNull();
  });

  it("招待が見つからない場合は 200 + 記録なし", async () => {
    const stripe = enableStripe();
    stripe.webhooks.constructEventAsync.mockResolvedValue(
      completedEvent({ metadata: { invitationId: "no-such-invitation" } }),
    );

    const res = await postWebhook();
    expect(res.status).toBe(200);
  });

  it("正常記録: paid_at / paid_method=stripe / paid_amount=amount_total（円の整数値そのまま）", async () => {
    const stripe = enableStripe();
    // 参加費 500×2 + 懇親会 1000×2 = 3000
    const { inv } = await setupInvitation();
    await addCompanion({ invitationId: inv.id, afterPartyAttending: true });
    stripe.webhooks.constructEventAsync.mockResolvedValue(
      completedEvent({ metadata: { invitationId: inv.id } }),
    );

    const res = await postWebhook();
    expect(res.status).toBe(200);

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeTruthy();
    expect(after?.paidMethod).toBe("stripe");
    // JPY はゼロ小数通貨: amount_total の 3000 がそのまま入る（30 や 300000 ではない）
    expect(after?.paidAmount).toBe(3000);
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_paid");
  });

  it("同一セッション ID の再送は冪等（記録が変化しない）", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation({
      paidAt: 11111,
      paidMethod: "stripe",
      paidAmount: 3000,
      stripeCheckoutSessionId: "cs_test_paid",
    });
    stripe.webhooks.constructEventAsync.mockResolvedValue(
      completedEvent({ metadata: { invitationId: inv.id } }),
    );

    const res = await postWebhook();
    expect(res.status).toBe(200);

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBe(11111);
    expect(after?.paidAmount).toBe(3000);
  });

  it("支払済みへの別セッション completed は上書きせず 200 + エラーログ", async () => {
    const stripe = enableStripe();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { inv } = await setupInvitation({
      paidAt: 11111,
      paidMethod: "stripe",
      paidAmount: 3000,
      stripeCheckoutSessionId: "cs_test_first",
    });
    stripe.webhooks.constructEventAsync.mockResolvedValue(
      completedEvent({
        id: "cs_test_second",
        amount_total: 4500,
        metadata: { invitationId: inv.id },
      }),
    );

    const res = await postWebhook();
    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("already paid"),
    );
    errorSpy.mockRestore();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBe(11111);
    expect(after?.paidAmount).toBe(3000);
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_first");
  });

  it("amount_total が現請求額と不一致でも額面どおり記録し警告ログを残す", async () => {
    const stripe = enableStripe();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // 現請求額は 500（本人のみ・懇親会不参加）だが、決済額は 3000（決済後に回答が変わった想定）
    const { inv } = await setupInvitation({
      afterPartyAttendance: "declined",
    });
    stripe.webhooks.constructEventAsync.mockResolvedValue(
      completedEvent({ metadata: { invitationId: inv.id } }),
    );

    const res = await postWebhook();
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("amount mismatch"),
    );
    warnSpy.mockRestore();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAmount).toBe(3000);
  });
});
