import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createGuestInvitation,
  deleteInvitation,
  invalidateInvitation,
  proxyChangeStatus,
} from "@/app/(main)/events/[eventId]/invitations/_actions";
import { db } from "@/db";
import { companions, invitations } from "@/db/schema";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";
import { loginAs } from "../helpers/auth";

async function setupOrganizer(
  eventOverrides: {
    totalSeats?: number;
    status?: "draft" | "published" | "ongoing" | "finished";
  } = {},
) {
  const user = await createUser();
  const event = await createEvent({
    status: "published",
    totalSeats: 10,
    ...eventOverrides,
  });
  const memberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role: "organizer",
  });
  loginAs(user);
  return { user, event, memberId };
}

describe("createGuestInvitation", () => {
  it("token を発行し、memberId 紐付けで invitations に INSERT する", async () => {
    const { event, memberId } = await setupOrganizer();

    const result = await createGuestInvitation(event.id, "ゲスト太郎");
    expect(result).toEqual({ token: expect.any(String) });

    const rows = await db.query.invitations.findMany({
      where: eq(invitations.eventId, event.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId,
      guestName: "ゲスト太郎",
      status: "pending",
    });
  });

  it("draft イベントには発行できない", async () => {
    const { event } = await setupOrganizer({ status: "draft" });
    const result = await createGuestInvitation(event.id);
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("非メンバーは発行不可", async () => {
    const event = await createEvent({ status: "published" });
    const stranger = await createUser();
    loginAs(stranger);
    const result = await createGuestInvitation(event.id);
    expect(result).toEqual({ error: "権限がありません" });
  });
});

describe("invalidateInvitation", () => {
  it("pending → invalidatedAt のみセット、座席は変わらない", async () => {
    const { event, memberId } = await setupOrganizer();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
    });

    const result = await invalidateInvitation(event.id, inv.id);
    expect(result).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.invalidatedAt).toBeTruthy();
    expect(after?.status).toBe("pending");
  });

  it("accepted → status=declined + companions 全削除で座席が解放される", async () => {
    const { event, memberId } = await setupOrganizer();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: 1234,
    });
    await addCompanion({ invitationId: inv.id });
    await addCompanion({ invitationId: inv.id });

    const result = await invalidateInvitation(event.id, inv.id);
    expect(result).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after).toMatchObject({
      status: "declined",
      checkedIn: false,
      checkedInAt: null,
    });
    expect(after?.invalidatedAt).toBeTruthy();

    const remainingCompanions = await db
      .select()
      .from(companions)
      .where(eq(companions.invitationId, inv.id));
    expect(remainingCompanions).toHaveLength(0);
  });

  it("既に無効化されているとエラー", async () => {
    const { event, memberId } = await setupOrganizer();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
      invalidatedAt: 1,
    });
    const result = await invalidateInvitation(event.id, inv.id);
    expect(result).toEqual({ error: expect.stringContaining("無効化") });
  });

  it("出演者は他人が発行した招待を無効化できない", async () => {
    const { event } = await setupOrganizer();
    const performerUser = await createUser();
    await addEventMember({
      eventId: event.id,
      userId: performerUser.id,
      role: "performer",
    });
    const otherUser = await createUser();
    const otherMemberId = await addEventMember({
      eventId: event.id,
      userId: otherUser.id,
      role: "performer",
    });
    const inv = await addInvitation({
      eventId: event.id,
      memberId: otherMemberId,
      status: "pending",
    });
    // 出演者本人としてログイン
    loginAs(performerUser);
    const result = await invalidateInvitation(event.id, inv.id);
    expect(result).toEqual({ error: "権限がありません" });
  });
});

describe("proxyChangeStatus", () => {
  it("declined → accepted: 空きあり時は成功、座席消費数が増える", async () => {
    const { event, memberId } = await setupOrganizer({ totalSeats: 5 });
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "declined",
    });

    const result = await proxyChangeStatus(event.id, inv.id, "accepted");
    expect(result).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.status).toBe("accepted");
    expect(after?.respondedAt).toBeTruthy();
  });

  it("declined → accepted: 満席時はエラー", async () => {
    const { event, memberId } = await setupOrganizer({ totalSeats: 1 });
    // 既に満席
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const target = await addInvitation({
      eventId: event.id,
      memberId,
      status: "declined",
    });

    const result = await proxyChangeStatus(event.id, target.id, "accepted");
    expect(result).toEqual({ error: expect.stringContaining("満席") });

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, target.id),
    });
    expect(after?.status).toBe("declined");
  });

  it("accepted → declined: companions 削除 + checkedIn リセット", async () => {
    const { event, memberId } = await setupOrganizer();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: 1000,
    });
    await addCompanion({ invitationId: inv.id });

    const result = await proxyChangeStatus(event.id, inv.id, "declined");
    expect(result).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after).toMatchObject({
      status: "declined",
      checkedIn: false,
      checkedInAt: null,
    });
    const comps = await db
      .select()
      .from(companions)
      .where(eq(companions.invitationId, inv.id));
    expect(comps).toHaveLength(0);
  });

  it("pending には適用不可", async () => {
    const { event, memberId } = await setupOrganizer();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
    });
    const result = await proxyChangeStatus(event.id, inv.id, "accepted");
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("organizer 以外は不可", async () => {
    const { event, memberId } = await setupOrganizer();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "declined",
    });
    const performer = await createUser();
    await addEventMember({
      eventId: event.id,
      userId: performer.id,
      role: "performer",
    });
    loginAs(performer);
    const result = await proxyChangeStatus(event.id, inv.id, "accepted");
    expect(result).toEqual({ error: "権限がありません" });
  });
});

describe("deleteInvitation", () => {
  it("invalidated のみ DELETE 可、それ以外はエラー", async () => {
    const { event, memberId } = await setupOrganizer();

    const active = await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
    });
    const fail = await deleteInvitation(event.id, active.id);
    expect(fail).toEqual({ error: expect.any(String) });
    const stillThere = await db.query.invitations.findFirst({
      where: eq(invitations.id, active.id),
    });
    expect(stillThere).toBeDefined();

    const invalidated = await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
      invalidatedAt: 1,
    });
    const ok = await deleteInvitation(event.id, invalidated.id);
    expect(ok).toBeUndefined();
    const gone = await db.query.invitations.findFirst({
      where: eq(invitations.id, invalidated.id),
    });
    expect(gone).toBeUndefined();
  });
});
