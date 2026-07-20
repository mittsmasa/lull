import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { respondToInvitation } from "@/app/i/[token]/_actions";
import { db } from "@/db";
import { companions, invitations } from "@/db/schema";
import {
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";

const baseGuestInfo = {
  guestName: "ゲスト花子",
  guestEmail: "guest@example.com",
};

type MockStripe = {
  checkout: { sessions: { expire: ReturnType<typeof vi.fn> } };
};

function enableStripe(): MockStripe {
  const mock: MockStripe = {
    checkout: { sessions: { expire: vi.fn().mockResolvedValue({}) } },
  };
  (globalThis as { __mockStripe?: unknown }).__mockStripe = mock;
  return mock;
}

afterEach(() => {
  delete (globalThis as { __mockStripe?: unknown }).__mockStripe;
});

async function setupEvent(
  eventOverrides: Parameters<typeof createEvent>[0] = {},
) {
  const user = await createUser();
  const event = await createEvent({
    status: "published",
    totalSeats: 10,
    attendanceFee: 500,
    afterPartyEnabled: true,
    afterPartyFee: 1000,
    ...eventOverrides,
  });
  const memberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role: "organizer",
  });
  return { event, memberId };
}

describe("respondToInvitation - 懇親会・支払いバリデーション", () => {
  it("欠席回答 + 懇親会参加は拒否される", async () => {
    const { event, memberId } = await setupEvent();
    const inv = await addInvitation({ eventId: event.id, memberId });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "declined",
      companions: [],
      afterPartyAttendance: "attending",
      paymentMethod: null,
    });
    expect(res?.fieldErrors?.afterPartyAttendance).toBeTruthy();
  });

  it("懇親会有効 + 出席なのに懇親会未回答は拒否される", async () => {
    const { event, memberId } = await setupEvent();
    const inv = await addInvitation({ eventId: event.id, memberId });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
      afterPartyAttendance: null,
      paymentMethod: "onsite",
    });
    expect(res?.fieldErrors?.afterPartyAttendance).toBeTruthy();
  });

  it("請求額 0 のとき payment_method の指定は無視される（null で保存）", async () => {
    const { event, memberId } = await setupEvent({
      attendanceFee: 0,
      afterPartyEnabled: false,
      afterPartyFee: 0,
    });
    const inv = await addInvitation({ eventId: event.id, memberId });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
      afterPartyAttendance: null,
      paymentMethod: "onsite",
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paymentMethod).toBeNull();
  });

  it("請求額 > 0 で支払い方法未選択は拒否される", async () => {
    const { event, memberId } = await setupEvent({
      afterPartyEnabled: false,
    });
    const inv = await addInvitation({ eventId: event.id, memberId });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
      afterPartyAttendance: null,
      paymentMethod: null,
    });
    expect(res?.fieldErrors?.paymentMethod).toBeTruthy();
  });

  it("Stripe 未設定環境で prepaid を送ると拒否される", async () => {
    const { event, memberId } = await setupEvent({ afterPartyEnabled: false });
    const inv = await addInvitation({ eventId: event.id, memberId });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
      afterPartyAttendance: null,
      paymentMethod: "prepaid",
    });
    expect(res?.fieldErrors?.paymentMethod).toBeTruthy();
  });

  it("Stripe 設定済みなら prepaid を受理する", async () => {
    enableStripe();
    const { event, memberId } = await setupEvent({ afterPartyEnabled: false });
    const inv = await addInvitation({ eventId: event.id, memberId });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
      afterPartyAttendance: null,
      paymentMethod: "prepaid",
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paymentMethod).toBe("prepaid");
  });

  it("本人が懇親会不参加なら同伴者の afterPartyAttending は false に強制される", async () => {
    const { event, memberId } = await setupEvent();
    const inv = await addInvitation({ eventId: event.id, memberId });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [{ name: "同伴A", afterPartyAttending: true }],
      afterPartyAttendance: "declined",
      paymentMethod: "onsite",
    });
    expect(res).toBeUndefined();

    const comps = await db
      .select()
      .from(companions)
      .where(eq(companions.invitationId, inv.id));
    expect(comps).toHaveLength(1);
    expect(comps[0].afterPartyAttending).toBe(false);
  });
});

describe("respondToInvitation - 入金記録の保全とリセット", () => {
  it("入金済み招待の回答変更でも paid_at / paid_method / paid_amount は変化しない", async () => {
    const { event, memberId } = await setupEvent();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      guestEmail: baseGuestInfo.guestEmail,
      afterPartyAttendance: "attending",
      paymentMethod: "onsite",
      paidAt: 12345,
      paidMethod: "cash",
      paidAmount: 1500,
    });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [{ name: "追加同伴", afterPartyAttending: true }],
      afterPartyAttendance: "attending",
      paymentMethod: "onsite",
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after).toMatchObject({
      paidAt: 12345,
      paidMethod: "cash",
      paidAmount: 1500,
    });
  });

  it("出席 → 欠席で afterPartyAttendance / paymentMethod が null にリセットされる（入金記録は保持）", async () => {
    const { event, memberId } = await setupEvent();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      guestEmail: baseGuestInfo.guestEmail,
      afterPartyAttendance: "attending",
      paymentMethod: "onsite",
      paidAt: 12345,
      paidMethod: "cash",
      paidAmount: 3000,
    });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "declined",
      companions: [],
      afterPartyAttendance: null,
      paymentMethod: null,
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after).toMatchObject({
      status: "declined",
      afterPartyAttendance: null,
      paymentMethod: null,
      paidAt: 12345,
      paidMethod: "cash",
      paidAmount: 3000,
    });
  });
});

describe("respondToInvitation - Checkout セッション失効", () => {
  it("未払い + セッション ID ありの回答変更で expire が呼ばれ ID がクリアされる", async () => {
    const stripe = enableStripe();
    const { event, memberId } = await setupEvent();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      guestEmail: baseGuestInfo.guestEmail,
      afterPartyAttendance: "declined",
      paymentMethod: "prepaid",
      stripeCheckoutSessionId: "cs_test_old",
    });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [{ name: "追加同伴" }],
      afterPartyAttendance: "declined",
      paymentMethod: "prepaid",
    });
    expect(res).toBeUndefined();

    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_old");
    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBeNull();
  });

  it("expire が失敗しても回答処理は継続する", async () => {
    const stripe = enableStripe();
    stripe.checkout.sessions.expire.mockRejectedValue(new Error("api down"));
    const { event, memberId } = await setupEvent();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      guestEmail: baseGuestInfo.guestEmail,
      afterPartyAttendance: "declined",
      paymentMethod: "prepaid",
      stripeCheckoutSessionId: "cs_test_old",
    });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
      afterPartyAttendance: "attending",
      paymentMethod: "prepaid",
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.status).toBe("accepted");
    expect(after?.stripeCheckoutSessionId).toBeNull();
  });

  it("支払い済みのセッション ID は回答変更でもクリアされない", async () => {
    enableStripe();
    const { event, memberId } = await setupEvent();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      guestEmail: baseGuestInfo.guestEmail,
      afterPartyAttendance: "declined",
      paymentMethod: "prepaid",
      paidAt: 12345,
      paidMethod: "stripe",
      paidAmount: 500,
      stripeCheckoutSessionId: "cs_test_paid",
    });

    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
      afterPartyAttendance: "attending",
      paymentMethod: "prepaid",
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_paid");
  });
});
