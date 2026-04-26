import { describe, expect, it } from "vitest";
import {
  addEventMember,
  addPerformerInvitation,
  createEvent,
  createUser,
} from "../../../tests/db/factories";
import {
  getEventMembers,
  getPerformerInvitationByToken,
  getPerformerInvitations,
} from "./members";

describe("getEventMembers", () => {
  it("該当 event の member のみを user.id 付きで返す", async () => {
    const event = await createEvent();
    const other = await createEvent();
    const u1 = await createUser();
    const u2 = await createUser();
    const u3 = await createUser();
    await addEventMember({
      eventId: event.id,
      userId: u1.id,
      role: "organizer",
      displayName: "主催",
    });
    await addEventMember({
      eventId: event.id,
      userId: u2.id,
      role: "performer",
      displayName: "出演A",
    });
    // 別イベントの member は混ざらない
    await addEventMember({
      eventId: other.id,
      userId: u3.id,
      role: "performer",
    });

    const members = await getEventMembers(event.id);

    expect(members).toHaveLength(2);
    const byUser = Object.fromEntries(members.map((m) => [m.user.id, m]));
    expect(byUser[u1.id]).toMatchObject({
      role: "organizer",
      displayName: "主催",
    });
    expect(byUser[u2.id]).toMatchObject({
      role: "performer",
      displayName: "出演A",
    });
  });

  it("member がいなければ空配列", async () => {
    const event = await createEvent();
    expect(await getEventMembers(event.id)).toEqual([]);
  });
});

describe("getPerformerInvitations", () => {
  it("該当 event の招待のみ返す", async () => {
    const event = await createEvent();
    const other = await createEvent();
    const a = await addPerformerInvitation({
      eventId: event.id,
      displayName: "招待A",
    });
    const b = await addPerformerInvitation({
      eventId: event.id,
      displayName: "招待B",
      status: "invalidated",
    });
    await addPerformerInvitation({
      eventId: other.id,
      displayName: "他イベント招待",
    });

    const list = await getPerformerInvitations(event.id);

    expect(list).toHaveLength(2);
    const ids = list.map((i) => i.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });
});

describe("getPerformerInvitationByToken", () => {
  it("token に対応する招待と event 情報を返す", async () => {
    const event = await createEvent({
      name: "発表会",
      venue: "ホール",
      status: "published",
    });
    const inv = await addPerformerInvitation({
      eventId: event.id,
      token: "tok-abc",
      displayName: "出演者",
    });

    const result = await getPerformerInvitationByToken("tok-abc");

    expect(result).toMatchObject({
      id: inv.id,
      token: "tok-abc",
      displayName: "出演者",
      status: "pending",
      acceptedByUserId: null,
      event: {
        id: event.id,
        name: "発表会",
        venue: "ホール",
        status: "published",
      },
    });
  });

  it("該当 token がなければ undefined", async () => {
    expect(await getPerformerInvitationByToken("missing")).toBeUndefined();
  });
});
