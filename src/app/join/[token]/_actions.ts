"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/db";
import { eventMembers, performerInvitations } from "@/db/schema";
import { requireSession } from "@/lib/session";

const displayNameSchema = z.string().trim().min(1).max(50);

export async function acceptPerformerInvitation(
  token: string,
  displayName: string,
): Promise<{ error: string } | undefined> {
  const session = await requireSession(`/join/${token}`);

  // バリデーション
  const parsed = displayNameSchema.safeParse(displayName);
  if (!parsed.success) {
    return { error: "表示名は1〜50文字で入力してください" };
  }

  // トークンから招待情報を取得
  const invitation = await db.query.performerInvitations.findFirst({
    where: eq(performerInvitations.token, token),
    with: {
      event: { columns: { id: true, status: true } },
    },
  });

  if (!invitation) {
    return { error: "この招待リンクは無効です" };
  }

  // ステータスチェック
  if (invitation.status === "invalidated") {
    return { error: "この招待リンクは無効です" };
  }

  if (invitation.status === "accepted") {
    if (invitation.acceptedByUserId === session.user.id) {
      // 本人 → リダイレクト
      revalidatePath(`/events/${invitation.event.id}`);
      redirect(`/events/${invitation.event.id}`);
    }
    return { error: "この招待リンクは既に使用済みです" };
  }

  // イベントステータスチェック（draft/published/ongoing で受諾可能）
  if (invitation.event.status === "finished") {
    return { error: "この招待リンクは期限切れです" };
  }

  // 既にメンバーかチェック
  const existingMember = await db.query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, invitation.event.id),
      eq(eventMembers.userId, session.user.id),
    ),
  });

  if (existingMember) {
    // 既にメンバー → リダイレクト
    revalidatePath(`/events/${invitation.event.id}`);
    redirect(`/events/${invitation.event.id}`);
  }

  // event_members に出演者として登録
  await db.insert(eventMembers).values({
    eventId: invitation.event.id,
    userId: session.user.id,
    role: "performer",
    displayName: parsed.data,
  });

  // トークンを accepted に更新
  await db
    .update(performerInvitations)
    .set({
      status: "accepted",
      acceptedByUserId: session.user.id,
      acceptedAt: Date.now(),
    })
    .where(eq(performerInvitations.id, invitation.id));

  revalidatePath(`/events/${invitation.event.id}/members`);
  revalidatePath(`/events/${invitation.event.id}`);
  revalidatePath("/dashboard");
  redirect(`/events/${invitation.event.id}`);
}
