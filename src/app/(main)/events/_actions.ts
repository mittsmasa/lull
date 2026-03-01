"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/db";
import {
  type EventStatus,
  eventMembers,
  events,
  VALID_TRANSITIONS,
} from "@/db/schema";
import { requireSession } from "@/lib/session";

// ============================================================
// Zod バリデーションスキーマ
// ============================================================

const createEventSchema = z.object({
  name: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  openTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  venue: z.string().min(1).max(200),
  totalSeats: z.number().int().min(0).max(9999),
});

const updateEventSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  openTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  venue: z.string().min(1).max(200).optional(),
  totalSeats: z.number().int().min(0).max(9999).optional(),
});

// ============================================================
// ステータス遷移マップ（型安全）
// ============================================================

function canTransition(from: EventStatus, to: EventStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ============================================================
// Server Actions
// ============================================================

type CreateEventFields = {
  name: string;
  date: string;
  startTime: string;
  openTime: string;
  venue: string;
  totalSeats: string;
};

export type CreateEventState = {
  error: string;
  fields: CreateEventFields;
} | null;

function extractFields(formData: FormData): CreateEventFields {
  return {
    name: (formData.get("name") as string) ?? "",
    date: (formData.get("date") as string) ?? "",
    startTime: (formData.get("startTime") as string) ?? "",
    openTime: (formData.get("openTime") as string) ?? "",
    venue: (formData.get("venue") as string) ?? "",
    totalSeats: (formData.get("totalSeats") as string) ?? "",
  };
}

export async function createEvent(
  _prevState: CreateEventState,
  formData: FormData,
) {
  const session = await requireSession();
  const fields = extractFields(formData);

  const parsed = createEventSchema.safeParse({
    name: formData.get("name"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    openTime: formData.get("openTime") || undefined,
    venue: formData.get("venue"),
    totalSeats: Number(formData.get("totalSeats")),
  });

  if (!parsed.success) {
    return { error: "入力内容を確認してください", fields };
  }

  const { date, startTime, openTime, ...rest } = parsed.data;

  // datetime 結合
  const startDatetime = `${date}T${startTime}`;
  const openDatetime = openTime ? `${date}T${openTime}` : null;

  // 開催日バリデーション（当日以降 — JST 基準）
  // UTC ミリ秒に +9h して toISOString() で JST 日付文字列を取得
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = jstNow.toISOString().split("T")[0];
  if (date < today) {
    return { error: "開催日は当日以降にしてください", fields };
  }

  // openTime バリデーション（startTime 以前であること）
  if (openDatetime && openDatetime > startDatetime) {
    return { error: "開場時刻は開演時刻以前にしてください", fields };
  }

  const [newEvent] = await db
    .insert(events)
    .values({
      name: rest.name,
      venue: rest.venue,
      startDatetime,
      openDatetime,
      totalSeats: rest.totalSeats,
    })
    .returning();

  await db.insert(eventMembers).values({
    eventId: newEvent.id,
    userId: session.user.id,
    role: "organizer",
    displayName: (session.user.name || "名称未設定").slice(0, 50),
  });

  const event = newEvent;

  revalidatePath("/dashboard");
  redirect(`/events/${event.id}`);
}

export async function updateEvent(
  eventId: string,
  _prevState: { error: string } | { event: unknown } | null,
  formData: FormData,
) {
  const session = await requireSession();

  // 主催者権限チェック
  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
      eq(eventMembers.role, "organizer"),
    ),
  });

  if (!member) {
    return { error: "権限がありません" };
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return { error: "イベントが見つかりません" };
  }

  if (event.status !== "draft" && event.status !== "published") {
    return { error: "このステータスではイベントを編集できません" };
  }

  const parsed = updateEventSchema.safeParse({
    name: formData.get("name") || undefined,
    date: formData.get("date") || undefined,
    startTime: formData.get("startTime") || undefined,
    openTime: formData.has("openTime")
      ? formData.get("openTime") || null
      : undefined,
    venue: formData.get("venue") || undefined,
    totalSeats: formData.has("totalSeats")
      ? Number(formData.get("totalSeats"))
      : undefined,
  });

  if (!parsed.success) {
    return { error: "入力内容を確認してください" };
  }

  const { date, startTime, openTime, ...rest } = parsed.data;

  // datetime 結合（変更があるフィールドのみ）
  const updateData: Partial<typeof events.$inferInsert> = {};

  if (rest.name !== undefined) updateData.name = rest.name;
  if (rest.venue !== undefined) updateData.venue = rest.venue;
  if (rest.totalSeats !== undefined) updateData.totalSeats = rest.totalSeats;

  // date または startTime が変更された場合、startDatetime を再構築
  if (date !== undefined || startTime !== undefined) {
    const newDate = date ?? event.startDatetime.split("T")[0];
    const newStartTime = startTime ?? event.startDatetime.split("T")[1];
    updateData.startDatetime = `${newDate}T${newStartTime}`;
  }

  // openTime が変更された場合、openDatetime を再構築
  if (openTime !== undefined) {
    if (openTime === null) {
      updateData.openDatetime = null;
    } else {
      const baseDate = date ?? event.startDatetime.split("T")[0];
      updateData.openDatetime = `${baseDate}T${openTime}`;
    }
  }

  // 開催日バリデーション（JST 基準）
  const finalStartDatetime = updateData.startDatetime ?? event.startDatetime;
  const finalDate = finalStartDatetime.split("T")[0];
  // UTC ミリ秒に +9h して toISOString() で JST 日付文字列を取得
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = jstNow.toISOString().split("T")[0];
  if (finalDate < today) {
    return { error: "開催日は当日以降にしてください" };
  }

  // openDatetime バリデーション（startDatetime 以前）
  const finalOpenDatetime =
    updateData.openDatetime !== undefined
      ? updateData.openDatetime
      : event.openDatetime;
  if (finalOpenDatetime && finalOpenDatetime > finalStartDatetime) {
    return { error: "開場時刻は開演時刻以前にしてください" };
  }

  // updatedAt は $onUpdateFn により自動設定
  const [updated] = await db
    .update(events)
    .set(updateData)
    .where(eq(events.id, eventId))
    .returning();

  revalidatePath("/dashboard");
  revalidatePath(`/events/${eventId}`);

  return { event: updated };
}

export async function deleteEvent(eventId: string) {
  const session = await requireSession();

  // 主催者権限チェック
  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
      eq(eventMembers.role, "organizer"),
    ),
  });

  if (!member) {
    return { error: "権限がありません" };
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return { error: "イベントが見つかりません" };
  }

  if (event.status !== "draft") {
    return { error: "draft ステータスのイベントのみ削除できます" };
  }

  await db.delete(events).where(eq(events.id, eventId));

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateEventStatus(
  eventId: string,
  newStatus: EventStatus,
) {
  const session = await requireSession();

  // 主催者権限チェック
  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
      eq(eventMembers.role, "organizer"),
    ),
  });

  if (!member) {
    return { error: "権限がありません" };
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return { error: "イベントが見つかりません" };
  }

  if (!canTransition(event.status, newStatus)) {
    return {
      error: `${event.status} から ${newStatus} への遷移はできません`,
    };
  }

  const [updated] = await db
    .update(events)
    .set({ status: newStatus })
    .where(eq(events.id, eventId))
    .returning();

  revalidatePath("/dashboard");
  revalidatePath(`/events/${eventId}`);

  return { event: updated };
}
