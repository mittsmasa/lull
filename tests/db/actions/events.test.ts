import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEvent as createEventAction,
  deleteEvent,
  updateEvent,
  updateEventStatus,
} from "@/app/(main)/events/_actions";
import { db } from "@/db";
import { type EventStatus, eventMembers, events } from "@/db/schema";
import {
  addCompanion,
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";
import { loginAs } from "../helpers/auth";

function buildCreateForm(overrides: Partial<Record<string, string>> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: "テスト発表会",
    date: "2030-05-01",
    startTime: "13:00",
    openTime: "12:30",
    venue: "ホールA",
    totalSeats: "100",
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v !== undefined) fd.set(k, v);
  }
  return fd;
}

describe("createEvent", () => {
  beforeEach(() => {
    // 2030-04-26 12:00 JST (= 03:00 UTC) を「現在」として固定
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-04-26T03:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("events INSERT + organizer eventMembers INSERT し、event を返す", async () => {
    const user = await createUser({ name: "主催者" });
    loginAs(user);

    const result = await createEventAction(null, buildCreateForm());
    expect(result).toMatchObject({ event: expect.any(Object) });

    const all = await db.select().from(events);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      name: "テスト発表会",
      venue: "ホールA",
      startDatetime: "2030-05-01T13:00",
      openDatetime: "2030-05-01T12:30",
      totalSeats: 100,
      status: "draft",
    });

    const members = await db
      .select()
      .from(eventMembers)
      .where(eq(eventMembers.eventId, all[0].id));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      userId: user.id,
      role: "organizer",
      displayName: "主催者",
    });
  });

  it("JST 当日は登録可", async () => {
    // 2030-04-26 が JST today なので、その日付なら成功する
    const user = await createUser();
    loginAs(user);

    const result = await createEventAction(
      null,
      buildCreateForm({ date: "2030-04-26" }),
    );
    expect(result).toMatchObject({ event: expect.any(Object) });
  });

  it("JST 過去日はエラー", async () => {
    const user = await createUser();
    loginAs(user);

    const result = await createEventAction(
      null,
      buildCreateForm({ date: "2030-04-25" }),
    );
    expect(result).toMatchObject({
      fieldErrors: { date: expect.stringContaining("当日以降") },
    });
    const all = await db.select().from(events);
    expect(all).toHaveLength(0);
  });

  it("UTC では前日でも JST では当日扱いになる境界", async () => {
    // 2030-04-26T15:00Z = 2030-04-27T00:00 JST
    vi.setSystemTime(new Date("2030-04-26T15:00:00Z"));
    const user = await createUser();
    loginAs(user);

    // JST 4/27 が today なので、4/26 は NG
    const ng = await createEventAction(
      null,
      buildCreateForm({ date: "2030-04-26" }),
    );
    expect(ng).toMatchObject({
      fieldErrors: { date: expect.stringContaining("当日以降") },
    });

    // 4/27 は OK
    const ok = await createEventAction(
      null,
      buildCreateForm({ date: "2030-04-27" }),
    );
    expect(ok).toMatchObject({ event: expect.any(Object) });
  });

  it("openTime が startTime より後だとエラー", async () => {
    const user = await createUser();
    loginAs(user);

    const result = await createEventAction(
      null,
      buildCreateForm({ startTime: "13:00", openTime: "14:00" }),
    );
    expect(result).toMatchObject({
      fieldErrors: { openTime: expect.stringContaining("開場") },
    });
  });
});

describe("updateEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-04-26T03:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function setupOrganizer(
    eventOverrides: Partial<{
      status: EventStatus;
      totalSeats: number;
      startDatetime: string;
      openDatetime: string | null;
    }> = {},
  ) {
    const user = await createUser();
    const event = await createEvent({
      status: "published",
      totalSeats: 10,
      startDatetime: "2030-05-01T13:00",
      openDatetime: "2030-05-01T12:30",
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

  function buildUpdateForm(overrides: Record<string, string> = {}) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(overrides)) {
      fd.set(k, v);
    }
    return fd;
  }

  it("通常更新が反映される", async () => {
    const { event } = await setupOrganizer();
    const result = await updateEvent(
      event.id,
      null,
      buildUpdateForm({ name: "改名後", venue: "ホールB" }),
    );
    expect(result).toMatchObject({ event: expect.any(Object) });
    const after = await db.query.events.findFirst({
      where: eq(events.id, event.id),
    });
    expect(after).toMatchObject({ name: "改名後", venue: "ホールB" });
  });

  it("totalSeats を現使用席数より下にするとエラー（getConsumedSeats 連動）", async () => {
    const { event, memberId } = await setupOrganizer({ totalSeats: 10 });
    // accepted invitation 1 + companion 2 → consumed = 3
    const inv = await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });
    await addCompanion({ invitationId: inv.id });
    await addCompanion({ invitationId: inv.id });

    const ng = await updateEvent(
      event.id,
      null,
      buildUpdateForm({ totalSeats: "2" }),
    );
    expect(ng).toMatchObject({ error: expect.stringContaining("3名") });

    // 3 にはできる
    const ok = await updateEvent(
      event.id,
      null,
      buildUpdateForm({ totalSeats: "3" }),
    );
    expect(ok).toMatchObject({ event: expect.any(Object) });
  });

  it("totalSeats=0（自由席）は consumed チェックを通る", async () => {
    const { event, memberId } = await setupOrganizer({ totalSeats: 10 });
    await addInvitation({
      eventId: event.id,
      memberId,
      status: "accepted",
    });

    const ok = await updateEvent(
      event.id,
      null,
      buildUpdateForm({ totalSeats: "0" }),
    );
    expect(ok).toMatchObject({ event: expect.any(Object) });
    const after = await db.query.events.findFirst({
      where: eq(events.id, event.id),
    });
    expect(after?.totalSeats).toBe(0);
  });

  it("ongoing / finished は編集不可", async () => {
    const { event } = await setupOrganizer({ status: "ongoing" });
    const ng = await updateEvent(
      event.id,
      null,
      buildUpdateForm({ name: "x" }),
    );
    expect(ng).toMatchObject({ error: expect.any(String) });
  });

  it("非 organizer は権限なし", async () => {
    const { event } = await setupOrganizer();
    const stranger = await createUser();
    loginAs(stranger);
    const ng = await updateEvent(
      event.id,
      null,
      buildUpdateForm({ name: "x" }),
    );
    expect(ng).toEqual({ error: "権限がありません" });
  });
});

describe("deleteEvent", () => {
  it("draft は削除可（redirect）", async () => {
    const user = await createUser();
    const event = await createEvent({ status: "draft" });
    await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
    });
    loginAs(user);

    await expect(deleteEvent(event.id)).rejects.toThrow("REDIRECT:/dashboard");
    const remaining = await db.query.events.findFirst({
      where: eq(events.id, event.id),
    });
    expect(remaining).toBeUndefined();
  });

  it("finished は削除可", async () => {
    const user = await createUser();
    const event = await createEvent({ status: "finished" });
    await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
    });
    loginAs(user);

    await expect(deleteEvent(event.id)).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("published / ongoing は削除不可", async () => {
    const user = await createUser();
    loginAs(user);
    for (const status of ["published", "ongoing"] as const) {
      const event = await createEvent({ status });
      await addEventMember({
        eventId: event.id,
        userId: user.id,
        role: "organizer",
      });
      const ng = await deleteEvent(event.id);
      expect(ng).toMatchObject({ error: expect.any(String) });
      const still = await db.query.events.findFirst({
        where: eq(events.id, event.id),
      });
      expect(still).toBeDefined();
    }
  });

  it("非 organizer は権限なし", async () => {
    const event = await createEvent({ status: "draft" });
    const stranger = await createUser();
    loginAs(stranger);
    const result = await deleteEvent(event.id);
    expect(result).toEqual({ error: "権限がありません" });
  });
});

describe("updateEventStatus", () => {
  async function setupAs(status: EventStatus) {
    const user = await createUser();
    const event = await createEvent({ status });
    await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
    });
    loginAs(user);
    return event;
  }

  // 期待する遷移マップは src/db/schema.ts と独立して定義する。
  // ここを VALID_TRANSITIONS から導出すると、定数を壊しても両方が同時に
  // 動いてしまい sanity check にならない。
  const expectedAllowed: Record<EventStatus, readonly EventStatus[]> = {
    draft: ["published"],
    published: ["draft", "ongoing"],
    ongoing: ["finished"],
    finished: [],
  };
  const allStatuses: EventStatus[] = [
    "draft",
    "published",
    "ongoing",
    "finished",
  ];

  for (const from of allStatuses) {
    for (const to of allStatuses) {
      const allowed = expectedAllowed[from].includes(to);
      it(`${from} → ${to} は ${allowed ? "成功" : "拒否"}`, async () => {
        const event = await setupAs(from);
        const result = await updateEventStatus(event.id, to);
        const after = await db.query.events.findFirst({
          where: eq(events.id, event.id),
        });
        if (allowed) {
          expect(result).toMatchObject({ event: expect.any(Object) });
          expect(after?.status).toBe(to);
        } else {
          expect(result).toMatchObject({ error: expect.any(String) });
          expect(after?.status).toBe(from);
        }
      });
    }
  }

  it("非 organizer は権限なし", async () => {
    const event = await createEvent({ status: "draft" });
    const stranger = await createUser();
    loginAs(stranger);
    const result = await updateEventStatus(event.id, "published");
    expect(result).toEqual({ error: "権限がありません" });
  });
});
