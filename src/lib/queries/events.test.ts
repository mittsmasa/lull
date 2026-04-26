import { describe, expect, it } from "vitest";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  addProgram,
  createEvent,
  createUser,
} from "../../../tests/db/factories";
import { getEventDetail, getEventStats, getEventsByUserId } from "./events";

describe("getEventsByUserId", () => {
  it("ユーザーが関わるイベントを role 付きで返す", async () => {
    const user = await createUser();
    const event = await createEvent({ name: "発表会A" });
    await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
    });

    const result = await getEventsByUserId(user.id);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: event.id,
      name: "発表会A",
      role: "organizer",
    });
  });

  it("未終了は startDatetime 昇順、finished は降順で末尾に並ぶ", async () => {
    const user = await createUser();
    const eventEarly = await createEvent({
      name: "早い",
      startDatetime: "2030-01-01T10:00:00Z",
      status: "published",
    });
    const eventLate = await createEvent({
      name: "遅い",
      startDatetime: "2030-06-01T10:00:00Z",
      status: "published",
    });
    const eventFinishedNew = await createEvent({
      name: "終了済(新)",
      startDatetime: "2025-06-01T10:00:00Z",
      status: "finished",
    });
    const eventFinishedOld = await createEvent({
      name: "終了済(旧)",
      startDatetime: "2024-01-01T10:00:00Z",
      status: "finished",
    });
    for (const e of [
      eventEarly,
      eventLate,
      eventFinishedNew,
      eventFinishedOld,
    ]) {
      await addEventMember({ eventId: e.id, userId: user.id });
    }

    const result = await getEventsByUserId(user.id);

    expect(result.map((r) => r.id)).toEqual([
      eventEarly.id,
      eventLate.id,
      eventFinishedNew.id,
      eventFinishedOld.id,
    ]);
  });

  it("関わっていないイベントは返さない", async () => {
    const user = await createUser();
    const other = await createUser();
    const event = await createEvent();
    await addEventMember({ eventId: event.id, userId: other.id });

    const result = await getEventsByUserId(user.id);

    expect(result).toHaveLength(0);
  });
});

describe("getEventDetail", () => {
  it("id 一致のイベントのみを返す", async () => {
    const target = await createEvent({ name: "対象" });
    await createEvent({ name: "別" });

    const result = await getEventDetail(target.id);

    expect(result?.id).toBe(target.id);
    expect(result?.name).toBe("対象");
  });

  it("存在しない id では undefined", async () => {
    const result = await getEventDetail("not-exist");
    expect(result).toBeUndefined();
  });
});

describe("getEventStats", () => {
  it("programs / performers / invitations 分布 / checkedIn を集計する", async () => {
    const event = await createEvent({ totalSeats: 50 });
    const inviter = await createUser();
    const memberId = await addEventMember({
      eventId: event.id,
      userId: inviter.id,
      role: "organizer",
    });

    // performer 2名
    const p1 = await createUser();
    const p2 = await createUser();
    await addEventMember({
      eventId: event.id,
      userId: p1.id,
      role: "performer",
    });
    await addEventMember({
      eventId: event.id,
      userId: p2.id,
      role: "performer",
    });

    // programs 3 件
    await addProgram({ eventId: event.id, sortOrder: 1 });
    await addProgram({ eventId: event.id, sortOrder: 2, type: "intermission" });
    await addProgram({ eventId: event.id, sortOrder: 3 });

    // invitations: accepted x2 (片方は checkedIn)、pending x1、declined x1、
    // 無効化済 x1（集計から除外される）
    const accepted1 = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      checkedIn: true,
      checkedInAt: 1000,
    });
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "pending",
    });
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "declined",
    });
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      invalidatedAt: 1,
    });

    // companions: checkedIn 2 / 未 1（accepted 招待に紐づくもののみ集計）
    await addCompanion({ invitationId: accepted1.id, checkedIn: true });
    await addCompanion({ invitationId: accepted1.id, checkedIn: true });
    await addCompanion({ invitationId: accepted1.id });

    const stats = await getEventStats(event.id);

    expect(stats).toEqual({
      programCount: 3,
      performerCount: 2,
      invitationTotal: 4,
      invitationAccepted: 2,
      invitationPending: 1,
      invitationDeclined: 1,
      checkedInGuests: 1,
      checkedInCompanions: 2,
      totalAttendees: 3,
    });
  });

  it("無効化済の招待に紐づく companions は checkedIn 集計対象外", async () => {
    const event = await createEvent();
    const inviter = await createUser();
    const memberId = await addEventMember({
      eventId: event.id,
      userId: inviter.id,
      role: "organizer",
    });

    const invalidated = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
      invalidatedAt: 1,
    });
    await addCompanion({ invitationId: invalidated.id, checkedIn: true });

    const stats = await getEventStats(event.id);
    expect(stats.checkedInCompanions).toBe(0);
    expect(stats.invitationTotal).toBe(0);
  });

  it("空イベントは全て 0", async () => {
    const event = await createEvent();
    const stats = await getEventStats(event.id);
    expect(stats).toEqual({
      programCount: 0,
      performerCount: 0,
      invitationTotal: 0,
      invitationAccepted: 0,
      invitationPending: 0,
      invitationDeclined: 0,
      checkedInGuests: 0,
      checkedInCompanions: 0,
      totalAttendees: 0,
    });
  });
});
