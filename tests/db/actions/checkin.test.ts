import { describe, expect, it } from "vitest";
import { searchInvitationByName } from "@/app/(main)/events/[eventId]/checkin/_actions";
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
