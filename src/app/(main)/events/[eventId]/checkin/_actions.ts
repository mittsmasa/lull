"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { companions, eventMembers, events, invitations } from "@/db/schema";
import {
  type CheckInSummary,
  getCheckInSummary,
} from "@/lib/queries/invitations";
import { requireSession } from "@/lib/session";

export type LookupInvitation = {
  id: string;
  guestName: string | null;
  guestEmail: string | null;
  checkedIn: boolean;
  checkedInAt: number | null;
  companions: {
    id: string;
    name: string;
    checkedIn: boolean;
    checkedInAt: number | null;
  }[];
};

export type LookupResult = { error: string } | { invitation: LookupInvitation };

/** 名前検索によるチェックイン用招待情報検索 */
export async function searchInvitationByName(
  eventId: string,
  query: string,
): Promise<{ error: string } | { invitations: LookupInvitation[] }> {
  const session = await requireSession();

  // メンバー権限チェック
  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) return { error: "権限がありません" };

  // イベントステータスチェック（ongoing のみ）
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event || event.status !== "ongoing") {
    return { error: "チェックインは開催中のイベントでのみ利用できます" };
  }

  const trimmed = query.trim();
  if (!trimmed) return { invitations: [] };

  // guestName LIKE '%query%' + status = accepted で検索
  // 同伴者名でも検索
  const rows = await db.query.invitations.findMany({
    where: and(
      eq(invitations.eventId, eventId),
      eq(invitations.status, "accepted"),
    ),
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

  // アプリ層でフィルタ（ゲスト名 or 同伴者名に部分一致）
  const filtered = rows.filter((r) => {
    if (r.guestName?.includes(trimmed)) return true;
    return r.companions.some((c) => c.name.includes(trimmed));
  });

  return {
    invitations: filtered.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      checkedIn: r.checkedIn,
      checkedInAt: r.checkedInAt,
      companions: r.companions,
    })),
  };
}

/** QR コード読み取り後、トークンから招待情報を検索 */
export async function lookupInvitationByToken(
  eventId: string,
  token: string,
): Promise<LookupResult> {
  const session = await requireSession();

  // メンバー権限チェック
  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) return { error: "権限がありません" };

  // イベントステータスチェック（ongoing のみ）
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event || event.status !== "ongoing") {
    return { error: "チェックインは開催中のイベントでのみ利用できます" };
  }

  // トークンで招待を検索
  const invitation = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
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

  if (!invitation) return { error: "無効な QR コードです" };

  // 別イベントのQRコードチェック
  if (invitation.eventId !== eventId) {
    return { error: "この QR コードは別のイベントのものです" };
  }

  // 無効化チェック
  if (invitation.invalidatedAt) {
    return { error: "この招待は無効化されています" };
  }

  // ステータスチェック
  if (invitation.status === "pending") {
    return { error: "この招待はまだ出欠回答されていません" };
  }
  if (invitation.status === "declined") {
    return { error: "この招待は辞退されています" };
  }

  // accepted → 招待情報を返す
  return {
    invitation: {
      id: invitation.id,
      guestName: invitation.guestName,
      guestEmail: invitation.guestEmail,
      checkedIn: invitation.checkedIn,
      checkedInAt: invitation.checkedInAt,
      companions: invitation.companions,
    },
  };
}

/** チェックイン実行（ゲスト本人 or 同伴者） */
export async function performCheckIn(
  eventId: string,
  invitationId: string,
  targetType: "guest" | "companion",
  targetId?: string,
): Promise<{ error: string } | { summary: CheckInSummary }> {
  const session = await requireSession();

  // 権限チェック（主催者 or 出演者）
  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) return { error: "権限がありません" };

  // イベントステータスチェック
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event || event.status !== "ongoing") {
    return { error: "チェックインは開催中のイベントでのみ利用できます" };
  }

  const now = Date.now();

  if (targetType === "guest") {
    // 既にチェックイン済みなら何もせずサマリーだけ返す
    const inv = db
      .select({ checkedIn: invitations.checkedIn })
      .from(invitations)
      .where(
        and(eq(invitations.id, invitationId), eq(invitations.eventId, eventId)),
      )
      .get();
    if (inv?.checkedIn) {
      return { summary: getCheckInSummary(eventId) };
    }
    await db
      .update(invitations)
      .set({ checkedIn: true, checkedInAt: now })
      .where(
        and(eq(invitations.id, invitationId), eq(invitations.eventId, eventId)),
      );
  } else {
    if (!targetId) return { error: "同伴者IDが必要です" };
    // 既にチェックイン済みなら何もせずサマリーだけ返す
    const comp = db
      .select({ checkedIn: companions.checkedIn })
      .from(companions)
      .where(
        and(
          eq(companions.id, targetId),
          eq(companions.invitationId, invitationId),
        ),
      )
      .get();
    if (comp?.checkedIn) {
      return { summary: getCheckInSummary(eventId) };
    }
    await db
      .update(companions)
      .set({ checkedIn: true, checkedInAt: now })
      .where(
        and(
          eq(companions.id, targetId),
          eq(companions.invitationId, invitationId),
        ),
      );
  }

  revalidatePath(`/events/${eventId}/checkin`);

  // 最新サマリーを返してクライアント側で state 更新
  return { summary: getCheckInSummary(eventId) };
}

/** チェックイン取り消し（ゲスト本人 or 同伴者） */
export async function undoCheckIn(
  eventId: string,
  invitationId: string,
  targetType: "guest" | "companion",
  targetId?: string,
): Promise<{ error: string } | { summary: CheckInSummary }> {
  const session = await requireSession();

  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) return { error: "権限がありません" };

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  // 取り消しは ongoing のみ（finished では不可）
  if (!event || event.status !== "ongoing") {
    return {
      error: "チェックインの取り消しは開催中のイベントでのみ可能です",
    };
  }

  if (targetType === "guest") {
    await db
      .update(invitations)
      .set({ checkedIn: false, checkedInAt: null })
      .where(
        and(eq(invitations.id, invitationId), eq(invitations.eventId, eventId)),
      );
  } else {
    if (!targetId) return { error: "同伴者IDが必要です" };
    await db
      .update(companions)
      .set({ checkedIn: false, checkedInAt: null })
      .where(
        and(
          eq(companions.id, targetId),
          eq(companions.invitationId, invitationId),
        ),
      );
  }

  revalidatePath(`/events/${eventId}/checkin`);

  return { summary: getCheckInSummary(eventId) };
}
