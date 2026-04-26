import "server-only";

import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import type { EventStatus, MemberRole } from "@/db/schema";
import {
  companions,
  eventMembers,
  events,
  invitations,
  programs,
} from "@/db/schema";

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
 * 同一リクエスト内で layout とページから重複呼び出しされるため React cache で
 * メモ化している。
 */
export const getEventsByUserId = cache(
  async (userId: string): Promise<EventWithRole[]> => {
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
      .where(
        and(eq(eventMembers.userId, userId), ne(events.status, "finished")),
      )
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
      .where(
        and(eq(eventMembers.userId, userId), eq(events.status, "finished")),
      )
      .orderBy(desc(events.startDatetime));

    return [...activeRows, ...finishedRows];
  },
);

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

export type EventStats = {
  programCount: number;
  performerCount: number;
  invitationTotal: number;
  invitationAccepted: number;
  invitationPending: number;
  invitationDeclined: number;
  checkedInGuests: number;
  checkedInCompanions: number;
  totalAttendees: number;
};

/**
 * イベント詳細画面のサマリ集計
 * - 管理メニューのタイルに各エリアの現在値を表示するために使う
 */
export async function getEventStats(eventId: string): Promise<EventStats> {
  const [programStats, performerStats, invitationStats, companionStats] =
    await Promise.all([
      db
        .select({ total: count() })
        .from(programs)
        .where(eq(programs.eventId, eventId))
        .get(),
      db
        .select({ total: count() })
        .from(eventMembers)
        .where(
          and(
            eq(eventMembers.eventId, eventId),
            eq(eventMembers.role, "performer"),
          ),
        )
        .get(),
      db
        .select({
          total: count(),
          accepted: count(
            sql`CASE WHEN ${invitations.status} = 'accepted' THEN 1 END`,
          ),
          pending: count(
            sql`CASE WHEN ${invitations.status} = 'pending' THEN 1 END`,
          ),
          declined: count(
            sql`CASE WHEN ${invitations.status} = 'declined' THEN 1 END`,
          ),
          // チェックインは accepted のみ対象（getCheckInSummary と整合）
          checkedInGuests: count(
            sql`CASE WHEN ${invitations.status} = 'accepted' AND ${invitations.checkedIn} = 1 THEN 1 END`,
          ),
        })
        .from(invitations)
        .where(eq(invitations.eventId, eventId))
        .get(),
      db
        .select({
          checkedIn: count(
            sql`CASE WHEN ${companions.checkedIn} = 1 THEN 1 END`,
          ),
        })
        .from(companions)
        .innerJoin(invitations, eq(companions.invitationId, invitations.id))
        .where(
          and(
            eq(invitations.eventId, eventId),
            eq(invitations.status, "accepted"),
          ),
        )
        .get(),
    ]);

  const checkedInGuests = invitationStats?.checkedInGuests ?? 0;
  const checkedInCompanions = companionStats?.checkedIn ?? 0;

  return {
    programCount: programStats?.total ?? 0,
    performerCount: performerStats?.total ?? 0,
    invitationTotal: invitationStats?.total ?? 0,
    invitationAccepted: invitationStats?.accepted ?? 0,
    invitationPending: invitationStats?.pending ?? 0,
    invitationDeclined: invitationStats?.declined ?? 0,
    checkedInGuests,
    checkedInCompanions,
    totalAttendees: checkedInGuests + checkedInCompanions,
  };
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
