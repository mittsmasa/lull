import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOnsiteCheckoutSession,
  getInvitationPaymentStatus,
} from "@/app/(main)/events/[eventId]/checkin/_actions";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import {
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";
import { loginAs, logout } from "../helpers/auth";

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
          id: "cs_test_onsite",
          url: "https://checkout.stripe.com/onsite",
        }),
      },
    },
  };
  (globalThis as { __mockStripe?: unknown }).__mockStripe = mock;
  return mock;
}

afterEach(() => {
  delete (globalThis as { __mockStripe?: unknown }).__mockStripe;
  logout();
});

async function setup(
  opts: {
    eventStatus?: "published" | "ongoing";
    invitationOverrides?: Record<string, unknown>;
  } = {},
) {
  const user = await createUser();
  const event = await createEvent({
    status: opts.eventStatus ?? "ongoing",
    totalSeats: 10,
    attendanceFee: 500,
    afterPartyEnabled: false,
    afterPartyFee: 0,
  });
  const memberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role: "performer",
  });
  const inv = await addInvitation({
    eventId: event.id,
    memberId,
    status: "accepted",
    paymentMethod: "onsite",
    ...opts.invitationOverrides,
  });
  loginAs(user);
  return { user, event, inv };
}

describe("createOnsiteCheckoutSession", () => {
  it("受付から決済 URL を生成できる（payment_method が onsite でも可）", async () => {
    const mock = enableStripe();
    const { event, inv } = await setup();

    const res = await createOnsiteCheckoutSession(event.id, inv.id);
    expect(res).toEqual({ url: "https://checkout.stripe.com/onsite" });
    expect(mock.checkout.sessions.create).toHaveBeenCalledTimes(1);

    // 失効管理のためセッション ID が保存される
    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_onsite");
  });

  it("イベントメンバーでなければ拒否される", async () => {
    enableStripe();
    const { event, inv } = await setup();
    const outsider = await createUser();
    loginAs(outsider);

    const res = await createOnsiteCheckoutSession(event.id, inv.id);
    expect(res).toEqual({ error: "権限がありません" });
  });

  it("ongoing 以外のイベントでは生成できない", async () => {
    enableStripe();
    const { event, inv } = await setup({ eventStatus: "published" });

    const res = await createOnsiteCheckoutSession(event.id, inv.id);
    expect(res).toEqual({
      error: expect.stringContaining("開催中のイベントでのみ"),
    });
  });

  it("出席が確定していない招待では生成できない", async () => {
    enableStripe();
    const { event, inv } = await setup({
      invitationOverrides: { status: "pending" },
    });

    const res = await createOnsiteCheckoutSession(event.id, inv.id);
    expect(res).toEqual({
      error: expect.stringContaining("出席が確定していない"),
    });
  });

  it("支払済みの招待では生成できない", async () => {
    enableStripe();
    const { event, inv } = await setup({
      invitationOverrides: {
        paidAt: 1000,
        paidMethod: "stripe",
        paidAmount: 500,
      },
    });

    const res = await createOnsiteCheckoutSession(event.id, inv.id);
    expect(res).toEqual({ error: expect.stringContaining("お支払い済み") });
  });
});

describe("getInvitationPaymentStatus", () => {
  it("webhook 未達でも Stripe に問い合わせて入金を記録する", async () => {
    const mock = enableStripe();
    const { event, inv } = await setup({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_paid" },
    });
    mock.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_test_paid",
      status: "complete",
      payment_status: "paid",
      amount_total: 500,
      metadata: { invitationId: inv.id },
    });

    const res = await getInvitationPaymentStatus(event.id, inv.id);
    if ("error" in res) throw new Error(res.error);
    expect(res.payment.paidAt).toBeTruthy();
    expect(res.payment.paidMethod).toBe("stripe");
    expect(res.payment.paidAmount).toBe(500);

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeTruthy();
  });

  it("未決済のセッションでは入金を記録しない", async () => {
    const mock = enableStripe();
    const { event, inv } = await setup({
      invitationOverrides: { stripeCheckoutSessionId: "cs_test_open" },
    });
    mock.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_test_open",
      status: "open",
      payment_status: "unpaid",
      metadata: { invitationId: inv.id },
    });

    const res = await getInvitationPaymentStatus(event.id, inv.id);
    if ("error" in res) throw new Error(res.error);
    expect(res.payment.paidAt).toBeNull();
  });

  it("セッション未生成なら Stripe に問い合わせず現状を返す", async () => {
    const mock = enableStripe();
    const { event, inv } = await setup();

    const res = await getInvitationPaymentStatus(event.id, inv.id);
    if ("error" in res) throw new Error(res.error);
    expect(res.payment.paidAt).toBeNull();
    expect(res.payment.billing.total).toBe(500);
    expect(mock.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it("イベントメンバーでなければ拒否される", async () => {
    enableStripe();
    const { event, inv } = await setup();
    const outsider = await createUser();
    loginAs(outsider);

    const res = await getInvitationPaymentStatus(event.id, inv.id);
    expect(res).toEqual({ error: "権限がありません" });
  });
});
