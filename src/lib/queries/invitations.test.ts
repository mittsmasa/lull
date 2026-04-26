import { describe, expect, it } from "vitest";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../../../tests/db/factories";
import {
  getCheckInList,
  getCheckInSummary,
  getConsumedSeats,
  getInvitationByToken,
  getInvitationsByEventId,
  getSeatSummary,
} from "./invitations";

describe("getConsumedSeats", () => {
  it("accepted の guest と companion を合算する。pending / declined は数えない", async () => {
    const event = await createEvent();
    const accepted = await addInvitation({
      eventId: event.id,
      status: "accepted",
    });
    await addCompanion({ invitationId: accepted.id });
    await addCompanion({ invitationId: accepted.id });
    await addInvitation({ eventId: event.id, status: "pending" });
    const declined = await addInvitation({
      eventId: event.id,
      status: "declined",
    });
    // declined に紐づく companion はカウントされない（実運用上は削除される想定だが念のため）
    await addCompanion({ invitationId: declined.id });

    const consumed = await getConsumedSeats(event.id);

    expect(consumed).toBe(1 + 2); // accepted guest + companions
  });

  it("他イベントの招待を含めない", async () => {
    const event = await createEvent();
    const other = await createEvent();
    await addInvitation({ eventId: other.id, status: "accepted" });

    expect(await getConsumedSeats(event.id)).toBe(0);
  });
});

describe("getSeatSummary", () => {
  it("totalSeats から consumed を引いた値を remaining に返す", async () => {
    const event = await createEvent({ totalSeats: 10 });
    await addInvitation({ eventId: event.id, status: "accepted" });

    const summary = await getSeatSummary(event.id, 10);
    expect(summary).toEqual({ totalSeats: 10, consumed: 1, remaining: 9 });
  });

  it("totalSeats が 0 のときは remaining = null（無制限扱い）", async () => {
    const event = await createEvent({ totalSeats: 0 });
    await addInvitation({ eventId: event.id, status: "accepted" });

    const summary = await getSeatSummary(event.id, 0);
    expect(summary).toEqual({ totalSeats: 0, consumed: 1, remaining: null });
  });
});

describe("getCheckInSummary / getCheckInList", () => {
  it("accepted のみ集計、guest / companion の checkedIn を分けて返す", async () => {
    const event = await createEvent();
    const accepted1 = await addInvitation({
      eventId: event.id,
      status: "accepted",
      checkedIn: true,
      checkedInAt: 1000,
    });
    await addCompanion({
      invitationId: accepted1.id,
      checkedIn: true,
      checkedInAt: 1100,
    });
    await addCompanion({ invitationId: accepted1.id });
    const accepted2 = await addInvitation({
      eventId: event.id,
      status: "accepted",
    });
    await addCompanion({ invitationId: accepted2.id });
    // pending / declined は集計対象外
    await addInvitation({ eventId: event.id, status: "pending" });
    await addInvitation({ eventId: event.id, status: "declined" });

    const summary = await getCheckInSummary(event.id);
    expect(summary).toEqual({
      totalAccepted: 2,
      totalCompanions: 3,
      checkedInGuests: 1,
      checkedInCompanions: 1,
    });

    const list = await getCheckInList(event.id);
    expect(list).toHaveLength(2);
    const a1 = list.find((r) => r.id === accepted1.id);
    expect(a1?.checkedIn).toBe(true);
    expect(a1?.companions).toHaveLength(2);
  });
});

describe("getInvitationByToken / getInvitationsByEventId", () => {
  it("member 削除済みの招待は inviterDisplayName にスナップショット名 + サフィックスが入る", async () => {
    const user = await createUser();
    const event = await createEvent();
    const memberId = await addEventMember({
      eventId: event.id,
      userId: user.id,
      displayName: "現在の名前",
    });
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      inviterDisplayName: "発行時の名前",
    });

    // 現在のメンバー名で表示される
    const got1 = await getInvitationByToken(inv.token);
    expect(got1?.inviterDisplayName).toBe("現在の名前");

    // memberId を null（削除済み相当）にすると、スナップショット名 + サフィックス
    const inv2 = await addInvitation({
      eventId: event.id,
      memberId: null,
      inviterDisplayName: "削除された人",
    });
    const got2 = await getInvitationByToken(inv2.token);
    expect(got2?.inviterDisplayName).toBe("削除された人（削除済み）");

    const list = await getInvitationsByEventId(event.id);
    const found = list.find((r) => r.id === inv2.id);
    expect(found?.inviterDisplayName).toBe("削除された人（削除済み）");
  });

  it("getInvitationByToken: token が一致しなければ undefined", async () => {
    const got = await getInvitationByToken("nonexistent-token");
    expect(got).toBeUndefined();
  });
});
