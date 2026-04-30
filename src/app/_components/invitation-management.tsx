"use client";

import { Envelope } from "@phosphor-icons/react";
import { useState } from "react";
import { CreateInvitationDialog } from "@/app/_components/create-invitation-dialog";
import { InvitationList } from "@/app/_components/invitation-list";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EventStatus, MemberRole } from "@/db/schema";
import { statusDotClass, statusLabels } from "@/lib/event-status";
import type { InvitationItem, SeatSummary } from "@/lib/queries/invitations";

type View = "all" | "mine";

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

  const [view, setView] = useState<View>(isOrganizer ? "all" : "mine");

  // サマリは view 非連動で全体集計
  const accepted = invitations.filter((i) => i.status === "accepted");
  const acceptedCount =
    accepted.length + accepted.reduce((sum, i) => sum + i.companionCount, 0);
  const pendingCount = invitations.filter(
    (i) => i.status === "pending" && !i.invalidatedAt,
  ).length;

  const visibleInvitations =
    view === "mine"
      ? invitations.filter((i) => i.memberId === currentMemberId)
      : invitations;
  const visibleCount = visibleInvitations.length;

  return (
    <div className="flex flex-col gap-8">
      {/* タイトル */}
      <header>
        <h1 className="font-serif text-3xl font-normal leading-tight">
          ゲスト管理
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

      {/* サマリ（4 セル、view 非連動で全体） */}
      <div className="grid grid-cols-4 border-y py-5 text-center">
        <SummaryCell
          label="総座席"
          value={
            seatSummary.totalSeats === 0
              ? "無制限"
              : String(seatSummary.totalSeats)
          }
        />
        <SummaryCell
          label="残り"
          value={
            seatSummary.remaining === null ? "—" : String(seatSummary.remaining)
          }
          bordered
        />
        <SummaryCell label="出席" value={String(acceptedCount)} bordered />
        <SummaryCell label="回答待ち" value={String(pendingCount)} bordered />
      </div>

      {/* CTA */}
      {canIssue && (
        <div>
          <CreateInvitationDialog eventId={event.id} />
        </div>
      )}

      {/* draft ヒント */}
      {event.status === "draft" && (
        <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
          イベントを公開すると、ゲストの招待リンクを発行できるようになります。
        </div>
      )}

      {/* ビュー切替（招待が 1 件以上あるときのみ） */}
      {invitations.length > 0 && (
        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(v) => {
            if (v === "all" || v === "mine") setView(v);
          }}
          className="self-start"
        >
          <ToggleGroupItem value="mine" className="min-h-[40px]">
            自分の招待
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="min-h-[40px]">
            全体
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {/* 表示分岐 */}
      {invitations.length === 0 ? (
        event.status === "finished" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            招待はありません
          </p>
        ) : event.status === "draft" ? null : (
          <NoInvitationsEmpty eventId={event.id} canIssue={canIssue} />
        )
      ) : visibleCount === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          あなたが発行した招待はまだありません
        </p>
      ) : (
        <InvitationList
          eventId={event.id}
          eventStatus={event.status}
          invitations={invitations}
          currentMemberId={currentMemberId}
          isOrganizer={isOrganizer}
          view={view}
        />
      )}
    </div>
  );
}

// ============================================================
// SummaryCell
// ============================================================

function SummaryCell({
  label,
  value,
  bordered,
  className,
}: {
  label: string;
  value: string;
  bordered?: boolean;
  className?: string;
}) {
  const muted = value === "0" || value === "—";
  return (
    <div
      className={`flex flex-col justify-center ${bordered ? "border-l" : ""} ${className ?? ""}`}
    >
      <div
        className={`text-xl font-light tabular-nums leading-none tracking-tight ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[10px] tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

// ============================================================
// NoInvitationsEmpty
// ============================================================

function NoInvitationsEmpty({
  eventId,
  canIssue,
}: {
  eventId: string;
  canIssue: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card/50 px-5 py-9 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full border text-muted-foreground">
        <Envelope className="size-5" aria-hidden />
      </div>
      <h3 className="mt-5 text-base font-light leading-snug">
        最初のゲストを
        <br className="sm:hidden" />
        招待しましょう
      </h3>
      <p className="mx-auto mt-3 max-w-[28ch] text-[12.5px] leading-[1.95] text-muted-foreground">
        リンクを発行して、招待したいゲストにお送りください。回答が届くと、ここに一覧が並びます。
      </p>
      {canIssue && (
        <div className="mt-6">
          <CreateInvitationDialog eventId={eventId} />
        </div>
      )}
    </div>
  );
}
