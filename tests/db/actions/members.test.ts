import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createPerformerInvitation,
  deletePerformerInvitation,
  invalidatePerformerInvitation,
  removeMember,
  updateDisplayName,
} from "@/app/(main)/events/[eventId]/members/_actions";
import { db } from "@/db";
import {
  type EventStatus,
  eventMembers,
  performerInvitations,
} from "@/db/schema";
import {
  addEventMember,
  addPerformerInvitation,
  addProgram,
  addProgramPerformer,
  createEvent,
  createUser,
} from "../factories";
import { loginAs } from "../helpers/auth";

async function setupOrganizer(eventOverrides: { status?: EventStatus } = {}) {
  const user = await createUser();
  const event = await createEvent({
    status: eventOverrides.status ?? "published",
  });
  const memberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role: "organizer",
    displayName: "主催者",
  });
  loginAs(user);
  return { user, event, memberId };
}

function fd(displayName: string) {
  const f = new FormData();
  f.set("displayName", displayName);
  return f;
}

describe("createPerformerInvitation", () => {
  it("token 付きで performer_invitations に INSERT する", async () => {
    const { event } = await setupOrganizer();

    const result = await createPerformerInvitation(
      event.id,
      null,
      fd("出演者A"),
    );

    expect(result).toEqual({ token: expect.any(String) });
    const rows = await db.query.performerInvitations.findMany({
      where: eq(performerInvitations.eventId, event.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      displayName: "出演者A",
      status: "pending",
      acceptedByUserId: null,
    });
    expect(rows[0]?.token).toEqual(expect.any(String));
  });

  it("非主催者は発行不可", async () => {
    const { event } = await setupOrganizer();
    const stranger = await createUser();
    loginAs(stranger);

    const result = await createPerformerInvitation(
      event.id,
      null,
      fd("出演者"),
    );
    expect(result).toMatchObject({ error: "権限がありません" });
  });

  it("ongoing イベントでは発行できない", async () => {
    const { event } = await setupOrganizer({ status: "ongoing" });
    const result = await createPerformerInvitation(
      event.id,
      null,
      fd("出演者"),
    );
    expect(result).toMatchObject({
      error: expect.stringContaining("発行できません"),
    });
  });

  it("displayName が空ならバリデーションエラー", async () => {
    const { event } = await setupOrganizer();
    const result = await createPerformerInvitation(event.id, null, fd("  "));
    expect(result).toMatchObject({
      error: expect.stringContaining("表示名"),
      fields: { displayName: "  " },
    });
  });
});

describe("updateDisplayName", () => {
  it("自分の event_members.displayName のみ更新する", async () => {
    const { user, event } = await setupOrganizer();
    // 別ユーザーの member も置く
    const other = await createUser();
    const otherMemberId = await addEventMember({
      eventId: event.id,
      userId: other.id,
      role: "performer",
      displayName: "他人",
    });

    const result = await updateDisplayName(event.id, null, fd("新しい名前"));
    expect(result).toBeNull();

    const me = await db.query.eventMembers.findFirst({
      where: and(
        eq(eventMembers.eventId, event.id),
        eq(eventMembers.userId, user.id),
      ),
    });
    expect(me?.displayName).toBe("新しい名前");

    const others = await db.query.eventMembers.findFirst({
      where: eq(eventMembers.id, otherMemberId),
    });
    expect(others?.displayName).toBe("他人");
  });

  it("自分が member でない場合はエラー", async () => {
    const event = await createEvent({ status: "published" });
    const stranger = await createUser();
    loginAs(stranger);

    const result = await updateDisplayName(event.id, null, fd("名前"));
    expect(result).toMatchObject({ error: "メンバーが見つかりません" });
  });

  it("finished イベントでは変更できない", async () => {
    const { event } = await setupOrganizer({ status: "finished" });
    const result = await updateDisplayName(event.id, null, fd("名前"));
    expect(result).toMatchObject({
      error: expect.stringContaining("変更できません"),
    });
  });
});

describe("removeMember", () => {
  it("組織者は削除不可", async () => {
    const { event, memberId } = await setupOrganizer();
    const result = await removeMember(event.id, memberId);
    expect(result).toMatchObject({ error: "主催者は削除できません" });
  });

  it("programPerformers に紐づいた member は削除不可", async () => {
    const { event } = await setupOrganizer();
    const target = await createUser();
    const targetMemberId = await addEventMember({
      eventId: event.id,
      userId: target.id,
      role: "performer",
    });
    const program = await addProgram({ eventId: event.id });
    await addProgramPerformer({
      programId: program.id,
      memberId: targetMemberId,
    });

    const result = await removeMember(event.id, targetMemberId);
    expect(result).toMatchObject({
      error: expect.stringContaining("プログラム"),
    });

    const still = await db.query.eventMembers.findFirst({
      where: eq(eventMembers.id, targetMemberId),
    });
    expect(still).toBeDefined();
  });

  it("通常の performer 削除で eventMembers と該当 acceptedInvitation を連鎖削除する", async () => {
    const { event } = await setupOrganizer();
    const target = await createUser();
    const targetMemberId = await addEventMember({
      eventId: event.id,
      userId: target.id,
      role: "performer",
    });
    // 受諾済みの招待
    const acceptedInv = await addPerformerInvitation({
      eventId: event.id,
      status: "accepted",
      acceptedByUserId: target.id,
    });
    // 別人の招待は残るはず
    const otherInv = await addPerformerInvitation({
      eventId: event.id,
      status: "pending",
    });

    const result = await removeMember(event.id, targetMemberId);
    expect(result).toBeUndefined();

    const member = await db.query.eventMembers.findFirst({
      where: eq(eventMembers.id, targetMemberId),
    });
    expect(member).toBeUndefined();

    const accepted = await db.query.performerInvitations.findFirst({
      where: eq(performerInvitations.id, acceptedInv.id),
    });
    expect(accepted).toBeUndefined();

    const survivor = await db.query.performerInvitations.findFirst({
      where: eq(performerInvitations.id, otherInv.id),
    });
    expect(survivor).toBeDefined();
  });

  it("非主催者は削除不可", async () => {
    const { event } = await setupOrganizer();
    const target = await createUser();
    const targetMemberId = await addEventMember({
      eventId: event.id,
      userId: target.id,
      role: "performer",
    });
    const stranger = await createUser();
    loginAs(stranger);

    const result = await removeMember(event.id, targetMemberId);
    expect(result).toMatchObject({ error: "権限がありません" });
  });

  it("finished イベントでは削除不可", async () => {
    const { event } = await setupOrganizer({ status: "finished" });
    const target = await createUser();
    const targetMemberId = await addEventMember({
      eventId: event.id,
      userId: target.id,
      role: "performer",
    });
    const result = await removeMember(event.id, targetMemberId);
    expect(result).toMatchObject({
      error: expect.stringContaining("削除できません"),
    });
  });
});

describe("invalidatePerformerInvitation", () => {
  it("pending → invalidated に変える", async () => {
    const { event } = await setupOrganizer();
    const inv = await addPerformerInvitation({
      eventId: event.id,
      status: "pending",
    });

    const result = await invalidatePerformerInvitation(event.id, inv.id);
    expect(result).toBeUndefined();

    const after = await db.query.performerInvitations.findFirst({
      where: eq(performerInvitations.id, inv.id),
    });
    expect(after?.status).toBe("invalidated");
  });

  it("accepted は無効化できない", async () => {
    const { event } = await setupOrganizer();
    const accepter = await createUser();
    const inv = await addPerformerInvitation({
      eventId: event.id,
      status: "accepted",
      acceptedByUserId: accepter.id,
    });
    const result = await invalidatePerformerInvitation(event.id, inv.id);
    expect(result).toMatchObject({
      error: expect.stringContaining("無効化"),
    });

    const after = await db.query.performerInvitations.findFirst({
      where: eq(performerInvitations.id, inv.id),
    });
    expect(after?.status).toBe("accepted");
  });

  it("非主催者は無効化不可", async () => {
    const { event } = await setupOrganizer();
    const inv = await addPerformerInvitation({
      eventId: event.id,
      status: "pending",
    });
    const stranger = await createUser();
    loginAs(stranger);

    const result = await invalidatePerformerInvitation(event.id, inv.id);
    expect(result).toMatchObject({ error: "権限がありません" });
  });
});

describe("deletePerformerInvitation", () => {
  it("invalidated 招待のみ削除できる", async () => {
    const { event } = await setupOrganizer();
    const inv = await addPerformerInvitation({
      eventId: event.id,
      status: "invalidated",
    });

    const result = await deletePerformerInvitation(event.id, inv.id);
    expect(result).toBeUndefined();

    const after = await db.query.performerInvitations.findFirst({
      where: eq(performerInvitations.id, inv.id),
    });
    expect(after).toBeUndefined();
  });

  it("pending は削除できない", async () => {
    const { event } = await setupOrganizer();
    const inv = await addPerformerInvitation({
      eventId: event.id,
      status: "pending",
    });
    const result = await deletePerformerInvitation(event.id, inv.id);
    expect(result).toMatchObject({
      error: expect.stringContaining("無効化済み"),
    });

    const still = await db.query.performerInvitations.findFirst({
      where: eq(performerInvitations.id, inv.id),
    });
    expect(still).toBeDefined();
  });

  it("accepted は削除できない", async () => {
    const { event } = await setupOrganizer();
    const accepter = await createUser();
    const inv = await addPerformerInvitation({
      eventId: event.id,
      status: "accepted",
      acceptedByUserId: accepter.id,
    });
    const result = await deletePerformerInvitation(event.id, inv.id);
    expect(result).toMatchObject({
      error: expect.stringContaining("無効化済み"),
    });
  });
});
