"use client";

import { Badge } from "@/components/ui/badge";
import type { EventStatus, MemberRole } from "@/db/schema";
import { statusLabels, statusVariants } from "@/lib/event-status";
import type {
  MemberWithUser,
  PerformerInvitationItem,
} from "@/lib/queries/members";
import { InvitePerformerForm } from "./invite-performer-form";
import { MemberList } from "./member-list";
import { PerformerInvitationList } from "./performer-invitation-list";

// ============================================================
// 型定義
// ============================================================

type MemberManagementProps = {
  event: {
    id: string;
    name: string;
    status: EventStatus;
  };
  members: MemberWithUser[];
  performerInvitations: PerformerInvitationItem[];
  currentUserId: string;
  currentUserRole: MemberRole;
};

// ============================================================
// MemberManagement（統合コンポーネント）
// ============================================================

export function MemberManagement({
  event,
  members,
  performerInvitations,
  currentUserId,
  currentUserRole,
}: MemberManagementProps) {
  const isOrganizer = currentUserRole === "organizer";
  const canModify = event.status === "draft" || event.status === "published";

  return (
    <div className="flex flex-col gap-8">
      {/* ヘッダー */}
      <div>
        <h1 className="text-3xl font-light tracking-wide">メンバー管理</h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-muted-foreground">{event.name}</span>
          <Badge variant={statusVariants[event.status]}>
            {statusLabels[event.status]}
          </Badge>
        </div>
      </div>

      {/* メンバー一覧 */}
      <MemberList
        eventId={event.id}
        eventStatus={event.status}
        members={members}
        currentUserId={currentUserId}
        isOrganizer={isOrganizer}
        canModify={canModify}
      />

      {/* 出演者招待（主催者のみ、draft/published のみ） */}
      {isOrganizer && canModify && <InvitePerformerForm eventId={event.id} />}

      {/* 出演者招待一覧（主催者のみ） */}
      {isOrganizer && performerInvitations.length > 0 && (
        <PerformerInvitationList
          eventId={event.id}
          eventStatus={event.status}
          invitations={performerInvitations}
        />
      )}
    </div>
  );
}
