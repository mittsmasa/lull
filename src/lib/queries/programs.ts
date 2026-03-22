import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import type { EventStatus, MemberRole, ProgramType } from "@/db/schema";
import { eventMembers, events, programPieces, programs } from "@/db/schema";

// ----- 型定義 -----

export type ProgramPiece = {
  id: string;
  sortOrder: number;
  title: string;
  composer: string | null;
};

export type ProgramWithPerformers = {
  id: string;
  sortOrder: number;
  type: ProgramType;
  /** HH:mm 形式の予定時刻（例: "14:30"）。null は未設定 */
  scheduledTime: string | null;
  /** 所要時間（分単位）。null は未設定 */
  estimatedDuration: number | null;
  note: string | null;
  performers: {
    id: string;
    memberId: string;
    displayName: string;
  }[];
  pieces: ProgramPiece[];
};

export type EventForProgramManagement = {
  id: string;
  name: string;
  status: EventStatus;
};

export type MemberOption = {
  id: string;
  displayName: string;
  role: MemberRole;
};

// ----- クエリ関数 -----

export async function getEventForProgramManagement(
  eventId: string,
): Promise<EventForProgramManagement | undefined> {
  return getDb().query.events.findFirst({
    where: eq(events.id, eventId),
    columns: {
      id: true,
      name: true,
      status: true,
    },
  });
}

export async function getProgramsByEventId(
  eventId: string,
): Promise<ProgramWithPerformers[]> {
  const rows = await getDb().query.programs.findMany({
    where: eq(programs.eventId, eventId),
    orderBy: [asc(programs.sortOrder), asc(programs.createdAt)],
    with: {
      performers: {
        with: {
          member: {
            columns: { id: true, displayName: true },
          },
        },
      },
      pieces: {
        orderBy: [asc(programPieces.sortOrder)],
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    sortOrder: r.sortOrder,
    type: r.type,
    scheduledTime: r.scheduledTime,
    estimatedDuration: r.estimatedDuration,
    note: r.note,
    performers: r.performers.map((p) => ({
      id: p.id,
      memberId: p.member.id,
      displayName: p.member.displayName,
    })),
    pieces: r.pieces.map((pc) => ({
      id: pc.id,
      sortOrder: pc.sortOrder,
      title: pc.title,
      composer: pc.composer,
    })),
  }));
}

export async function getEventMembersForSelect(
  eventId: string,
): Promise<MemberOption[]> {
  const members = await getDb().query.eventMembers.findMany({
    where: eq(eventMembers.eventId, eventId),
    columns: {
      id: true,
      displayName: true,
      role: true,
    },
  });
  return members;
}
