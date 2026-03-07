"use client";

import { CreateInvitationButton } from "@/app/_components/create-invitation-button";
import { InvitationList } from "@/app/_components/invitation-list";
import { SeatSummaryCard } from "@/app/_components/seat-summary-card";
import { Badge } from "@/components/ui/badge";
import type { EventStatus, MemberRole } from "@/db/schema";
import { statusLabels, statusVariants } from "@/lib/event-status";
import type { InvitationItem, SeatSummary } from "@/lib/queries/invitations";

type InvitationManagementProps = {
  event: {
    id: string;
    name: string;
    status: EventStatus;
    totalSeats: number;
  };
  invitations: InvitationItem[];
  seatSummary: SeatSummary;
  currentMemberId: string;
  currentUserRole: MemberRole;
};

export function InvitationManagement({
  event,
  invitations,
  seatSummary,
  currentMemberId,
  currentUserRole,
}: InvitationManagementProps) {
  const isOrganizer = currentUserRole === "organizer";
  const canIssue = event.status === "published" || event.status === "ongoing";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-light tracking-wide">招待管理</h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-muted-foreground">{event.name}</span>
          <Badge variant={statusVariants[event.status]}>
            {statusLabels[event.status]}
          </Badge>
        </div>
      </div>

      <SeatSummaryCard seatSummary={seatSummary} invitations={invitations} />

      {canIssue && <CreateInvitationButton eventId={event.id} />}
      {event.status === "draft" && (
        <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
          イベントを公開すると、ゲストの招待リンクを発行できるようになります。
        </div>
      )}

      {invitations.length > 0 && (
        <InvitationList
          eventId={event.id}
          eventStatus={event.status}
          invitations={invitations}
          currentMemberId={currentMemberId}
          isOrganizer={isOrganizer}
        />
      )}
    </div>
  );
}
