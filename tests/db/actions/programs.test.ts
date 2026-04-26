import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createProgram,
  deleteProgram,
  reorderPrograms,
  updateProgram,
} from "@/app/(main)/events/[eventId]/programs/_actions";
import { db } from "@/db";
import { programPerformers, programPieces, programs } from "@/db/schema";
import {
  addEventMember,
  addProgram,
  addProgramPerformer,
  addProgramPiece,
  createEvent,
  createUser,
} from "../factories";
import { loginAs } from "../helpers/auth";

async function setupOrganizer(
  eventOverrides: {
    status?: "draft" | "published" | "ongoing" | "finished";
  } = {},
) {
  const user = await createUser();
  const event = await createEvent({ status: "published", ...eventOverrides });
  const organizerMemberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role: "organizer",
    displayName: "主催者",
  });
  loginAs(user);
  return { user, event, organizerMemberId };
}

const baseInput = {
  type: "performance" as const,
  pieces: [{ title: "曲A", composer: "作曲家A" }],
  scheduledTime: "",
  estimatedDuration: "",
  note: "",
  performerIds: [] as string[],
};

describe("createProgram", () => {
  it("sortOrder は既存最大 +1 を採番し、tx 内で pieces / performers が挿入される", async () => {
    const { event, organizerMemberId } = await setupOrganizer();
    await addProgram({ eventId: event.id, sortOrder: 1 });
    await addProgram({ eventId: event.id, sortOrder: 5 });

    const result = await createProgram(event.id, {
      ...baseInput,
      pieces: [
        { title: "1曲目", composer: "X" },
        { title: "2曲目", composer: "" },
      ],
      performerIds: [organizerMemberId],
    });
    expect(result).toBeNull();

    const created = await db.query.programs.findMany({
      where: eq(programs.eventId, event.id),
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    });
    expect(created.map((p) => p.sortOrder)).toEqual([1, 5, 6]);

    const newProgram = created[2];
    const pieces = await db
      .select()
      .from(programPieces)
      .where(eq(programPieces.programId, newProgram.id));
    expect(pieces).toHaveLength(2);
    expect(
      pieces.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.title),
    ).toEqual(["1曲目", "2曲目"]);
    // composer の "" は null に正規化される
    expect(pieces.find((p) => p.title === "2曲目")?.composer).toBeNull();

    const performers = await db
      .select()
      .from(programPerformers)
      .where(eq(programPerformers.programId, newProgram.id));
    expect(performers).toHaveLength(1);
    expect(performers[0].memberId).toBe(organizerMemberId);
  });

  it("最初のプログラムは sortOrder = 1", async () => {
    const { event } = await setupOrganizer();
    const result = await createProgram(event.id, {
      ...baseInput,
      type: "intermission",
      pieces: [{ title: "休憩", composer: "" }],
    });
    expect(result).toBeNull();

    const rows = await db.query.programs.findMany({
      where: eq(programs.eventId, event.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sortOrder).toBe(1);
  });

  it("performance タイプで出演者ゼロは fieldErrors を返す", async () => {
    const { event } = await setupOrganizer();
    const result = await createProgram(event.id, {
      ...baseInput,
      performerIds: [],
    });
    expect(result?.fieldErrors?.performerIds).toBeTruthy();
    const rows = await db.query.programs.findMany({
      where: eq(programs.eventId, event.id),
    });
    expect(rows).toHaveLength(0);
  });

  it("他イベントの member を performerIds に混ぜるとエラー", async () => {
    const { event } = await setupOrganizer();
    const otherEvent = await createEvent({ status: "published" });
    const otherUser = await createUser();
    const otherMemberId = await addEventMember({
      eventId: otherEvent.id,
      userId: otherUser.id,
      role: "performer",
    });

    const result = await createProgram(event.id, {
      ...baseInput,
      performerIds: [otherMemberId],
    });
    expect(result?.error).toMatch(/出演者/);
    const rows = await db.query.programs.findMany({
      where: eq(programs.eventId, event.id),
    });
    expect(rows).toHaveLength(0);
  });

  it("finished イベントでは作成不可", async () => {
    const { event, organizerMemberId } = await setupOrganizer({
      status: "finished",
    });
    const result = await createProgram(event.id, {
      ...baseInput,
      performerIds: [organizerMemberId],
    });
    expect(result?.error).toMatch(/終了/);
  });
});

describe("updateProgram", () => {
  it("pieces / performers を tx 内で全削除→再 INSERT する（旧データは消える）", async () => {
    const { event, organizerMemberId } = await setupOrganizer();

    const performerUser = await createUser();
    const performerMemberId = await addEventMember({
      eventId: event.id,
      userId: performerUser.id,
      role: "performer",
      displayName: "出演者B",
    });

    const program = await addProgram({
      eventId: event.id,
      sortOrder: 1,
      type: "performance",
    });
    const oldPiece = await addProgramPiece({
      programId: program.id,
      sortOrder: 1,
      title: "旧曲",
    });
    const oldPerformer = await addProgramPerformer({
      programId: program.id,
      memberId: organizerMemberId,
    });

    const result = await updateProgram(event.id, program.id, {
      ...baseInput,
      pieces: [
        { title: "新曲1", composer: "X" },
        { title: "新曲2", composer: "" },
      ],
      performerIds: [performerMemberId],
    });
    expect(result).toBeNull();

    // 旧データが残っていない
    const oldPieceStill = await db
      .select()
      .from(programPieces)
      .where(eq(programPieces.id, oldPiece.id));
    expect(oldPieceStill).toHaveLength(0);
    const oldPerformerStill = await db
      .select()
      .from(programPerformers)
      .where(eq(programPerformers.id, oldPerformer.id));
    expect(oldPerformerStill).toHaveLength(0);

    // 新データが整合的に挿入されている
    const pieces = await db
      .select()
      .from(programPieces)
      .where(eq(programPieces.programId, program.id));
    expect(pieces).toHaveLength(2);
    expect(
      pieces.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.title),
    ).toEqual(["新曲1", "新曲2"]);

    const performers = await db
      .select()
      .from(programPerformers)
      .where(eq(programPerformers.programId, program.id));
    expect(performers).toHaveLength(1);
    expect(performers[0].memberId).toBe(performerMemberId);
  });

  it("performerIds を空にすると performers が空になる（intermission 等）", async () => {
    const { event, organizerMemberId } = await setupOrganizer();
    const program = await addProgram({
      eventId: event.id,
      sortOrder: 1,
      type: "performance",
    });
    await addProgramPerformer({
      programId: program.id,
      memberId: organizerMemberId,
    });

    const result = await updateProgram(event.id, program.id, {
      ...baseInput,
      type: "intermission",
      pieces: [{ title: "休憩", composer: "" }],
      performerIds: [],
    });
    expect(result).toBeNull();

    const performers = await db
      .select()
      .from(programPerformers)
      .where(eq(programPerformers.programId, program.id));
    expect(performers).toHaveLength(0);
  });

  it("バリデーションエラー時は既存 pieces / performers を破壊しない", async () => {
    const { event, organizerMemberId } = await setupOrganizer();
    const program = await addProgram({
      eventId: event.id,
      sortOrder: 1,
      type: "performance",
    });
    await addProgramPiece({
      programId: program.id,
      sortOrder: 1,
      title: "残るべき曲",
    });
    await addProgramPerformer({
      programId: program.id,
      memberId: organizerMemberId,
    });

    // performance タイプで performerIds 空 → fieldErrors
    const result = await updateProgram(event.id, program.id, {
      ...baseInput,
      performerIds: [],
    });
    expect(result?.fieldErrors?.performerIds).toBeTruthy();

    const pieces = await db
      .select()
      .from(programPieces)
      .where(eq(programPieces.programId, program.id));
    expect(pieces).toHaveLength(1);
    const performers = await db
      .select()
      .from(programPerformers)
      .where(eq(programPerformers.programId, program.id));
    expect(performers).toHaveLength(1);
  });

  it("他イベントの programId は更新できない", async () => {
    const { event, organizerMemberId } = await setupOrganizer();
    const otherEvent = await createEvent({ status: "published" });
    const otherProgram = await addProgram({
      eventId: otherEvent.id,
      sortOrder: 1,
    });

    const result = await updateProgram(event.id, otherProgram.id, {
      ...baseInput,
      performerIds: [organizerMemberId],
    });
    expect(result?.error).toMatch(/見つかりません/);
  });

  it("finished イベントでは更新不可", async () => {
    const { event, organizerMemberId } = await setupOrganizer({
      status: "finished",
    });
    const program = await addProgram({
      eventId: event.id,
      sortOrder: 1,
      type: "performance",
    });

    const result = await updateProgram(event.id, program.id, {
      ...baseInput,
      performerIds: [organizerMemberId],
    });
    expect(result?.error).toMatch(/終了/);
  });
});
