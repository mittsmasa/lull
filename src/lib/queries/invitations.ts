import "server-only";

import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companions,
  type EventStatus,
  events,
  type InvitationStatus,
  invitations,
} from "@/db/schema";

// ============================================================
// 型定義
// ============================================================

export type EventForInvitationManagement = {
  id: string;
  name: string;
  status: EventStatus;
  totalSeats: number;
};

export type InvitationItem = {
  id: string;
  token: string;
  inviterDisplayName: string;
  guestName: string | null;
  guestEmail: string | null;
  status: InvitationStatus;
  invalidatedAt: number | null;
  respondedAt: number | null;
  memberId: string | null;
  companionCount: number;
  companionNames: string[];
  createdAt: number;
};

export type InvitationForResponse = {
  id: string;
  token: string;
  inviterDisplayName: string;
  guestName: string | null;
  guestEmail: string | null;
  status: InvitationStatus;
  invalidatedAt: number | null;
  respondedAt: number | null;
  memberId: string | null;
  checkedIn: boolean;
  checkedInAt: number | null;
  companions: {
    id: string;
    name: string;
    checkedIn: boolean;
    checkedInAt: number | null;
  }[];
  event: {
    id: string;
    name: string;
    venue: string;
    startDatetime: string;
    openDatetime: string | null;
    status: EventStatus;
    totalSeats: number;
  };
};

export type SeatSummary = {
  totalSeats: number;
  consumed: number;
  remaining: number | null;
};

export type CheckInSummary = {
  totalAccepted: number;
  totalCompanions: number;
  checkedInGuests: number;
  checkedInCompanions: number;
};

// ============================================================
// クエリ関数
// ============================================================

/** 招待管理画面用のイベント情報取得 */
export async function getEventForInvitationManagement(
  eventId: string,
): Promise<EventForInvitationManagement | undefined> {
  return getDb().query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, name: true, status: true, totalSeats: true },
  });
}

/** イベントの招待一覧を取得 */
export async function getInvitationsByEventId(
  eventId: string,
): Promise<InvitationItem[]> {
  const rows = await getDb().query.invitations.findMany({
    where: eq(invitations.eventId, eventId),
    with: {
      companions: { columns: { id: true, name: true } },
      member: { columns: { displayName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    // メンバーが存在すれば現在の表示名、削除済みならスナップショット名にサフィックスを付与
    inviterDisplayName:
      r.member?.displayName ?? `${r.inviterDisplayName}（削除済み）`,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    status: r.status,
    invalidatedAt: r.invalidatedAt,
    respondedAt: r.respondedAt,
    memberId: r.memberId,
    companionCount: r.companions.length,
    companionNames: r.companions.map((c) => c.name),
    createdAt: r.createdAt,
  }));
}

/** トークンから招待情報を取得（/i/[token] ページ用） */
export async function getInvitationByToken(
  token: string,
): Promise<InvitationForResponse | undefined> {
  const invitation = await getDb().query.invitations.findFirst({
    where: eq(invitations.token, token),
    with: {
      event: {
        columns: {
          id: true,
          name: true,
          venue: true,
          startDatetime: true,
          openDatetime: true,
          status: true,
          totalSeats: true,
        },
      },
      member: { columns: { displayName: true } },
      companions: {
        columns: { id: true, name: true, checkedIn: true, checkedInAt: true },
      },
    },
  });

  if (!invitation) return undefined;

  return {
    id: invitation.id,
    token: invitation.token,
    inviterDisplayName:
      invitation.member?.displayName ??
      `${invitation.inviterDisplayName}（削除済み）`,
    guestName: invitation.guestName,
    guestEmail: invitation.guestEmail,
    status: invitation.status,
    checkedIn: invitation.checkedIn,
    checkedInAt: invitation.checkedInAt,
    invalidatedAt: invitation.invalidatedAt,
    respondedAt: invitation.respondedAt,
    memberId: invitation.memberId,
    companions: invitation.companions,
    event: invitation.event,
  };
}

/** 座席消費数を計算（同期関数: トランザクション内で呼ぶため） */
export function getConsumedSeats(eventId: string): number {
  const acceptedGuests = getDb()
    .select({ count: count() })
    .from(invitations)
    .where(
      and(eq(invitations.eventId, eventId), eq(invitations.status, "accepted")),
    )
    .get();

  const acceptedCompanions = getDb()
    .select({ count: count() })
    .from(companions)
    .innerJoin(invitations, eq(companions.invitationId, invitations.id))
    .where(
      and(eq(invitations.eventId, eventId), eq(invitations.status, "accepted")),
    )
    .get();

  return (acceptedGuests?.count ?? 0) + (acceptedCompanions?.count ?? 0);
}

/** 座席サマリー */
export function getSeatSummary(
  eventId: string,
  totalSeats: number,
): SeatSummary {
  const consumed = getConsumedSeats(eventId);
  return {
    totalSeats,
    consumed,
    remaining: totalSeats === 0 ? null : totalSeats - consumed,
  };
}

export type CheckInListItem = {
  id: string;
  guestName: string | null;
  checkedIn: boolean;
  checkedInAt: number | null;
  companions: {
    id: string;
    name: string;
    checkedIn: boolean;
    checkedInAt: number | null;
  }[];
};

/** チェックイン来場者一覧取得 */
export async function getCheckInList(
  eventId: string,
): Promise<CheckInListItem[]> {
  const rows = await getDb().query.invitations.findMany({
    where: and(
      eq(invitations.eventId, eventId),
      eq(invitations.status, "accepted"),
    ),
    columns: {
      id: true,
      guestName: true,
      checkedIn: true,
      checkedInAt: true,
    },
    with: {
      companions: {
        columns: {
          id: true,
          name: true,
          checkedIn: true,
          checkedInAt: true,
        },
      },
    },
  });

  return rows;
}

/** チェックインサマリー取得 */
export function getCheckInSummary(eventId: string): CheckInSummary {
  const guestStats = getDb()
    .select({
      total: count(),
      checkedIn: count(sql`CASE WHEN ${invitations.checkedIn} = 1 THEN 1 END`),
    })
    .from(invitations)
    .where(
      and(eq(invitations.eventId, eventId), eq(invitations.status, "accepted")),
    )
    .get();

  const companionStats = getDb()
    .select({
      total: count(),
      checkedIn: count(sql`CASE WHEN ${companions.checkedIn} = 1 THEN 1 END`),
    })
    .from(companions)
    .innerJoin(invitations, eq(companions.invitationId, invitations.id))
    .where(
      and(eq(invitations.eventId, eventId), eq(invitations.status, "accepted")),
    )
    .get();

  return {
    totalAccepted: guestStats?.total ?? 0,
    totalCompanions: companionStats?.total ?? 0,
    checkedInGuests: guestStats?.checkedIn ?? 0,
    checkedInCompanions: companionStats?.checkedIn ?? 0,
  };
}
