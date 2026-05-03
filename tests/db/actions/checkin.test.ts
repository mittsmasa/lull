import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lookupInvitationByToken,
  performBulkCheckIn,
  performCheckIn,
  undoCheckIn,
} from "@/app/(main)/events/[eventId]/checkin/_actions";
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

async function setupMember(
  eventOverrides: {
    status?: "draft" | "published" | "ongoing" | "finished";
    totalSeats?: number;
  } = {},
  role: "organizer" | "performer" = "organizer",
) {
  const user = await createUser();
  const event = await createEvent({
    status: "ongoing",
    totalSeats: 10,
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

describe("lookupInvitationByToken", () => {
  it("accepted 招待の token から招待情報を返す", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      token: "tok-accepted",
    });
    await addCompanion({ invitationId: inv.id, name: "同伴者A" });

    const result = await lookupInvitationByToken(event.id, "tok-accepted");
    if ("error" in result) throw new Error(result.error);
    expect(result.invitation.id).toBe(inv.id);
    expect(result.invitation.companions).toHaveLength(1);
    expect(result.invitation.companions[0]).toMatchObject({ name: "同伴者A" });
  });

  it("別イベントの token はエラー", async () => {
    const { event: ownEvent } = await setupMember();
    const otherEvent = await createEvent({ status: "ongoing" });
    const otherUser = await createUser();
    const otherMember = await addEventMember({
      eventId: otherEvent.id,
      userId: otherUser.id,
      role: "organizer",
    });
    await addInvitation({
      eventId: otherEvent.id,
      memberId: otherMember,
      status: "accepted",
      token: "tok-other",
    });
    const result = await lookupInvitationByToken(ownEvent.id, "tok-other");
    expect(result).toEqual({ error: expect.stringContaining("別のイベント") });
  });

  it("無効化された招待はエラー", async () => {
    const { event, memberId } = await setupMember();
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      token: "tok-invalidated",
      invalidatedAt: 1,
    });
    const result = await lookupInvitationByToken(event.id, "tok-invalidated");
    expect(result).toEqual({ error: expect.stringContaining("無効化") });
  });

  it("pending / declined はそれぞれエラーメッセージが異なる", async () => {
    const { event, memberId } = await setupMember();
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
      token: "tok-pending",
    });
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "declined",
      token: "tok-declined",
    });
    const pendingResult = await lookupInvitationByToken(
      event.id,
      "tok-pending",
    );
    expect(pendingResult).toEqual({
      error: expect.stringContaining("出欠回答"),
    });
    const declinedResult = await lookupInvitationByToken(
      event.id,
      "tok-declined",
    );
    expect(declinedResult).toEqual({ error: expect.stringContaining("辞退") });
  });

  it("存在しない token はエラー", async () => {
    const { event } = await setupMember();
    const result = await lookupInvitationByToken(event.id, "no-such-token");
    expect(result).toEqual({ error: expect.stringContaining("無効") });
  });

  it("ongoing 以外のイベントではエラー", async () => {
    const { event, memberId } = await setupMember({ status: "published" });
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      token: "tok-x",
    });
    const result = await lookupInvitationByToken(event.id, "tok-x");
    expect(result).toEqual({ error: expect.stringContaining("開催中") });
  });

  it("非メンバーは検索不可", async () => {
    const event = await createEvent({ status: "ongoing" });
    const stranger = await createUser();
    loginAs(stranger);
    const result = await lookupInvitationByToken(event.id, "tok");
    expect(result).toEqual({ error: "権限がありません" });
  });
});

describe("performCheckIn", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("guest: checkedIn=true + checkedInAt セットして summary を返す", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T10:00:00Z"));
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });

    const now = Date.now();
    const result = await performCheckIn(event.id, inv.id, "guest");
    if ("error" in result) throw new Error(result.error);
    expect(result.checkedInAt).toBe(now);
    expect(result.summary).toMatchObject({
      totalAccepted: 1,
      checkedInGuests: 1,
    });

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after).toMatchObject({ checkedIn: true, checkedInAt: now });
  });

  it("guest 二重チェックイン: 既存 checkedInAt がそのまま返る（冪等）", async () => {
    const { event, memberId } = await setupMember();
    const existing = 1_700_000_000_000;
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: existing,
    });

    const result = await performCheckIn(event.id, inv.id, "guest");
    if ("error" in result) throw new Error(result.error);
    expect(result.checkedInAt).toBe(existing);

    // DB の値が上書きされていない
    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.checkedInAt).toBe(existing);
  });

  it("companion: 指定 id の同伴者だけ checkedIn=true に更新される", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T10:00:00Z"));
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const target = await addCompanion({ invitationId: inv.id });
    const other = await addCompanion({ invitationId: inv.id });

    const now = Date.now();
    const result = await performCheckIn(
      event.id,
      inv.id,
      "companion",
      target.id,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.checkedInAt).toBe(now);

    const targetRow = await db.query.companions.findFirst({
      where: eq(companions.id, target.id),
    });
    const otherRow = await db.query.companions.findFirst({
      where: eq(companions.id, other.id),
    });
    expect(targetRow).toMatchObject({ checkedIn: true, checkedInAt: now });
    expect(otherRow).toMatchObject({ checkedIn: false, checkedInAt: null });
  });

  it("companion 二重チェックイン: 既存 checkedInAt がそのまま返る（冪等）", async () => {
    const { event, memberId } = await setupMember();
    const existing = 1_700_000_000_000;
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const c = await addCompanion({
      invitationId: inv.id,
      checkedIn: true,
      checkedInAt: existing,
    });
    const result = await performCheckIn(event.id, inv.id, "companion", c.id);
    if ("error" in result) throw new Error(result.error);
    expect(result.checkedInAt).toBe(existing);
  });

  it("companion: targetId 未指定はエラー", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const result = await performCheckIn(event.id, inv.id, "companion");
    expect(result).toEqual({ error: expect.stringContaining("同伴者ID") });
  });

  it("companion: 別招待の同伴者 id を渡すとエラー", async () => {
    const { event, memberId } = await setupMember();
    const invA = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const invB = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const compB = await addCompanion({ invitationId: invB.id });
    const result = await performCheckIn(
      event.id,
      invA.id,
      "companion",
      compB.id,
    );
    expect(result).toEqual({ error: expect.stringContaining("同伴者") });
  });

  it("ongoing 以外のイベントではエラー", async () => {
    const { event, memberId } = await setupMember({ status: "published" });
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const result = await performCheckIn(event.id, inv.id, "guest");
    expect(result).toEqual({ error: expect.stringContaining("開催中") });
  });

  it("accepted 以外の招待にはチェックインできない", async () => {
    const { event, memberId } = await setupMember();
    const pending = await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
    });
    const result = await performCheckIn(event.id, pending.id, "guest");
    expect(result).toEqual({ error: expect.stringContaining("出席") });
  });

  it("invalidated 招待にはチェックインできない", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      invalidatedAt: 1,
    });
    const result = await performCheckIn(event.id, inv.id, "guest");
    expect(result).toEqual({ error: expect.stringContaining("無効化") });
  });

  it("非メンバーは実行不可", async () => {
    const event = await createEvent({ status: "ongoing" });
    const stranger = await createUser();
    loginAs(stranger);
    const result = await performCheckIn(event.id, "any", "guest");
    expect(result).toEqual({ error: "権限がありません" });
  });

  it("別イベント配下の invitationId はエラー", async () => {
    const { event: ownEvent } = await setupMember();
    const otherEvent = await createEvent({ status: "ongoing" });
    const otherUser = await createUser();
    const otherMember = await addEventMember({
      eventId: otherEvent.id,
      userId: otherUser.id,
      role: "organizer",
    });
    const otherInv = await addInvitation({
      eventId: otherEvent.id,
      memberId: otherMember,
      status: "accepted",
    });
    const result = await performCheckIn(ownEvent.id, otherInv.id, "guest");
    expect(result).toEqual({
      error: expect.stringContaining("見つかりません"),
    });
  });
});

describe("undoCheckIn", () => {
  it("guest: checkedIn=false + checkedInAt=null にリセット", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: 1234,
    });

    const result = await undoCheckIn(event.id, inv.id, "guest");
    if ("error" in result) throw new Error(result.error);
    expect(result.summary).toMatchObject({ checkedInGuests: 0 });

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after).toMatchObject({ checkedIn: false, checkedInAt: null });
  });

  it("companion: 指定 id の同伴者だけリセット", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const target = await addCompanion({
      invitationId: inv.id,
      checkedIn: true,
      checkedInAt: 100,
    });
    const other = await addCompanion({
      invitationId: inv.id,
      checkedIn: true,
      checkedInAt: 200,
    });

    const result = await undoCheckIn(event.id, inv.id, "companion", target.id);
    if ("error" in result) throw new Error(result.error);

    const targetRow = await db.query.companions.findFirst({
      where: eq(companions.id, target.id),
    });
    const otherRow = await db.query.companions.findFirst({
      where: eq(companions.id, other.id),
    });
    expect(targetRow).toMatchObject({ checkedIn: false, checkedInAt: null });
    expect(otherRow).toMatchObject({ checkedIn: true, checkedInAt: 200 });
  });

  it("companion: targetId 未指定はエラー", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const result = await undoCheckIn(event.id, inv.id, "companion");
    expect(result).toEqual({ error: expect.stringContaining("同伴者ID") });
  });

  it("companion: 別招待配下の id は弾く", async () => {
    const { event, memberId } = await setupMember();
    const invA = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const invB = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const compB = await addCompanion({
      invitationId: invB.id,
      checkedIn: true,
      checkedInAt: 100,
    });

    const result = await undoCheckIn(event.id, invA.id, "companion", compB.id);
    expect(result).toEqual({ error: expect.stringContaining("同伴者") });

    // invB 配下の同伴者は変わらない
    const stillCheckedIn = await db.query.companions.findFirst({
      where: eq(companions.id, compB.id),
    });
    expect(stillCheckedIn).toMatchObject({ checkedIn: true, checkedInAt: 100 });
  });

  it("ongoing 以外（finished 含む）では取り消し不可", async () => {
    const { event, memberId } = await setupMember({ status: "finished" });
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: 1,
    });
    const result = await undoCheckIn(event.id, inv.id, "guest");
    expect(result).toEqual({ error: expect.stringContaining("開催中") });
  });

  it("非メンバーは取り消し不可", async () => {
    const event = await createEvent({ status: "ongoing" });
    const stranger = await createUser();
    loginAs(stranger);
    const result = await undoCheckIn(event.id, "any", "guest");
    expect(result).toEqual({ error: "権限がありません" });
  });

  it("別イベント配下の invitationId はエラー", async () => {
    const { event: ownEvent } = await setupMember();
    const otherEvent = await createEvent({ status: "ongoing" });
    const otherUser = await createUser();
    const otherMember = await addEventMember({
      eventId: otherEvent.id,
      userId: otherUser.id,
      role: "organizer",
    });
    const otherInv = await addInvitation({
      eventId: otherEvent.id,
      memberId: otherMember,
      status: "accepted",
    });
    const result = await undoCheckIn(ownEvent.id, otherInv.id, "guest");
    expect(result).toEqual({
      error: expect.stringContaining("見つかりません"),
    });
  });
});

describe("performBulkCheckIn", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("全員未チェックイン: 本人 + 全同伴者を更新し updated=true を返す", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T10:00:00Z"));
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const compA = await addCompanion({ invitationId: inv.id });
    const compB = await addCompanion({ invitationId: inv.id });

    const now = Date.now();
    const result = await performBulkCheckIn(event.id, inv.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.checkedInAt).toBe(now);
    expect(result.guest).toEqual({ updated: true });
    expect(result.companions).toEqual(
      expect.arrayContaining([
        { id: compA.id, updated: true },
        { id: compB.id, updated: true },
      ]),
    );
    expect(result.companions).toHaveLength(2);
    expect(result.summary).toMatchObject({
      totalAccepted: 1,
      checkedInGuests: 1,
      checkedInCompanions: 2,
    });

    const invAfter = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(invAfter).toMatchObject({ checkedIn: true, checkedInAt: now });
    const compARow = await db.query.companions.findFirst({
      where: eq(companions.id, compA.id),
    });
    const compBRow = await db.query.companions.findFirst({
      where: eq(companions.id, compB.id),
    });
    expect(compARow).toMatchObject({ checkedIn: true, checkedInAt: now });
    expect(compBRow).toMatchObject({ checkedIn: true, checkedInAt: now });
  });

  it("本人のみ既済: guest.updated=false、同伴者だけ更新", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T10:00:00Z"));
    const guestExisting = 1_700_000_000_000;
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: guestExisting,
    });
    const comp = await addCompanion({ invitationId: inv.id });

    const now = Date.now();
    const result = await performBulkCheckIn(event.id, inv.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.guest).toEqual({ updated: false });
    expect(result.companions).toEqual([{ id: comp.id, updated: true }]);

    const invAfter = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    // 既存の checkedInAt は上書きされない
    expect(invAfter?.checkedInAt).toBe(guestExisting);
    const compRow = await db.query.companions.findFirst({
      where: eq(companions.id, comp.id),
    });
    expect(compRow).toMatchObject({ checkedIn: true, checkedInAt: now });
  });

  it("同伴者の一部が既済: 既済は updated=false で時刻保持、未済のみ更新", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T10:00:00Z"));
    const compExisting = 1_700_000_000_000;
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const done = await addCompanion({
      invitationId: inv.id,
      checkedIn: true,
      checkedInAt: compExisting,
    });
    const todo = await addCompanion({ invitationId: inv.id });

    const now = Date.now();
    const result = await performBulkCheckIn(event.id, inv.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.guest).toEqual({ updated: true });
    expect(result.companions).toEqual(
      expect.arrayContaining([
        { id: done.id, updated: false },
        { id: todo.id, updated: true },
      ]),
    );

    const doneRow = await db.query.companions.findFirst({
      where: eq(companions.id, done.id),
    });
    const todoRow = await db.query.companions.findFirst({
      where: eq(companions.id, todo.id),
    });
    // 既済は時刻据え置き、未済は now
    expect(doneRow).toMatchObject({
      checkedIn: true,
      checkedInAt: compExisting,
    });
    expect(todoRow).toMatchObject({ checkedIn: true, checkedInAt: now });
  });

  it("全員既済: guest.updated=false かつ companions 全部 updated=false（冪等）", async () => {
    const guestExisting = 1_700_000_000_000;
    const compExisting = 1_700_000_000_111;
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: guestExisting,
    });
    const comp = await addCompanion({
      invitationId: inv.id,
      checkedIn: true,
      checkedInAt: compExisting,
    });

    const result = await performBulkCheckIn(event.id, inv.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.guest).toEqual({ updated: false });
    expect(result.companions).toEqual([{ id: comp.id, updated: false }]);

    const invAfter = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    const compRow = await db.query.companions.findFirst({
      where: eq(companions.id, comp.id),
    });
    expect(invAfter?.checkedInAt).toBe(guestExisting);
    expect(compRow?.checkedInAt).toBe(compExisting);
  });

  it("同伴者なし: companions が空配列で本人のみ更新", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });

    const result = await performBulkCheckIn(event.id, inv.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.guest).toEqual({ updated: true });
    expect(result.companions).toEqual([]);
  });

  it("ongoing 以外のイベントではエラー", async () => {
    const { event, memberId } = await setupMember({ status: "published" });
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const result = await performBulkCheckIn(event.id, inv.id);
    expect(result).toEqual({ error: expect.stringContaining("開催中") });
  });

  it("accepted 以外の招待にはチェックインできない", async () => {
    const { event, memberId } = await setupMember();
    const pending = await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
    });
    const result = await performBulkCheckIn(event.id, pending.id);
    expect(result).toEqual({ error: expect.stringContaining("出席") });
  });

  it("invalidated 招待にはチェックインできない", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      invalidatedAt: 1,
    });
    const result = await performBulkCheckIn(event.id, inv.id);
    expect(result).toEqual({ error: expect.stringContaining("無効化") });
  });

  it("非メンバーは実行不可", async () => {
    const event = await createEvent({ status: "ongoing" });
    const stranger = await createUser();
    loginAs(stranger);
    const result = await performBulkCheckIn(event.id, "any");
    expect(result).toEqual({ error: "権限がありません" });
  });

  it("別イベント配下の invitationId はエラー", async () => {
    const { event: ownEvent } = await setupMember();
    const otherEvent = await createEvent({ status: "ongoing" });
    const otherUser = await createUser();
    const otherMember = await addEventMember({
      eventId: otherEvent.id,
      userId: otherUser.id,
      role: "organizer",
    });
    const otherInv = await addInvitation({
      eventId: otherEvent.id,
      memberId: otherMember,
      status: "accepted",
    });
    const result = await performBulkCheckIn(ownEvent.id, otherInv.id);
    expect(result).toEqual({
      error: expect.stringContaining("見つかりません"),
    });
  });
});
