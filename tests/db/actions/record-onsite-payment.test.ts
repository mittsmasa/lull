import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  lookupInvitationByToken,
  recordOnsitePayment,
} from "@/app/(main)/events/[eventId]/checkin/_actions";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";
import { loginAs, logout } from "../helpers/auth";

async function setupMember(
  eventOverrides: Record<string, unknown> = {},
  role: "organizer" | "performer" = "performer",
) {
  const user = await createUser();
  const event = await createEvent({
    status: "ongoing",
    totalSeats: 10,
    attendanceFee: 500,
    afterPartyEnabled: true,
    afterPartyFee: 1000,
    ...eventOverrides,
  });
  const memberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role,
  });
  loginAs(user);
  return { user, event, memberId };
}

describe("recordOnsitePayment", () => {
  it("未払いの招待に現金受領を記録できる（member 権限）", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      afterPartyAttendance: "attending",
      paymentMethod: "onsite",
    });
    await addCompanion({ invitationId: inv.id, afterPartyAttending: true });

    const result = await recordOnsitePayment(event.id, inv.id, "cash");
    if ("error" in result) throw new Error(result.error);
    // 参加費 500×2 + 懇親会 1000×2 = 3000
    expect(result.payment.paidAmount).toBe(3000);
    expect(result.payment.paidMethod).toBe("cash");

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAt).toBeTruthy();
    expect(after?.paidMethod).toBe("cash");
    expect(after?.paidAmount).toBe(3000);
  });

  it("全額受領済みなら二重受領を拒否する", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      afterPartyAttendance: "declined",
      paymentMethod: "onsite",
      paidAt: 1000,
      paidMethod: "cash",
      paidAmount: 500,
    });

    const result = await recordOnsitePayment(event.id, inv.id, "cash");
    expect(result).toEqual({
      error: expect.stringContaining("全額受領済み"),
    });
  });

  it("差額あり（受領額 < 現請求額）なら受領でき、paid_method が stripe の場合は上書きしない", async () => {
    const { event, memberId } = await setupMember();
    // Stripe で ¥500 支払い後に懇親会参加へ変更 → 現請求 ¥1,500
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      afterPartyAttendance: "attending",
      paymentMethod: "prepaid",
      paidAt: 1000,
      paidMethod: "stripe",
      paidAmount: 500,
      stripeCheckoutSessionId: "cs_test_audit",
    });

    const result = await recordOnsitePayment(event.id, inv.id, "cash");
    if ("error" in result) throw new Error(result.error);
    expect(result.payment.paidAmount).toBe(1500);
    // 一部 Stripe 決済済みの事実を記録に残す
    expect(result.payment.paidMethod).toBe("stripe");

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.paidAmount).toBe(1500);
    expect(after?.paidMethod).toBe("stripe");
    // セッション ID は監査用に保持
    expect(after?.stripeCheckoutSessionId).toBe("cs_test_audit");
  });

  it("ongoing 以外のイベントでは記録できない", async () => {
    const { event, memberId } = await setupMember({ status: "published" });
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      afterPartyAttendance: "declined",
      paymentMethod: "onsite",
    });

    const result = await recordOnsitePayment(event.id, inv.id, "cash");
    expect(result).toEqual({
      error: expect.stringContaining("開催中のイベントでのみ"),
    });
  });

  it("イベントメンバーでなければ拒否される", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      afterPartyAttendance: "declined",
      paymentMethod: "onsite",
    });
    // 別ユーザー（非メンバー）でログイン
    const outsider = await createUser();
    loginAs(outsider);

    const result = await recordOnsitePayment(event.id, inv.id, "cash");
    expect(result).toEqual({ error: "権限がありません" });
    logout();
  });

  it("請求額 0 の招待では受領できない", async () => {
    const { event, memberId } = await setupMember({
      attendanceFee: 0,
      afterPartyEnabled: false,
      afterPartyFee: 0,
    });
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });

    const result = await recordOnsitePayment(event.id, inv.id, "cash");
    expect(result).toEqual({
      error: expect.stringContaining("受領する金額がありません"),
    });
  });
});

describe("lookupInvitationByToken - 支払い情報", () => {
  it("lookup 結果に懇親会・請求・支払い情報が含まれる", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      token: "tok-payment",
      afterPartyAttendance: "attending",
      paymentMethod: "onsite",
    });
    await addCompanion({ invitationId: inv.id, afterPartyAttending: true });
    await addCompanion({ invitationId: inv.id, afterPartyAttending: false });

    const result = await lookupInvitationByToken(event.id, "tok-payment");
    if ("error" in result) throw new Error(result.error);
    expect(result.invitation.afterPartyAttendance).toBe("attending");
    expect(result.invitation.afterPartyCount).toBe(2);
    // 参加費 500×3 + 懇親会 1000×2 = 3500
    expect(result.invitation.payment.billing.total).toBe(3500);
    expect(result.invitation.payment.paidAt).toBeNull();
    expect(result.invitation.payment.paymentMethod).toBe("onsite");
  });
});
