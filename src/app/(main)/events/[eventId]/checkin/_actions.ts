"use server";

import { and, eq, exists, like, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
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
  const member = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) return { error: "権限がありません" };

  // イベントステータスチェック（ongoing のみ）
  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event || event.status !== "ongoing") {
    return { error: "チェックインは開催中のイベントでのみ利用できます" };
  }

  const trimmed = query.trim();
  if (!trimmed) return { invitations: [] };

  // DB 側で guestName / 同伴者名の LIKE 検索
  const pattern = `%${trimmed}%`;
  const rows = await getDb().query.invitations.findMany({
    where: and(
      eq(invitations.eventId, eventId),
      eq(invitations.status, "accepted"),
      or(
        like(invitations.guestName, pattern),
        exists(
          getDb()
            .select({ id: companions.id })
            .from(companions)
            .where(
              and(
                eq(companions.invitationId, invitations.id),
                like(companions.name, pattern),
              ),
            ),
        ),
      ),
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

  return {
    invitations: rows.map((r) => ({
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
  const member = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) return { error: "権限がありません" };

  // イベントステータスチェック（ongoing のみ）
  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event || event.status !== "ongoing") {
    return { error: "チェックインは開催中のイベントでのみ利用できます" };
  }

  // トークンで招待を検索
  const invitation = await getDb().query.invitations.findFirst({
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
): Promise<
  { error: string } | { summary: CheckInSummary; checkedInAt: number }
> {
  const session = await requireSession();

  // 権限チェック（主催者 or 出演者）
  const member = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) return { error: "権限がありません" };

  // イベントステータスチェック
  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event || event.status !== "ongoing") {
    return { error: "チェックインは開催中のイベントでのみ利用できます" };
  }

  const now = Date.now();

  // 招待の存在・ステータス・有効性を検証（トークンも取得して revalidate に使う）
  const inv = getDb()
    .select({
      checkedIn: invitations.checkedIn,
      checkedInAt: invitations.checkedInAt,
      status: invitations.status,
      invalidatedAt: invitations.invalidatedAt,
      token: invitations.token,
    })
    .from(invitations)
    .where(
      and(eq(invitations.id, invitationId), eq(invitations.eventId, eventId)),
    )
    .get();
  if (!inv) return { error: "招待が見つかりません" };
  if (inv.status !== "accepted") {
    return { error: "出席が確定していない招待にはチェックインできません" };
  }
  if (inv.invalidatedAt) {
    return { error: "この招待は無効化されています" };
  }

  if (targetType === "guest") {
    // 既にチェックイン済みなら DB の時刻をそのまま返す
    if (inv.checkedIn) {
      return {
        summary: getCheckInSummary(eventId),
        checkedInAt: inv.checkedInAt ?? now,
      };
    }
    await getDb()
      .update(invitations)
      .set({ checkedIn: true, checkedInAt: now })
      .where(
        and(eq(invitations.id, invitationId), eq(invitations.eventId, eventId)),
      );
  } else {
    if (!targetId) return { error: "同伴者IDが必要です" };
    // companions → invitations を JOIN して eventId スコープを担保
    const comp = getDb()
      .select({
        checkedIn: companions.checkedIn,
        checkedInAt: companions.checkedInAt,
      })
      .from(companions)
      .innerJoin(invitations, eq(companions.invitationId, invitations.id))
      .where(
        and(
          eq(companions.id, targetId),
          eq(companions.invitationId, invitationId),
          eq(invitations.eventId, eventId),
        ),
      )
      .get();
    if (!comp) return { error: "同伴者が見つかりません" };
    // 既にチェックイン済みなら DB の時刻をそのまま返す
    if (comp.checkedIn) {
      return {
        summary: getCheckInSummary(eventId),
        checkedInAt: comp.checkedInAt ?? now,
      };
    }
    await getDb()
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
  revalidatePath(`/i/${inv.token}`);

  // 最新サマリーを返してクライアント側で state 更新
  return { summary: getCheckInSummary(eventId), checkedInAt: now };
}

/** チェックイン取り消し（ゲスト本人 or 同伴者） */
export async function undoCheckIn(
  eventId: string,
  invitationId: string,
  targetType: "guest" | "companion",
  targetId?: string,
): Promise<{ error: string } | { summary: CheckInSummary }> {
  const session = await requireSession();

  const member = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) return { error: "権限がありません" };

  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });
  // 取り消しは ongoing のみ（finished では不可）
  if (!event || event.status !== "ongoing") {
    return {
      error: "チェックインの取り消しは開催中のイベントでのみ可能です",
    };
  }

  // 招待トークンを取得（revalidate 用）
  const inv = getDb()
    .select({ token: invitations.token })
    .from(invitations)
    .where(
      and(eq(invitations.id, invitationId), eq(invitations.eventId, eventId)),
    )
    .get();
  if (!inv) return { error: "招待が見つかりません" };

  if (targetType === "guest") {
    await getDb()
      .update(invitations)
      .set({ checkedIn: false, checkedInAt: null })
      .where(
        and(eq(invitations.id, invitationId), eq(invitations.eventId, eventId)),
      );
  } else {
    if (!targetId) return { error: "同伴者IDが必要です" };
    // companions → invitations を JOIN して eventId スコープを検証
    const comp = getDb()
      .select({ id: companions.id })
      .from(companions)
      .innerJoin(invitations, eq(companions.invitationId, invitations.id))
      .where(
        and(
          eq(companions.id, targetId),
          eq(companions.invitationId, invitationId),
          eq(invitations.eventId, eventId),
        ),
      )
      .get();
    if (!comp) return { error: "同伴者が見つかりません" };
    await getDb()
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
  revalidatePath(`/i/${inv.token}`);

  return { summary: getCheckInSummary(eventId) };
}
