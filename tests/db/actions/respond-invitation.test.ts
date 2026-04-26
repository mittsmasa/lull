import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { respondToInvitation } from "@/app/i/[token]/_actions";
import { db } from "@/db";
import { companions, invitations } from "@/db/schema";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";

const baseGuestInfo = {
  guestName: "ゲスト花子",
  guestEmail: "guest@example.com",
};

async function setupInvitation(opts: {
  eventStatus?: "draft" | "published" | "ongoing" | "finished";
  totalSeats?: number;
  invitationStatus?: "pending" | "accepted" | "declined";
  existingCompanions?: number;
  invalidated?: boolean;
}) {
  const user = await createUser();
  const event = await createEvent({
    status: opts.eventStatus ?? "published",
    totalSeats: opts.totalSeats ?? 10,
  });
  const memberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role: "organizer",
  });
  const inv = await addInvitation({
    eventId: event.id,
    memberId,
    status: opts.invitationStatus ?? "pending",
    invalidatedAt: opts.invalidated ? 1 : undefined,
  });
  for (let i = 0; i < (opts.existingCompanions ?? 0); i++) {
    await addCompanion({ invitationId: inv.id, name: `既存${i}` });
  }
  return { event, inv };
}

describe("respondToInvitation - イベントステータス制約", () => {
  it("draft イベントは回答できない", async () => {
    const { inv } = await setupInvitation({ eventStatus: "draft" });
    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
    });
    expect(res).toEqual({ error: "現在準備中です" });
  });

  it("finished イベントは回答できない", async () => {
    const { inv } = await setupInvitation({ eventStatus: "finished" });
    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
    });
    expect(res).toEqual({ error: "この招待リンクは期限切れです" });
  });

  it("invalidated かつ pending: 無効と判定", async () => {
    const { inv } = await setupInvitation({
      eventStatus: "published",
      invitationStatus: "pending",
      invalidated: true,
    });
    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
    });
    expect(res).toEqual({ error: "この招待リンクは無効です" });
  });
});

describe("respondToInvitation - 受諾", () => {
  it("pending → accepted で companions 挿入、status / 回答日時が反映される", async () => {
    const { inv } = await setupInvitation({});
    const res = await respondToInvitation(inv.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: ["同伴1", "同伴2"],
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
      with: { companions: true },
    });
    expect(after).toMatchObject({
      status: "accepted",
      guestName: baseGuestInfo.guestName,
      guestEmail: baseGuestInfo.guestEmail,
    });
    expect(after?.respondedAt).toBeTruthy();
    expect(after?.companions.map((c) => c.name).sort()).toEqual([
      "同伴1",
      "同伴2",
    ]);
  });

  it("満席時は受諾できない（座席チェック）", async () => {
    const event = await createEvent({ status: "published", totalSeats: 1 });
    const user = await createUser();
    const memberId = await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
    });
    // 既に 1 席使用済み
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    const target = await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
    });
    const res = await respondToInvitation(target.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: [],
    });
    expect(res).toEqual({ error: expect.stringContaining("満席") });

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, target.id),
    });
    expect(after?.status).toBe("pending");
  });

  it("accepted → 同伴者数を増やす変更: 自分の現使用席を考慮した残席計算", async () => {
    // 3 席のイベントで自分 1 + 同伴 1 = 2 使用中。+1 同伴に増やせる（合計 3）
    const event = await createEvent({ status: "published", totalSeats: 3 });
    const user = await createUser();
    const memberId = await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
    });
    const target = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    await addCompanion({ invitationId: target.id, name: "旧同伴" });

    const res = await respondToInvitation(target.token, {
      ...baseGuestInfo,
      attendance: "accepted",
      companions: ["新同伴1", "新同伴2"],
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, target.id),
      with: { companions: true },
    });
    expect(after?.companions.map((c) => c.name).sort()).toEqual([
      "新同伴1",
      "新同伴2",
    ]);
  });
});

describe("respondToInvitation - 辞退", () => {
  it("accepted → declined: companions 削除 + checkedIn リセット", async () => {
    const event = await createEvent({ status: "published", totalSeats: 10 });
    const user = await createUser();
    const memberId = await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
    });
    const target = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: 100,
    });
    await addCompanion({ invitationId: target.id });

    const res = await respondToInvitation(target.token, {
      ...baseGuestInfo,
      attendance: "declined",
      companions: [],
    });
    expect(res).toBeUndefined();

    const after = await db.query.invitations.findFirst({
      where: eq(invitations.id, target.id),
    });
    expect(after).toMatchObject({
      status: "declined",
      checkedIn: false,
      checkedInAt: null,
    });
    const comps = await db
      .select()
      .from(companions)
      .where(eq(companions.invitationId, target.id));
    expect(comps).toHaveLength(0);
  });
});
