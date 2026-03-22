"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb } from "@/db";
import {
  eventMembers,
  events,
  performerInvitations,
  programPerformers,
} from "@/db/schema";
import { requireSession } from "@/lib/session";

// ============================================================
// Zod バリデーションスキーマ
// ============================================================

const displayNameSchema = z.string().trim().min(1).max(50);

// ============================================================
// 型定義
// ============================================================

export type CreatePerformerInvitationState =
  | {
      error: string;
      fields: { displayName: string };
    }
  | {
      token: string;
    }
  | null;

export type UpdateDisplayNameState = {
  error: string;
} | null;

// ============================================================
// Server Actions
// ============================================================

/**
 * 出演者招待リンク発行
 */
export async function createPerformerInvitation(
  eventId: string,
  _prevState: CreatePerformerInvitationState,
  formData: FormData,
): Promise<CreatePerformerInvitationState> {
  const session = await requireSession();
  const displayName = (formData.get("displayName") as string) ?? "";

  // 主催者権限チェック
  const member = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
      eq(eventMembers.role, "organizer"),
    ),
  });

  if (!member) {
    return { error: "権限がありません", fields: { displayName } };
  }

  // イベントステータスチェック
  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return { error: "イベントが見つかりません", fields: { displayName } };
  }

  if (event.status !== "draft" && event.status !== "published") {
    return {
      error: "このステータスでは招待リンクを発行できません",
      fields: { displayName },
    };
  }

  // バリデーション
  const parsed = displayNameSchema.safeParse(displayName);
  if (!parsed.success) {
    return {
      error: "表示名は1〜50文字で入力してください",
      fields: { displayName },
    };
  }

  // トークン生成（衝突時は最大3回リトライ）
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = crypto.randomBytes(16).toString("base64url");
    try {
      await getDb().insert(performerInvitations).values({
        eventId,
        token,
        displayName: parsed.data,
      });
      revalidatePath(`/events/${eventId}/members`);
      return { token };
    } catch (e) {
      const isUniqueViolation =
        e instanceof Error && e.message.includes("UNIQUE constraint");
      if (!isUniqueViolation || attempt === 2) {
        return {
          error: "招待リンクの発行に失敗しました",
          fields: { displayName },
        };
      }
    }
  }

  return { error: "招待リンクの発行に失敗しました", fields: { displayName } };
}

/**
 * 表示名変更（自分自身のみ）
 */
export async function updateDisplayName(
  eventId: string,
  _prevState: UpdateDisplayNameState,
  formData: FormData,
): Promise<UpdateDisplayNameState> {
  const session = await requireSession();

  // イベントステータスチェック
  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return { error: "イベントが見つかりません" };
  }

  if (
    event.status !== "draft" &&
    event.status !== "published" &&
    event.status !== "ongoing"
  ) {
    return { error: "このステータスでは表示名を変更できません" };
  }

  // バリデーション
  const displayName = (formData.get("displayName") as string) ?? "";
  const parsed = displayNameSchema.safeParse(displayName);
  if (!parsed.success) {
    return { error: "表示名は1〜50文字で入力してください" };
  }

  // 自分のレコードのみ更新
  const result = await getDb()
    .update(eventMembers)
    .set({ displayName: parsed.data })
    .where(
      and(
        eq(eventMembers.eventId, eventId),
        eq(eventMembers.userId, session.user.id),
      ),
    );

  if (result.changes === 0) {
    return { error: "メンバーが見つかりません" };
  }

  revalidatePath(`/events/${eventId}/members`);

  return null;
}

/**
 * 出演者削除
 */
export async function removeMember(
  eventId: string,
  memberId: string,
): Promise<{ error: string } | undefined> {
  const session = await requireSession();

  // 主催者権限チェック
  const organizer = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
      eq(eventMembers.role, "organizer"),
    ),
  });

  if (!organizer) {
    return { error: "権限がありません" };
  }

  // イベントステータスチェック
  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return { error: "イベントが見つかりません" };
  }

  if (event.status !== "draft" && event.status !== "published") {
    return { error: "このステータスではメンバーを削除できません" };
  }

  // 対象メンバー取得
  const target = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.id, memberId),
      eq(eventMembers.eventId, eventId),
    ),
  });

  if (!target) {
    return { error: "メンバーが見つかりません" };
  }

  // 主催者自身は削除不可
  if (target.role === "organizer") {
    return { error: "主催者は削除できません" };
  }

  // プログラムに紐づいている出演者は削除不可
  const linkedPerformer = await getDb().query.programPerformers.findFirst({
    where: eq(programPerformers.memberId, memberId),
  });

  if (linkedPerformer) {
    return {
      error:
        "このメンバーはプログラムに紐づいているため削除できません。先にプログラムからメンバーの割り当てを解除してください。",
    };
  }

  // メンバーに対応する出演者招待（accepted）も削除
  await getDb()
    .delete(performerInvitations)
    .where(
      and(
        eq(performerInvitations.eventId, eventId),
        eq(performerInvitations.acceptedByUserId, target.userId),
      ),
    );

  // DELETE
  await getDb()
    .delete(eventMembers)
    .where(
      and(eq(eventMembers.id, memberId), eq(eventMembers.eventId, eventId)),
    );

  revalidatePath(`/events/${eventId}/members`);
}

/**
 * 出演者招待リンク無効化
 */
export async function invalidatePerformerInvitation(
  eventId: string,
  invitationId: string,
): Promise<{ error: string } | undefined> {
  const session = await requireSession();

  // 主催者権限チェック
  const organizer = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
      eq(eventMembers.role, "organizer"),
    ),
  });

  if (!organizer) {
    return { error: "権限がありません" };
  }

  // イベントステータスチェック
  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return { error: "イベントが見つかりません" };
  }

  if (
    event.status !== "draft" &&
    event.status !== "published" &&
    event.status !== "ongoing"
  ) {
    return { error: "このステータスでは招待を無効化できません" };
  }

  // 対象招待取得
  const invitation = await getDb().query.performerInvitations.findFirst({
    where: and(
      eq(performerInvitations.id, invitationId),
      eq(performerInvitations.eventId, eventId),
    ),
  });

  if (!invitation) {
    return { error: "招待が見つかりません" };
  }

  if (invitation.status !== "pending") {
    return { error: "この招待は無効化できません" };
  }

  // UPDATE
  await getDb()
    .update(performerInvitations)
    .set({ status: "invalidated" })
    .where(eq(performerInvitations.id, invitationId));

  revalidatePath(`/events/${eventId}/members`);
}

/**
 * 出演者招待削除（無効化済みのみ）
 */
export async function deletePerformerInvitation(
  eventId: string,
  invitationId: string,
): Promise<{ error: string } | undefined> {
  const session = await requireSession();

  // 主催者権限チェック
  const organizer = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, session.user.id),
      eq(eventMembers.role, "organizer"),
    ),
  });

  if (!organizer) {
    return { error: "権限がありません" };
  }

  // 対象招待取得
  const invitation = await getDb().query.performerInvitations.findFirst({
    where: and(
      eq(performerInvitations.id, invitationId),
      eq(performerInvitations.eventId, eventId),
    ),
  });

  if (!invitation) {
    return { error: "招待が見つかりません" };
  }

  if (invitation.status !== "invalidated") {
    return { error: "無効化済みの招待のみ削除できます" };
  }

  // DELETE
  await getDb()
    .delete(performerInvitations)
    .where(eq(performerInvitations.id, invitationId));

  revalidatePath(`/events/${eventId}/members`);
}
