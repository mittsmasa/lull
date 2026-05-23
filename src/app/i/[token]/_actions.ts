"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as z from "zod";
import { db } from "@/db";
import { companions, invitations } from "@/db/schema";
import { buildInvitationResponseMail } from "@/lib/emails/invitation-response";
import { sendMail } from "@/lib/mailer";
import { getConsumedSeats } from "@/lib/queries/invitations";

function getBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  );
}

// NOTE: 成功時は undefined を返す（既存パターンに統一）
export type ResponseActionState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
    }
  | undefined;

const companionNameSchema = z.string().trim().min(1).max(100);

const responseSchema = z
  .object({
    guestName: z.string().trim().min(1).max(100),
    guestEmail: z.string().trim().email(),
    attendance: z.enum(["accepted", "declined"]),
    companions: z.array(companionNameSchema).max(4).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.attendance === "declined" && data.companions.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "辞退の場合、同伴者は入力できません",
        path: ["companions"],
      });
    }
  });

export async function respondToInvitation(
  token: string,
  data: {
    guestName: string;
    guestEmail: string;
    attendance: string;
    companions: string[];
  },
): Promise<ResponseActionState> {
  const invitation = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
    with: { event: true, companions: { columns: { id: true } } },
  });

  if (!invitation) {
    return { error: "招待が見つかりません" };
  }

  const { event } = invitation;

  // イベントステータスチェック
  if (event.status === "draft") {
    return { error: "現在準備中です" };
  }
  if (event.status === "finished") {
    return { error: "この招待リンクは期限切れです" };
  }

  // 無効化チェック
  if (invitation.invalidatedAt) {
    if (invitation.status !== "accepted") {
      return { error: "この招待リンクは無効です" };
    }
    return { error: "この招待は変更できません" };
  }

  // 回答変更の制約チェック
  if (invitation.status !== "pending") {
    if (event.status !== "published") {
      return { error: "回答の変更期間は終了しました" };
    }
  } else {
    if (event.status !== "published" && event.status !== "ongoing") {
      return { error: "現在回答を受け付けていません" };
    }
  }

  // バリデーション
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "入力内容を確認してください", fieldErrors };
  }

  // 編集時の guestEmail 改ざん防止
  // 初回回答後は宛先メールアドレスを変更不可とし、招待トークンを使った
  // 任意宛先への通知メール送信（spam relay）を防ぐ
  if (
    invitation.status !== "pending" &&
    invitation.guestEmail !== null &&
    invitation.guestEmail !== parsed.data.guestEmail
  ) {
    return {
      error: "入力内容を確認してください",
      fieldErrors: { guestEmail: "メールアドレスは変更できません" },
    };
  }

  const { attendance, companions: companionNames, ...guestInfo } = parsed.data;
  const prevStatus = invitation.status;

  // DB 更新（トランザクションで座席競合を防止）
  const txError = await db.transaction(async (tx) => {
    // accepted の場合: 座席枠チェック
    if (attendance === "accepted" && event.totalSeats > 0) {
      const consumed = await getConsumedSeats(event.id);
      const currentCompanionCount =
        invitation.status === "accepted" ? invitation.companions.length : 0;
      const selfSeats =
        invitation.status === "accepted" ? 1 + currentCompanionCount : 0;
      const remaining = event.totalSeats - consumed + selfSeats;
      const needed = 1 + companionNames.length;
      if (remaining < needed) {
        return "満席のため出席回答を受け付けられません";
      }
    }

    // 既存の同伴者を削除
    await tx
      .delete(companions)
      .where(eq(companions.invitationId, invitation.id));

    // 招待ステータス更新
    await tx
      .update(invitations)
      .set({
        ...guestInfo,
        status: attendance,
        respondedAt: Date.now(),
        ...(attendance === "declined"
          ? { checkedIn: false, checkedInAt: null }
          : {}),
      })
      .where(eq(invitations.id, invitation.id));

    // accepted の場合: 同伴者を登録
    if (attendance === "accepted" && companionNames.length > 0) {
      await tx.insert(companions).values(
        companionNames.map((name) => ({
          invitationId: invitation.id,
          name,
        })),
      );
    }

    return undefined;
  });

  if (txError) {
    return { error: txError };
  }

  const mail = buildInvitationResponseMail({
    eventName: event.name,
    guestName: guestInfo.guestName,
    guestEmail: guestInfo.guestEmail,
    attendance,
    prevStatus,
    companionNames: attendance === "accepted" ? companionNames : [],
    invitationUrl: `${getBaseUrl()}/i/${token}`,
  });
  // レスポンス返却後に走らせる（serverless 環境で fire-and-forget が
  // 切られる挙動を避ける）
  after(async () => {
    try {
      await sendMail({ to: guestInfo.guestEmail, ...mail });
    } catch (err) {
      console.error("[respondToInvitation] failed to send mail", err);
    }
  });

  revalidatePath(`/i/${token}`);
  revalidatePath(`/events/${event.id}/invitations`);
}
