import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import type {
  EventStatus,
  MemberRole,
  PerformerInvitationStatus,
} from "@/db/schema";
import { eventMembers, events, performerInvitations } from "@/db/schema";

// ----- 型定義 -----

export type MemberWithUser = {
  id: string;
  role: MemberRole;
  displayName: string;
  user: {
    id: string;
  };
  /** Unix timestamp (ms) — `$defaultFn(() => Date.now())` で自動設定 */
  createdAt: number;
};

export type PerformerInvitationItem = {
  id: string;
  token: string;
  /** 主催者が招待発行時に設定した表示名。受諾後は `event_members.displayName` として使用される */
  displayName: string;
  status: PerformerInvitationStatus;
  /** pending/invalidated では `null`。`/join/[token]` で受諾時に `users.id` がセットされる */
  acceptedByUserId: string | null;
  /** Unix timestamp (ms) */
  createdAt: number;
};

export type EventForMemberManagement = {
  id: string;
  name: string;
  status: EventStatus;
};

/** /join/[token] ページで使用する招待情報 */
export type PerformerInvitationForJoin = {
  id: string;
  token: string;
  displayName: string;
  status: PerformerInvitationStatus;
  acceptedByUserId: string | null;
  event: {
    id: string;
    name: string;
    venue: string;
    startDatetime: string;
    openDatetime: string | null;
    status: EventStatus;
  };
};

// ----- クエリ関数 -----

/**
 * メンバー管理画面用のイベント基本情報を取得
 */
export async function getEventForMemberManagement(
  eventId: string,
): Promise<EventForMemberManagement | undefined> {
  return db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: {
      id: true,
      name: true,
      status: true,
    },
  });
}

/**
 * イベントメンバー一覧を取得（user.id のみ含む）
 */
export async function getEventMembers(
  eventId: string,
): Promise<MemberWithUser[]> {
  const members = await db.query.eventMembers.findMany({
    where: eq(eventMembers.eventId, eventId),
    with: {
      user: {
        columns: { id: true },
      },
    },
  });

  return members.map((m) => ({
    id: m.id,
    role: m.role,
    displayName: m.displayName,
    user: { id: m.user.id },
    createdAt: m.createdAt,
  }));
}

/**
 * イベントの出演者招待一覧を取得
 */
export async function getPerformerInvitations(
  eventId: string,
): Promise<PerformerInvitationItem[]> {
  const invites = await db.query.performerInvitations.findMany({
    where: eq(performerInvitations.eventId, eventId),
  });

  return invites.map((inv) => ({
    id: inv.id,
    token: inv.token,
    displayName: inv.displayName,
    status: inv.status,
    acceptedByUserId: inv.acceptedByUserId,
    createdAt: inv.createdAt,
  }));
}

/**
 * トークンから出演者招待情報を取得（/join/[token] ページ用）
 */
export async function getPerformerInvitationByToken(
  token: string,
): Promise<PerformerInvitationForJoin | undefined> {
  const invitation = await db.query.performerInvitations.findFirst({
    where: eq(performerInvitations.token, token),
    with: {
      event: {
        columns: {
          id: true,
          name: true,
          venue: true,
          startDatetime: true,
          openDatetime: true,
          status: true,
        },
      },
    },
  });

  if (!invitation) return undefined;

  return {
    id: invitation.id,
    token: invitation.token,
    displayName: invitation.displayName,
    status: invitation.status,
    acceptedByUserId: invitation.acceptedByUserId,
    event: invitation.event,
  };
}
