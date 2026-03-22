"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb } from "@/db";
import {
  eventMembers,
  events,
  PROGRAM_TYPES,
  programPerformers,
  programPieces,
  programs,
} from "@/db/schema";
import { requireSession } from "@/lib/session";

// ============================================================
// Zod バリデーションスキーマ
// ============================================================

// Server Action が受け取る入力型
type ProgramInput = {
  type: string;
  pieces: { title: string; composer: string }[];
  scheduledTime: string;
  estimatedDuration: string | number;
  note: string;
  performerIds: string[];
};

const pieceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  composer: z
    .string()
    .trim()
    .max(200)
    .default("")
    .transform((v) => v || null),
});

const programSchema = z
  .object({
    type: z.enum(PROGRAM_TYPES),
    pieces: z.array(pieceSchema).min(1),
    scheduledTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .or(z.literal(""))
      .transform((v) => v || null),
    estimatedDuration: z
      .union([z.coerce.number().int().min(1).max(999), z.literal("")])
      .transform((v) => (v === "" ? null : v)),
    note: z
      .string()
      .trim()
      .max(500)
      .default("")
      .transform((v) => v || null),
    performerIds: z.array(z.string()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.type === "performance" && data.performerIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "演奏タイプの場合、出演者を1人以上選択してください",
        path: ["performerIds"],
      });
    }
  });

// ============================================================
// 型定義
// ============================================================

export type ProgramActionState = {
  error: string;
  fieldErrors?: Record<string, string>;
} | null;

// ============================================================
// ヘルパー関数
// ============================================================

async function checkProgramPermission(
  eventId: string,
  userId: string,
): Promise<{ error: string } | { memberId: string }> {
  const member = await getDb().query.eventMembers.findFirst({
    where: and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, userId),
    ),
  });

  if (!member) {
    return { error: "権限がありません" };
  }

  if (member.role !== "organizer" && member.role !== "performer") {
    return { error: "権限がありません" };
  }

  const event = await getDb().query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return { error: "イベントが見つかりません" };
  }

  if (event.status === "finished") {
    return { error: "終了したイベントは変更できません" };
  }

  return { memberId: member.id };
}

async function validatePerformerIds(
  eventId: string,
  performerIds: string[],
): Promise<string | null> {
  if (performerIds.length === 0) return null;

  const members = await getDb().query.eventMembers.findMany({
    where: eq(eventMembers.eventId, eventId),
    columns: { id: true },
  });
  const validIds = new Set(members.map((m) => m.id));
  const invalid = performerIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return "無効な出演者が含まれています";
  }
  return null;
}

// ============================================================
// Server Actions
// ============================================================

/**
 * プログラム追加
 */
export async function createProgram(
  eventId: string,
  data: ProgramInput,
): Promise<ProgramActionState> {
  const session = await requireSession();
  const permCheck = await checkProgramPermission(eventId, session.user.id);
  if ("error" in permCheck) {
    return { error: permCheck.error };
  }

  const parsed = programSchema.safeParse(data);
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

  const { performerIds, pieces, ...programData } = parsed.data;

  const performerError = await validatePerformerIds(eventId, performerIds);
  if (performerError) {
    return { error: performerError };
  }

  getDb().transaction((tx) => {
    const maxOrder = tx
      .select({ value: max(programs.sortOrder) })
      .from(programs)
      .where(eq(programs.eventId, eventId))
      .get();
    const nextSortOrder = (maxOrder?.value ?? 0) + 1;

    const result = tx
      .insert(programs)
      .values({ eventId, sortOrder: nextSortOrder, ...programData })
      .returning({ id: programs.id })
      .get();

    tx.insert(programPieces)
      .values(
        pieces.map((piece, i) => ({
          programId: result.id,
          sortOrder: i + 1,
          title: piece.title,
          composer: piece.composer,
        })),
      )
      .run();

    if (performerIds.length > 0) {
      tx.insert(programPerformers)
        .values(
          performerIds.map((memberId) => ({
            programId: result.id,
            memberId,
          })),
        )
        .run();
    }
  });

  revalidatePath(`/events/${eventId}/programs`);
  return null;
}

/**
 * プログラム編集
 */
export async function updateProgram(
  eventId: string,
  programId: string,
  data: ProgramInput,
): Promise<ProgramActionState> {
  const session = await requireSession();
  const permCheck = await checkProgramPermission(eventId, session.user.id);
  if ("error" in permCheck) {
    return { error: permCheck.error };
  }

  const existing = await getDb().query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.eventId, eventId)),
  });
  if (!existing) {
    return { error: "プログラムが見つかりません" };
  }

  const parsed = programSchema.safeParse(data);
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

  const { performerIds, pieces, ...programData } = parsed.data;

  const performerError = await validatePerformerIds(eventId, performerIds);
  if (performerError) {
    return { error: performerError };
  }

  getDb().transaction((tx) => {
    tx.update(programs)
      .set({ ...programData, updatedAt: Date.now() })
      .where(and(eq(programs.id, programId), eq(programs.eventId, eventId)))
      .run();

    // pieces: 全削除 → 全挿入
    tx.delete(programPieces)
      .where(eq(programPieces.programId, programId))
      .run();

    tx.insert(programPieces)
      .values(
        pieces.map((piece, i) => ({
          programId,
          sortOrder: i + 1,
          title: piece.title,
          composer: piece.composer,
        })),
      )
      .run();

    // performers: 全削除 → 全挿入
    tx.delete(programPerformers)
      .where(eq(programPerformers.programId, programId))
      .run();

    if (performerIds.length > 0) {
      tx.insert(programPerformers)
        .values(performerIds.map((memberId) => ({ programId, memberId })))
        .run();
    }
  });

  revalidatePath(`/events/${eventId}/programs`);
  return null;
}

/**
 * プログラム削除
 */
export async function deleteProgram(
  eventId: string,
  programId: string,
): Promise<{ error: string } | null> {
  const session = await requireSession();
  const permCheck = await checkProgramPermission(eventId, session.user.id);
  if ("error" in permCheck) {
    return { error: permCheck.error };
  }

  await getDb()
    .delete(programs)
    .where(and(eq(programs.id, programId), eq(programs.eventId, eventId)));

  revalidatePath(`/events/${eventId}/programs`);
  return null;
}

/**
 * プログラム並び替え
 */
export async function reorderPrograms(
  eventId: string,
  programIds: string[],
): Promise<{ error: string } | null> {
  const session = await requireSession();
  const permCheck = await checkProgramPermission(eventId, session.user.id);
  if ("error" in permCheck) {
    return { error: permCheck.error };
  }

  getDb().transaction((tx) => {
    for (let i = 0; i < programIds.length; i++) {
      tx.update(programs)
        .set({ sortOrder: i + 1, updatedAt: Date.now() })
        .where(
          and(eq(programs.id, programIds[i]), eq(programs.eventId, eventId)),
        )
        .run();
    }
  });

  revalidatePath(`/events/${eventId}/programs`);
  return null;
}
