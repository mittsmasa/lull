import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutSession } from "@/app/i/[token]/_actions";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";

type MockStripe = {
  checkout: {
    sessions: {
      expire: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
};

function enableStripe(): MockStripe {
  const mock: MockStripe = {
    checkout: {
      sessions: {
        expire: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({
          id: "cs_test_new",
          url: "https://checkout.stripe.com/test",
        }),
      },
    },
  };
  (globalThis as { __mockStripe?: unknown }).__mockStripe = mock;
  return mock;
}

afterEach(() => {
  delete (globalThis as { __mockStripe?: unknown }).__mockStripe;
});

async function setupInvitation(opts: {
  eventStatus?: "draft" | "published" | "ongoing" | "finished";
  attendanceFee?: number;
  afterPartyEnabled?: boolean;
  afterPartyFee?: number;
  invitationOverrides?: Record<string, unknown>;
}) {
  const user = await createUser();
  const event = await createEvent({
    status: opts.eventStatus ?? "published",
    totalSeats: 10,
    attendanceFee: opts.attendanceFee ?? 500,
    afterPartyEnabled: opts.afterPartyEnabled ?? true,
    afterPartyFee: opts.afterPartyFee ?? 1000,
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
    ...opts.invitationOverrides,
  });
  return { event, inv };
}

describe("createCheckoutSession - ガード条件", () => {
  it("支払済みの招待では生成できない", async () => {
    enableStripe();
    const { inv } = await setupInvitation({
      invitationOverrides: { paidAt: 1000, paidMethod: "stripe" },
    });
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ error: expect.stringContaining("お支払い済み") });
  });

  it("請求額 0 では生成できない", async () => {
    enableStripe();
    const { inv } = await setupInvitation({
      attendanceFee: 0,
      afterPartyEnabled: false,
      afterPartyFee: 0,
      invitationOverrides: { afterPartyAttendance: null },
    });
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({
      error: expect.stringContaining("金額はありません"),
    });
  });

  it("payment_method が prepaid でない場合は生成できない", async () => {
    enableStripe();
    const { inv } = await setupInvitation({
      invitationOverrides: { paymentMethod: "onsite" },
    });
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({
      error: expect.stringContaining("オンライン決済が選択されていません"),
    });
  });

  it("無効化済みの招待では生成できない", async () => {
    enableStripe();
    const { inv } = await setupInvitation({
      invitationOverrides: { invalidatedAt: 999 },
    });
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({
      error: expect.stringContaining("お支払いいただけません"),
    });
  });

  it("draft / finished のイベントでは生成できない", async () => {
    enableStripe();
    for (const eventStatus of ["draft", "finished"] as const) {
      const { inv } = await setupInvitation({ eventStatus });
      const res = await createCheckoutSession(inv.token);
      expect(res).toEqual({
        error: expect.stringContaining("受け付けていません"),
      });
    }
  });

  it("Stripe 未設定環境では生成できない", async () => {
    const { inv } = await setupInvitation({});
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({
      error: expect.stringContaining("ご利用いただけません"),
    });
  });
});

describe("createCheckoutSession - 正常系と金額", () => {
  it("unit_amount は円の整数値そのまま（100 倍されない）で、セッション ID が保存される", async () => {
    const stripe = enableStripe();
    // 参加費 500 × 2 名（本人+同伴 1）+ 懇親会費 1000 × 2 名 = ¥3,000
    const { inv } = await setupInvitation({});
    await addCompanion({ invitationId: inv.id, afterPartyAttending: true });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });

    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const args = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.payment_method_types).toEqual(["card"]);
    expect(args.metadata).toEqual({ invitationId: inv.id });
    // JPY はゼロ小数通貨: 請求額算出結果（円の整数値）と完全一致すること
    expect(args.line_items).toEqual([
      expect.objectContaining({
        price_data: expect.objectContaining({
          currency: "jpy",
          unit_amount: 500,
        }),
        quantity: 2,
      }),
      expect.objectContaining({
        price_data: expect.objectContaining({
          currency: "jpy",
          unit_amount: 1000,
        }),
        quantity: 2,
      }),
    ]);
    // 合計が請求額 ¥3,000 と桁ずれなく一致（¥300,000 になっていない）
    const total = args.line_items.reduce(
      (
        sum: number,
        item: { price_data: { unit_amount: number }; quantity: number },
      ) => sum + item.price_data.unit_amount * item.quantity,
      0,
    );
    expect(total).toBe(3000);

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_new");
  });

  it("懇親会不参加なら line item は参加費のみ", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation({
      invitationOverrides: { afterPartyAttendance: "declined" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });
    const args = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items).toHaveLength(1);
    expect(args.line_items[0].price_data.unit_amount).toBe(500);
  });

  it("既存の未払いセッションは expire してから新規生成する", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_old");

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_new");
  });

  it("旧セッションの expire に失敗したら新規生成を中断してエラーを返す（安全側）", async () => {
    const stripe = enableStripe();
    stripe.checkout.sessions.expire.mockRejectedValue(new Error("api down"));
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({
      error: expect.stringContaining("決済ページを開けませんでした"),
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();

    // 旧セッション ID は保持されたまま（次回リトライで再度 expire を試みる）
    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_old");
  });

  it("旧セッションが既に失効済みのエラーは無視して生成を続行する", async () => {
    const stripe = enableStripe();
    stripe.checkout.sessions.expire.mockRejectedValue(
      new Error(
        "This Checkout Session cannot be expired because it is already expired.",
      ),
    );
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("セッション生成の API 失敗時はエラーを返す", async () => {
    const stripe = enableStripe();
    stripe.checkout.sessions.create.mockRejectedValue(new Error("rate limit"));
    const { inv } = await setupInvitation({});

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({
      error: expect.stringContaining("決済ページを開けませんでした"),
    });
  });
});
