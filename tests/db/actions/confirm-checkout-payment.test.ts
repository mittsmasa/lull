import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmCheckoutPayment } from "@/app/i/[token]/_actions";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";
import { clearAfterTasks, flushAfter } from "../helpers/after";
import { clearSentMails, sentMails } from "../helpers/mail";

type MockStripe = {
  checkout: { sessions: { retrieve: ReturnType<typeof vi.fn> } };
};

function enableStripe(): MockStripe {
  const mock: MockStripe = {
    checkout: { sessions: { retrieve: vi.fn() } },
  };
  (globalThis as { __mockStripe?: unknown }).__mockStripe = mock;
  return mock;
}

beforeEach(() => {
  // 直前のテストの積み残しを持ち込まない
  clearAfterTasks();
  clearSentMails();
});

afterEach(() => {
  delete (globalThis as { __mockStripe?: unknown }).__mockStripe;
});

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
    stripeCheckoutSessionId: "cs_test_paid",
    ...invitationOverrides,
  });
  return { event, inv };
}

function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_paid",
    status: "complete",
    payment_status: "paid",
    amount_total: 3000,
    ...overrides,
  };
}

describe("confirmCheckoutPayment", () => {
  it("webhook が未達でもセッションが paid なら入金を記録する", async () => {
    const stripe = enableStripe();
    // 参加費 500×2 + 懇親会 1000×2 = 3000
    const { inv } = await setupInvitation();
    await addCompanion({ invitationId: inv.id, afterPartyAttending: true });
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ metadata: { invitationId: inv.id } }),
    );

    const res = await confirmCheckoutPayment(inv.token, "cs_test_paid");
    expect(res).toEqual({ paid: true });

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeTruthy();
    expect(after?.paidMethod).toBe("stripe");
    // JPY はゼロ小数通貨: amount_total の 3000 がそのまま入る
    expect(after?.paidAmount).toBe(3000);
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_paid");
  });

  it("payment_status が paid でなければ記録しない", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation();
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({
        payment_status: "unpaid",
        metadata: { invitationId: inv.id },
      }),
    );

    const res = await confirmCheckoutPayment(inv.token, "cs_test_paid");
    expect(res).toEqual({ paid: false });

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeNull();
  });

  it("他招待のセッション ID を渡されても記録しない", async () => {
    const stripe = enableStripe();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { inv } = await setupInvitation();
    const { inv: other } = await setupInvitation();
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ metadata: { invitationId: other.id } }),
    );

    const res = await confirmCheckoutPayment(inv.token, "cs_test_paid");
    expect(res).toEqual({ paid: false });
    errorSpy.mockRestore();

    for (const id of [inv.id, other.id]) {
      const after = await db.query.invitations.findFirst({
        where: eq(invitations.id, id),
      });
      expect(after?.paidAt).toBeNull();
    }
  });

  it("すでに支払済みなら Stripe に問い合わせず paid を返す", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation({
      paidAt: 11111,
      paidMethod: "stripe",
      paidAmount: 3000,
    });

    const res = await confirmCheckoutPayment(inv.token, "cs_test_paid");
    expect(res).toEqual({ paid: true });
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBe(11111);
  });

  it("Checkout セッション ID の形式でなければ問い合わせない", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation();

    const res = await confirmCheckoutPayment(inv.token, "not-a-session");
    expect(res).toEqual({ paid: false });
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it("Stripe への問い合わせが失敗しても throw しない", async () => {
    const stripe = enableStripe();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { inv } = await setupInvitation();
    stripe.checkout.sessions.retrieve.mockRejectedValue(new Error("network"));

    const res = await confirmCheckoutPayment(inv.token, "cs_test_paid");
    expect(res).toEqual({ paid: false });
    errorSpy.mockRestore();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeNull();
  });

  it("この経路で記録できたときはゲストに決済完了メールを送る", async () => {
    const stripe = enableStripe();
    const { inv } = await setupInvitation({
      guestName: "山田花子",
      guestEmail: "hanako@example.com",
    });
    await addCompanion({ invitationId: inv.id, afterPartyAttending: true });
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ metadata: { invitationId: inv.id } }),
    );

    await confirmCheckoutPayment(inv.token, "cs_test_paid");

    // 送信は after() 経由なので完了を待ってから検証する
    await flushAfter();
    expect(sentMails()).toHaveLength(1);
    expect(sentMails()[0].to).toBe("hanako@example.com");
  });

  it("webhook が先に記録していればメールを送らない（二重送信しない）", async () => {
    const stripe = enableStripe();
    // webhook 側が記録済みの状態を再現
    const { inv } = await setupInvitation({
      guestName: "山田花子",
      guestEmail: "hanako@example.com",
      paidAt: 11111,
      paidMethod: "stripe",
      paidAmount: 3000,
    });
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ metadata: { invitationId: inv.id } }),
    );

    const res = await confirmCheckoutPayment(inv.token, "cs_test_paid");
    expect(res).toEqual({ paid: true });

    // 支払済みの招待は Stripe に問い合わせる前に早期 return するため、
    // 通知のコードパスに到達しない
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    await flushAfter();
    expect(sentMails()).toHaveLength(0);
  });

  it("Stripe 無効環境では何もしない", async () => {
    const { inv } = await setupInvitation();

    const res = await confirmCheckoutPayment(inv.token, "cs_test_paid");
    expect(res).toEqual({ paid: false });
  });
});
