"use client";

import { UserPlus } from "@phosphor-icons/react";
import type { EventStatus, MemberRole } from "@/db/schema";
import { statusDotClass, statusLabels } from "@/lib/event-status";
import type {
  MemberWithUser,
  PerformerInvitationItem,
} from "@/lib/queries/members";
import { InvitePerformerDialog } from "./invite-performer-dialog";
import { ParticipantList } from "./participant-list";

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

export function MemberManagement({
  event,
  members,
  performerInvitations,
  currentUserId,
  currentUserRole,
}: MemberManagementProps) {
  const isOrganizer = currentUserRole === "organizer";
  const canInvite =
    isOrganizer && (event.status === "draft" || event.status === "published");

  const organizerCount = members.filter((m) => m.role === "organizer").length;
  const performerCount = members.filter((m) => m.role === "performer").length;
  const pendingInvitationCount = performerInvitations.filter(
    (i) => i.status === "pending",
  ).length;

  const showEmpty =
    canInvite && performerCount === 0 && performerInvitations.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* タイトル */}
      <header>
        <h1 className="font-serif text-3xl font-normal leading-tight">
          メンバー管理
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{event.name}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${statusDotClass[event.status]} ${event.status === "ongoing" ? "motion-safe:animate-pulse" : ""}`}
              aria-hidden
            />
            {statusLabels[event.status]}
          </span>
        </div>
      </header>

      {/* サマリ（主催 / 出演 / 招待中） */}
      <div className="grid grid-cols-3 border-y py-5 text-center">
        <SummaryCell label="主催" value={organizerCount} />
        <SummaryCell label="出演" value={performerCount} bordered />
        <SummaryCell label="招待中" value={pendingInvitationCount} bordered />
      </div>

      {showEmpty ? (
        <div className="rounded-lg border bg-card/50 px-5 py-9 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border text-muted-foreground">
            <UserPlus className="size-5" aria-hidden />
          </div>
          <h3 className="mt-5 text-base font-light leading-snug">
            最初の出演者を
            <br className="sm:hidden" />
            招待しましょう
          </h3>
          <p className="mx-auto mt-3 max-w-[28ch] text-[12.5px] leading-[1.95] text-muted-foreground">
            リンクを発行して、出演する方々にお送りください。受け取った方がリンクを開くと、参加者として一覧に並びます。
          </p>
          <div className="mt-6">
            <InvitePerformerDialog eventId={event.id} />
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed tracking-wide text-muted-foreground">
            下書きのあいだは何度でもやり直せます
          </p>
        </div>
      ) : (
        <>
          {canInvite && (
            <div>
              <InvitePerformerDialog eventId={event.id} />
            </div>
          )}
          <ParticipantList
            eventId={event.id}
            eventStatus={event.status}
            members={members}
            invitations={performerInvitations}
            currentUserId={currentUserId}
            isOrganizer={isOrganizer}
          />
        </>
      )}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  bordered,
}: {
  label: string;
  value: number;
  bordered?: boolean;
}) {
  const muted = value === 0;
  return (
    <div className={bordered ? "border-l" : undefined}>
      <div
        className={`text-3xl font-light tabular-nums leading-none tracking-tight ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-2 text-[11px] tracking-[0.3em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
