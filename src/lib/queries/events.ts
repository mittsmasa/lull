import "server-only";

import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import type { EventStatus, MemberRole } from "@/db/schema";
import { eventMembers, events } from "@/db/schema";

export type EventWithRole = {
  id: string;
  name: string;
  venue: string;
  startDatetime: string;
  openDatetime: string | null;
  status: EventStatus;
  totalSeats: number;
  currentProgramId: string | null;
  createdAt: number;
  updatedAt: number;
  role: MemberRole;
};

/**
 * ユーザーが関わるイベント一覧を取得
 * - 未終了: startDatetime 昇順
 * - finished: startDatetime 降順（末尾にまとめる）
 *
 * db.select().from().innerJoin().orderBy() で DB 側ソートを実現
 */
export async function getEventsByUserId(
  userId: string,
): Promise<EventWithRole[]> {
  // 未終了イベント（startDatetime 昇順）
  const activeRows = await db
    .select({
      id: events.id,
      name: events.name,
      venue: events.venue,
      startDatetime: events.startDatetime,
      openDatetime: events.openDatetime,
      status: events.status,
      totalSeats: events.totalSeats,
      currentProgramId: events.currentProgramId,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
      role: eventMembers.role,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(and(eq(eventMembers.userId, userId), ne(events.status, "finished")))
    .orderBy(asc(events.startDatetime));

  // finished イベント（startDatetime 降順）
  const finishedRows = await db
    .select({
      id: events.id,
      name: events.name,
      venue: events.venue,
      startDatetime: events.startDatetime,
      openDatetime: events.openDatetime,
      status: events.status,
      totalSeats: events.totalSeats,
      currentProgramId: events.currentProgramId,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
      role: eventMembers.role,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(and(eq(eventMembers.userId, userId), eq(events.status, "finished")))
    .orderBy(desc(events.startDatetime));

  return [...activeRows, ...finishedRows];
}

/**
 * イベント詳細を取得（メンバー情報含む）
 */
export async function getEventDetail(eventId: string) {
  return db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      eventMembers: {
        with: { user: true },
      },
    },
  });
}

/**
 * ユーザーのイベントメンバーシップを取得
 */
export async function getEventMembership(eventId: string, userId: string) {
  return db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, userId),
    ),
  });
}
