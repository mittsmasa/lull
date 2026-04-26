import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { acceptPerformerInvitation } from "@/app/join/[token]/_actions";
import { db } from "@/db";
import { eventMembers, performerInvitations } from "@/db/schema";
import {
  addEventMember,
  addPerformerInvitation,
  createEvent,
  createUser,
} from "../factories";
import { loginAs, logout } from "../helpers/auth";

describe("acceptPerformerInvitation", () => {
  it("未ログインなら /join/<token> へリダイレクト", async () => {
    logout();
    await expect(
      acceptPerformerInvitation("any-token", "出演者"),
    ).rejects.toThrow("REDIRECT:/");
  });

  it("displayName が空ならエラー", async () => {
    const user = await createUser();
    loginAs(user);
    const result = await acceptPerformerInvitation("any-token", "  ");
    expect(result).toMatchObject({
      error: expect.stringContaining("表示名"),
    });
  });

  it("該当 token が存在しない", async () => {
    const user = await createUser();
    loginAs(user);
    const result = await acceptPerformerInvitation("missing-token", "出演者");
    expect(result).toMatchObject({ error: "この招待リンクは無効です" });
  });

  it("invalidated 招待は受諾不可", async () => {
    const user = await createUser();
    loginAs(user);
    const event = await createEvent({ status: "published" });
    const inv = await addPerformerInvitation({
      eventId: event.id,
      token: "tok-invalid",
      status: "invalidated",
    });

    const result = await acceptPerformerInvitation(inv.token, "出演者");
    expect(result).toMatchObject({ error: "この招待リンクは無効です" });
  });

  it("finished イベントは受諾不可", async () => {
    const user = await createUser();
    loginAs(user);
    const event = await createEvent({ status: "finished" });
    const inv = await addPerformerInvitation({
      eventId: event.id,
      token: "tok-finished",
      status: "pending",
    });

    const result = await acceptPerformerInvitation(inv.token, "出演者");
    expect(result).toMatchObject({ error: "この招待リンクは期限切れです" });
  });

  it("draft イベントでも新規受諾できる: eventMembers INSERT + status=accepted", async () => {
    const user = await createUser();
    loginAs(user);
    const event = await createEvent({ status: "draft" });
    const inv = await addPerformerInvitation({
      eventId: event.id,
      token: "tok-draft",
      status: "pending",
      displayName: "招待時の名前",
    });

    await expect(
      acceptPerformerInvitation(inv.token, "本人入力名"),
    ).rejects.toThrow(`REDIRECT:/events/${event.id}`);

    const member = await db.query.eventMembers.findFirst({
      where: and(
        eq(eventMembers.eventId, event.id),
        eq(eventMembers.userId, user.id),
      ),
    });
    expect(member).toMatchObject({
      role: "performer",
      displayName: "本人入力名",
    });

    const after = await db.query.performerInvitations.findFirst({
      where: eq(performerInvitations.id, inv.id),
    });
    expect(after).toMatchObject({
      status: "accepted",
      acceptedByUserId: user.id,
    });
    expect(after?.acceptedAt).toEqual(expect.any(Number));
  });

  it("既存 member の場合は INSERT せず redirect する", async () => {
    const user = await createUser();
    loginAs(user);
    const event = await createEvent({ status: "published" });
    // 既にメンバー（別経路で登録済み）
    await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
      displayName: "もとの名前",
    });
    const inv = await addPerformerInvitation({
      eventId: event.id,
      token: "tok-already-member",
      status: "pending",
    });

    await expect(
      acceptPerformerInvitation(inv.token, "新名前"),
    ).rejects.toThrow(`REDIRECT:/events/${event.id}`);

    // event_members は変更されない（INSERT されない、displayName も変わらない）
    const members = await db.query.eventMembers.findMany({
      where: and(
        eq(eventMembers.eventId, event.id),
        eq(eventMembers.userId, user.id),
      ),
    });
    expect(members).toHaveLength(1);
    expect(members[0]?.displayName).toBe("もとの名前");

    // 招待は pending のまま（受諾フローを通っていない）
    const after = await db.query.performerInvitations.findFirst({
      where: eq(performerInvitations.id, inv.id),
    });
    expect(after?.status).toBe("pending");
  });

  it("本人が既に accepted 済みの場合は redirect", async () => {
    const user = await createUser();
    loginAs(user);
    const event = await createEvent({ status: "published" });
    const inv = await addPerformerInvitation({
      eventId: event.id,
      token: "tok-self-accepted",
      status: "accepted",
      acceptedByUserId: user.id,
    });

    await expect(
      acceptPerformerInvitation(inv.token, "出演者"),
    ).rejects.toThrow(`REDIRECT:/events/${event.id}`);
  });

  it("別人が既に accepted した招待はエラー", async () => {
    const me = await createUser();
    const other = await createUser();
    loginAs(me);
    const event = await createEvent({ status: "published" });
    const inv = await addPerformerInvitation({
      eventId: event.id,
      token: "tok-other-accepted",
      status: "accepted",
      acceptedByUserId: other.id,
    });

    const result = await acceptPerformerInvitation(inv.token, "出演者");
    expect(result).toMatchObject({
      error: "この招待リンクは既に使用済みです",
    });
  });
});
