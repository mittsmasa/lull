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
      retrieve: ReturnType<typeof vi.fn>;
      expire: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
};

function enableStripe(): MockStripe {
  const mock: MockStripe = {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ status: "open" }),
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
  it("全額受領済みの招待では生成できない", async () => {
    enableStripe();
    // 参加費 500 + 懇親会 1000 = 1500 を全額受領済み
    const { inv } = await setupInvitation({
      invitationOverrides: {
        paidAt: 1000,
        paidMethod: "stripe",
        paidAmount: 1500,
      },
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

  it("合計が ¥50 未満（Stripe の最低請求額）では生成できない", async () => {
    const mock = enableStripe();
    const { inv } = await setupInvitation({
      attendanceFee: 30,
      afterPartyEnabled: false,
      afterPartyFee: 0,
      invitationOverrides: { afterPartyAttendance: null },
    });
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ error: expect.stringContaining("¥50") });
    expect(mock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("合計がちょうど ¥50 なら生成できる", async () => {
    const mock = enableStripe();
    const { inv } = await setupInvitation({
      attendanceFee: 50,
      afterPartyEnabled: false,
      afterPartyFee: 0,
      invitationOverrides: { afterPartyAttendance: null },
    });
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(mock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("payment_method が onsite でも生成できる（当日支払いの廃止前に回答した招待の救済）", async () => {
    const mock = enableStripe();
    const { inv } = await setupInvitation({
      invitationOverrides: { paymentMethod: "onsite" },
    });
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(mock.checkout.sessions.create).toHaveBeenCalledTimes(1);
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
    // paypay は本番アカウントの有効化審査通過後に復帰予定（_actions.ts 参照）
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

  it("一部受領済みなら差額 1 行の明細で生成する", async () => {
    const stripe = enableStripe();
    // 参加費 500 + 懇親会 1000 = 1500 のうち 500 受領済み → 差額 1000
    const { inv } = await setupInvitation({
      invitationOverrides: {
        paidAt: 12345,
        paidMethod: "stripe",
        paidAmount: 500,
        stripeCheckoutSessionId: "cs_test_settled",
        settledCheckoutSessionIds: ",cs_test_settled,",
      },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });

    // 記録済みのセッションは失効対象ではない（retrieve / expire しない）
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();

    const args = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items).toHaveLength(1);
    expect(args.line_items[0].price_data.unit_amount).toBe(1000);
    expect(args.line_items[0].quantity).toBe(1);

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_new");
  });

  it("差額が ¥50 未満なら生成できない", async () => {
    const mock = enableStripe();
    // 請求 1500 に対し 1480 受領済み → 差額 20
    const { inv } = await setupInvitation({
      invitationOverrides: {
        paidAt: 12345,
        paidMethod: "manual",
        paidAmount: 1480,
      },
    });
    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ error: expect.stringContaining("¥50") });
    expect(mock.checkout.sessions.create).not.toHaveBeenCalled();
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

  it("既存の未払い（open）セッションは expire してから新規生成する", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
      "cs_test_old",
    );
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_old");

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_new");
  });

  it("旧セッションが complete（確定済み/非同期確定待ち）なら新規生成せず確認処理中エラーを返す", async () => {
    const stripe = enableStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue({ status: "complete" });
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({
      error: expect.stringContaining("お支払いの確認処理中"),
    });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();

    // 旧セッション ID は保持されたまま（webhook の反映を待つ）
    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_old");
  });

  it("旧セッションが complete かつ paid なら（webhook 未達）その場で入金を記録する", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_test_old",
      status: "complete",
      payment_status: "paid",
      amount_total: 1500,
      metadata: { invitationId: inv.id },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ paid: true });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeTruthy();
    expect(after?.paidMethod).toBe("stripe");
    expect(after?.paidAmount).toBe(1500);
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_old");
  });

  it("旧セッションが expired なら expire を呼ばず新規生成する", async () => {
    const stripe = enableStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue({ status: "expired" });
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("旧セッションが存在しない（resource_missing）なら旧セッションなし扱いで新規生成する", async () => {
    const stripe = enableStripe();
    stripe.checkout.sessions.retrieve.mockRejectedValue(
      Object.assign(new Error("No such checkout.session: cs_test_old"), {
        code: "resource_missing",
      }),
    );
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  it("旧セッションの retrieve に失敗したら新規生成を中断してエラーを返す（安全側）", async () => {
    const stripe = enableStripe();
    stripe.checkout.sessions.retrieve.mockRejectedValue(new Error("api down"));
    const { inv } = await setupInvitation({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_old" },
    });

    const res = await createCheckoutSession(inv.token);
    expect(res).toEqual({
      error: expect.stringContaining("決済ページを開けませんでした"),
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
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
