"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/db";
import { companions, eventMembers, events, invitations } from "@/db/schema";
import { calcBilling } from "@/lib/payment";
import { getConsumedSeats } from "@/lib/queries/invitations";
import { requireSession } from "@/lib/session";

// ============================================================
// ゲスト招待リンク発行
// ============================================================

export type CreateInvitationState = { error: string } | { token: string };

const guestNameSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => v || null);

/** ゲスト招待リンク発行 */
export async function createGuestInvitation(
  eventId: string,
  guestName?: string,
): Promise<CreateInvitationState> {
  const session = await requireSession();

  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
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
  if (event.status !== "published" && event.status !== "ongoing") {
    return { error: "このステータスでは招待リンクを発行できません" };
  }

  const parsedName = guestNameSchema.safeParse(guestName);
  if (!parsedName.success) {
    return { error: "ゲスト名は100文字以内で入力してください" };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const token = crypto.randomBytes(16).toString("base64url");
    try {
      await db.insert(invitations).values({
        eventId,
        memberId: member.id,
        token,
        inviterDisplayName: member.displayName,
        guestName: parsedName.data,
      });
      revalidatePath(`/events/${eventId}/invitations`);
      return { token };
    } catch (e) {
      const isUniqueViolation =
        e instanceof Error && e.message.includes("UNIQUE constraint");
      if (!isUniqueViolation || attempt === 2) {
        return { error: "招待リンクの発行に失敗しました" };
      }
    }
  }
  return { error: "招待リンクの発行に失敗しました" };
}

// ============================================================
// 招待リンク無効化
// ============================================================

/** 招待リンク無効化 */
export async function invalidateInvitation(
  eventId: string,
  invitationId: string,
): Promise<{ error: string } | undefined> {
  const session = await requireSession();

  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) {
    return { error: "権限がありません" };
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event || (event.status !== "published" && event.status !== "ongoing")) {
    return { error: "このステータスでは無効化できません" };
  }

  const invitation = await db.query.invitations.findFirst({
    where: and(
      eq(invitations.id, invitationId),
      eq(invitations.eventId, eventId),
    ),
  });
  if (!invitation) {
    return { error: "招待が見つかりません" };
  }
  if (invitation.invalidatedAt) {
    return { error: "既に無効化されています" };
  }

  // 出演者は自分が発行した招待のみ無効化可能
  if (member.role !== "organizer" && invitation.memberId !== member.id) {
    return { error: "権限がありません" };
  }

  // accepted の場合: 同伴者削除 + ステータスを declined に変更してシート解放
  if (invitation.status === "accepted") {
    await db.transaction(async (tx) => {
      await tx
        .delete(companions)
        .where(eq(companions.invitationId, invitationId));
      await tx
        .update(invitations)
        .set({
          status: "declined",
          invalidatedAt: Date.now(),
          checkedIn: false,
          checkedInAt: null,
        })
        .where(eq(invitations.id, invitationId));
    });
  } else {
    await db
      .update(invitations)
      .set({ invalidatedAt: Date.now() })
      .where(eq(invitations.id, invitationId));
  }

  revalidatePath(`/events/${eventId}/invitations`);
}

// ============================================================
// 主催者代理変更
// ============================================================

/** 主催者による出欠ステータス代理変更 */
export async function proxyChangeStatus(
  eventId: string,
  invitationId: string,
  newStatus: "accepted" | "declined",
): Promise<{ error: string } | undefined> {
  const session = await requireSession();

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
  if (!event || (event.status !== "published" && event.status !== "ongoing")) {
    return { error: "このステータスでは変更できません" };
  }

  const invitation = await db.query.invitations.findFirst({
    where: and(
      eq(invitations.id, invitationId),
      eq(invitations.eventId, eventId),
    ),
  });
  // pending（未回答）の招待は代理変更の対象外
  if (!invitation || invitation.status === "pending") {
    return { error: "この招待は代理変更できません" };
  }

  if (newStatus === "accepted") {
    // declined → accepted: 空き枠チェック
    if (invitation.status !== "declined") {
      return { error: "辞退済みの招待のみ出席に変更できます" };
    }
    // 座席チェック + 更新をトランザクション内で行い TOCTOU を防ぐ
    if (event.totalSeats > 0) {
      const error = await db.transaction(async (tx) => {
        const consumed = await getConsumedSeats(eventId);
        const remaining = event.totalSeats - consumed;
        if (remaining < 1) {
          return "満席のため出席に変更できません";
        }
        await tx
          .update(invitations)
          .set({ status: "accepted", respondedAt: Date.now() })
          .where(eq(invitations.id, invitationId));
        return undefined;
      });
      if (error) return { error };
    } else {
      await db
        .update(invitations)
        .set({ status: "accepted", respondedAt: Date.now() })
        .where(eq(invitations.id, invitationId));
    }
  } else {
    // accepted → declined: 同伴者削除 + チェックインリセット
    if (invitation.status !== "accepted") {
      return { error: "出席済みの招待のみ辞退に変更できます" };
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(companions)
        .where(eq(companions.invitationId, invitationId));
      await tx
        .update(invitations)
        .set({
          status: "declined",
          checkedIn: false,
          checkedInAt: null,
          respondedAt: Date.now(),
        })
        .where(eq(invitations.id, invitationId));
    });
  }

  revalidatePath(`/events/${eventId}/invitations`);
}

// ============================================================
// 無効化済み招待の削除
// ============================================================

/** 無効化済み招待を削除（同伴者は CASCADE で自動削除、座席も解放される） */
export async function deleteInvitation(
  eventId: string,
  invitationId: string,
): Promise<{ error: string } | undefined> {
  const session = await requireSession();

  const member = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
    ),
  });
  if (!member) {
    return { error: "権限がありません" };
  }

  const invitation = await db.query.invitations.findFirst({
    where: and(
      eq(invitations.id, invitationId),
      eq(invitations.eventId, eventId),
    ),
  });
  if (!invitation) {
    return { error: "招待が見つかりません" };
  }
  if (!invitation.invalidatedAt) {
    return { error: "無効化済みの招待のみ削除できます" };
  }

  // 出演者は自分が発行した招待のみ削除可能
  if (member.role !== "organizer" && invitation.memberId !== member.id) {
    return { error: "権限がありません" };
  }

  await db.delete(invitations).where(eq(invitations.id, invitationId));

  revalidatePath(`/events/${eventId}/invitations`);
}

// ============================================================
// 入金の手動記録（organizer のみ）
// ============================================================

async function requireOrganizerMember(eventId: string) {
  const session = await requireSession();
  return db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
      eq(eventMembers.role, "organizer"),
    ),
  });
}

/**
 * 手動の入金済みマーク（銀行振込等の例外対応・webhook 不達時のフォールバック）。
 * 受領額には記録時点の請求額を記録する
 */
export async function markInvitationPaid(
  eventId: string,
  invitationId: string,
): Promise<{ error: string } | undefined> {
  const member = await requireOrganizerMember(eventId);
  if (!member) {
    return { error: "権限がありません" };
  }

  const invitation = await db.query.invitations.findFirst({
    where: and(
      eq(invitations.id, invitationId),
      eq(invitations.eventId, eventId),
    ),
    with: { event: true, companions: true },
  });
  if (!invitation) {
    return { error: "招待が見つかりません" };
  }
  if (invitation.paidAt !== null) {
    return { error: "すでに入金済みです。変更するには先に解除してください" };
  }

  const billing = calcBilling(
    {
      attendanceFee: invitation.event.attendanceFee,
      afterPartyEnabled: invitation.event.afterPartyEnabled,
      afterPartyFee: invitation.event.afterPartyFee,
    },
    {
      status: invitation.status,
      companionCount: invitation.companions.length,
      afterPartyAttendance: invitation.afterPartyAttendance,
      afterPartyCompanionCount: invitation.companions.filter(
        (c) => c.afterPartyAttending,
      ).length,
    },
  );
  if (billing.total <= 0) {
    return { error: "請求額がないため入金を記録できません" };
  }

  await db
    .update(invitations)
    .set({
      paidAt: Date.now(),
      paidMethod: "manual",
      paidAmount: billing.total,
    })
    .where(eq(invitations.id, invitationId));

  revalidatePath(`/events/${eventId}/invitations`);
}

/**
 * 入金済みの解除。記録の訂正のみで Stripe の返金は実行しない
 * （実返金は Stripe ダッシュボードから行い、その後この操作で記録を解除する運用）。
 * stripe_checkout_session_id は監査用に保持する
 */
export async function unmarkInvitationPaid(
  eventId: string,
  invitationId: string,
): Promise<{ error: string } | undefined> {
  const member = await requireOrganizerMember(eventId);
  if (!member) {
    return { error: "権限がありません" };
  }

  const invitation = await db.query.invitations.findFirst({
    where: and(
      eq(invitations.id, invitationId),
      eq(invitations.eventId, eventId),
    ),
  });
  if (!invitation) {
    return { error: "招待が見つかりません" };
  }
  if (invitation.paidAt === null) {
    return { error: "入金記録がありません" };
  }

  await db
    .update(invitations)
    .set({ paidAt: null, paidMethod: null, paidAmount: null })
    .where(eq(invitations.id, invitationId));

  revalidatePath(`/events/${eventId}/invitations`);
}
