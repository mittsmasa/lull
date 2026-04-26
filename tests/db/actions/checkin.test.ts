import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lookupInvitationByToken,
  performCheckIn,
  searchInvitationByName,
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

describe("searchInvitationByName", () => {
  it("guestName の部分一致で accepted の招待を返す", async () => {
    const { event, memberId } = await setupMember();
    const matched = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      guestName: "山田太郎",
    });
    // status=accepted 以外は除外される
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
      guestName: "山田花子",
    });
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "declined",
      guestName: "山田次郎",
    });
    // 名前不一致
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      guestName: "鈴木一郎",
    });

    const result = await searchInvitationByName(event.id, "山田");
    if ("error" in result) throw new Error(result.error);
    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0]).toMatchObject({
      id: matched.id,
      guestNameMatched: true,
      matchedCompanionIds: [],
    });
  });

  it("companion 名の部分一致でもヒットし、matchedCompanionIds が返る", async () => {
    const { event, memberId } = await setupMember();
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      guestName: "ゲスト",
    });
    const c1 = await addCompanion({
      invitationId: inv.id,
      name: "佐藤次郎",
    });
    await addCompanion({
      invitationId: inv.id,
      name: "別人",
    });

    const result = await searchInvitationByName(event.id, "佐藤");
    if ("error" in result) throw new Error(result.error);
    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0].guestNameMatched).toBe(false);
    expect(result.invitations[0].matchedCompanionIds).toEqual([c1.id]);
  });

  it("空文字クエリでは空配列を返す", async () => {
    const { event } = await setupMember();
    const result = await searchInvitationByName(event.id, "   ");
    if ("error" in result) throw new Error(result.error);
    expect(result.invitations).toEqual([]);
  });

  it("ongoing 以外のイベントではエラー", async () => {
    const { event } = await setupMember({ status: "published" });
    const result = await searchInvitationByName(event.id, "誰か");
    expect(result).toEqual({ error: expect.stringContaining("開催中") });
  });

  it("非メンバーは検索不可", async () => {
    const event = await createEvent({ status: "ongoing" });
    const stranger = await createUser();
    loginAs(stranger);
    const result = await searchInvitationByName(event.id, "誰か");
    expect(result).toEqual({ error: "権限がありません" });
  });
});

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
