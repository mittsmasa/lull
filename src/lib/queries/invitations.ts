import "server-only";

import { and, count, eq, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  type AfterPartyAttendance,
  companions,
  type EventStatus,
  events,
  type InvitationStatus,
  invitations,
  type PaidMethod,
  type PaymentMethod,
} from "@/db/schema";

// ============================================================
// 型定義
// ============================================================

export type EventForInvitationManagement = {
  id: string;
  name: string;
  status: EventStatus;
  totalSeats: number;
  attendanceFee: number;
  afterPartyEnabled: boolean;
  afterPartyFee: number;
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
  afterPartyAttendance: AfterPartyAttendance | null;
  afterPartyCompanionCount: number;
  paymentMethod: PaymentMethod | null;
  paidAt: number | null;
  paidMethod: PaidMethod | null;
  paidAmount: number | null;
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
  afterPartyAttendance: AfterPartyAttendance | null;
  paymentMethod: PaymentMethod | null;
  paidAt: number | null;
  paidMethod: PaidMethod | null;
  paidAmount: number | null;
  stripeCheckoutSessionId: string | null;
  companions: {
    id: string;
    name: string;
    checkedIn: boolean;
    checkedInAt: number | null;
    afterPartyAttending: boolean;
  }[];
  event: {
    id: string;
    name: string;
    venue: string;
    address: string | null;
    startDatetime: string;
    openDatetime: string | null;
    status: EventStatus;
    totalSeats: number;
    showProgram: boolean;
    attendanceFee: number;
    afterPartyEnabled: boolean;
    afterPartyVenue: string | null;
    afterPartyStartTime: string | null;
    afterPartyFee: number;
    paymentNote: string | null;
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
  return db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: {
      id: true,
      name: true,
      status: true,
      totalSeats: true,
      attendanceFee: true,
      afterPartyEnabled: true,
      afterPartyFee: true,
    },
  });
}

/** イベントの招待一覧を取得 */
export async function getInvitationsByEventId(
  eventId: string,
): Promise<InvitationItem[]> {
  const rows = await db.query.invitations.findMany({
    where: eq(invitations.eventId, eventId),
    with: {
      companions: {
        columns: { id: true, name: true, afterPartyAttending: true },
      },
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
    afterPartyAttendance: r.afterPartyAttendance,
    afterPartyCompanionCount: r.companions.filter((c) => c.afterPartyAttending)
      .length,
    paymentMethod: r.paymentMethod,
    paidAt: r.paidAt,
    paidMethod: r.paidMethod,
    paidAmount: r.paidAmount,
    createdAt: r.createdAt,
  }));
}

/** トークンから招待情報を取得（/i/[token] ページ用） */
export async function getInvitationByToken(
  token: string,
): Promise<InvitationForResponse | undefined> {
  const invitation = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
    with: {
      event: {
        columns: {
          id: true,
          name: true,
          venue: true,
          address: true,
          startDatetime: true,
          openDatetime: true,
          status: true,
          totalSeats: true,
          showProgram: true,
          attendanceFee: true,
          afterPartyEnabled: true,
          afterPartyVenue: true,
          afterPartyStartTime: true,
          afterPartyFee: true,
          paymentNote: true,
        },
      },
      member: { columns: { displayName: true } },
      companions: {
        columns: {
          id: true,
          name: true,
          checkedIn: true,
          checkedInAt: true,
          afterPartyAttending: true,
        },
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
    afterPartyAttendance: invitation.afterPartyAttendance,
    paymentMethod: invitation.paymentMethod,
    paidAt: invitation.paidAt,
    paidMethod: invitation.paidMethod,
    paidAmount: invitation.paidAmount,
    stripeCheckoutSessionId: invitation.stripeCheckoutSessionId,
    companions: invitation.companions,
    event: invitation.event,
  };
}

/** 座席消費数を計算 */
export async function getConsumedSeats(eventId: string): Promise<number> {
  const acceptedGuests = await db
    .select({ count: count() })
    .from(invitations)
    .where(
      and(eq(invitations.eventId, eventId), eq(invitations.status, "accepted")),
    )
    .get();

  const acceptedCompanions = await db
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
export async function getSeatSummary(
  eventId: string,
  totalSeats: number,
): Promise<SeatSummary> {
  const consumed = await getConsumedSeats(eventId);
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
  afterPartyAttendance: AfterPartyAttendance | null;
  paymentMethod: PaymentMethod | null;
  paidAt: number | null;
  paidMethod: PaidMethod | null;
  paidAmount: number | null;
  companions: {
    id: string;
    name: string;
    checkedIn: boolean;
    checkedInAt: number | null;
    afterPartyAttending: boolean;
  }[];
};

/** チェックイン来場者一覧取得 */
export async function getCheckInList(
  eventId: string,
): Promise<CheckInListItem[]> {
  const rows = await db.query.invitations.findMany({
    where: and(
      eq(invitations.eventId, eventId),
      eq(invitations.status, "accepted"),
    ),
    columns: {
      id: true,
      guestName: true,
      checkedIn: true,
      checkedInAt: true,
      afterPartyAttendance: true,
      paymentMethod: true,
      paidAt: true,
      paidMethod: true,
      paidAmount: true,
    },
    with: {
      companions: {
        columns: {
          id: true,
          name: true,
          checkedIn: true,
          checkedInAt: true,
          afterPartyAttending: true,
        },
      },
    },
  });

  return rows;
}

/** チェックインサマリー取得 */
export async function getCheckInSummary(
  eventId: string,
): Promise<CheckInSummary> {
  const guestStats = await db
    .select({
      total: count(),
      checkedIn: count(sql`CASE WHEN ${invitations.checkedIn} = 1 THEN 1 END`),
    })
    .from(invitations)
    .where(
      and(eq(invitations.eventId, eventId), eq(invitations.status, "accepted")),
    )
    .get();

  const companionStats = await db
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

export type PaymentSummary = {
  /** 懇親会参加者数（accepted の本人） */
  afterPartyGuestCount: number;
  /** 懇親会参加の同伴者数（本人が参加のときのみ数える） */
  afterPartyCompanionCount: number;
  afterPartyTotalCount: number;
  /** 入金記録のある招待数 */
  paidCount: number;
  /** 受領額の合計（円） */
  paidTotalAmount: number;
};

/** 懇親会参加人数・入金状況のサマリー取得 */
export async function getPaymentSummary(
  eventId: string,
): Promise<PaymentSummary> {
  const guestStats = await db
    .select({
      afterParty: count(
        sql`CASE WHEN ${invitations.status} = 'accepted' AND ${invitations.afterPartyAttendance} = 'attending' THEN 1 END`,
      ),
      paidCount: count(invitations.paidAt),
      paidTotal: sum(invitations.paidAmount),
    })
    .from(invitations)
    .where(eq(invitations.eventId, eventId))
    .get();

  const companionStats = await db
    .select({
      afterParty: count(
        sql`CASE WHEN ${companions.afterPartyAttending} = 1 AND ${invitations.status} = 'accepted' AND ${invitations.afterPartyAttendance} = 'attending' THEN 1 END`,
      ),
    })
    .from(companions)
    .innerJoin(invitations, eq(companions.invitationId, invitations.id))
    .where(eq(invitations.eventId, eventId))
    .get();

  const afterPartyGuestCount = guestStats?.afterParty ?? 0;
  const afterPartyCompanionCount = companionStats?.afterParty ?? 0;
  return {
    afterPartyGuestCount,
    afterPartyCompanionCount,
    afterPartyTotalCount: afterPartyGuestCount + afterPartyCompanionCount,
    paidCount: guestStats?.paidCount ?? 0,
    paidTotalAmount: Number(guestStats?.paidTotal ?? 0),
  };
}
