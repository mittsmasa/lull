"use client";

import { Envelope } from "@phosphor-icons/react";
import { CreateInvitationDialog } from "@/app/_components/create-invitation-dialog";
import { InvitationList } from "@/app/_components/invitation-list";
import type { EventStatus, MemberRole } from "@/db/schema";
import { statusDotClass, statusLabels } from "@/lib/event-status";
import { type BillingTotals, formatYen } from "@/lib/payment";
import type {
  InvitationItem,
  PaymentSummary,
  SeatSummary,
} from "@/lib/queries/invitations";

/** イベント全体の回答状況（一覧の絞り込みとは非連動） */
export type ResponseSummary = {
  acceptedCount: number;
  pendingCount: number;
};

type InvitationManagementProps = {
  event: {
    id: string;
    name: string;
    status: EventStatus;
    totalSeats: number;
    attendanceFee: number;
    afterPartyEnabled: boolean;
    afterPartyFee: number;
  };
  /** 自分が発行した招待のみ */
  invitations: InvitationItem[];
  seatSummary: SeatSummary;
  paymentSummary: PaymentSummary;
  responseSummary: ResponseSummary;
  /** 出席者への請求総額と受領総額（辞退者の入金記録は含まない） */
  billingTotals: BillingTotals;
  currentUserRole: MemberRole;
};

export function InvitationManagement({
  event,
  invitations,
  seatSummary,
  paymentSummary,
  responseSummary,
  billingTotals,
  currentUserRole,
}: InvitationManagementProps) {
  const isOrganizer = currentUserRole === "organizer";
  const canIssue = event.status === "published" || event.status === "ongoing";

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

      {/* サマリ（4 セル、一覧の絞り込みと非連動でイベント全体） */}
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
        <SummaryCell
          label="出席"
          value={String(responseSummary.acceptedCount)}
          bordered
        />
        <SummaryCell
          label="回答待ち"
          value={String(responseSummary.pendingCount)}
          bordered
        />
      </div>

      {/* 懇親会・入金サマリ（会費設定または入金記録があるときのみ）。
          受領合計は「受領 / 請求」で、差があれば出席者からの回収漏れを示す。
          辞退者に残る入金記録（返金対応待ち）は含めず、一覧の行で追う */}
      {(event.attendanceFee > 0 ||
        event.afterPartyEnabled ||
        billingTotals.paidTotal > 0) && (
        <div className="-mt-4 grid grid-cols-2 border-b pb-5 text-center">
          <SummaryCell
            label="懇親会参加"
            value={
              event.afterPartyEnabled || paymentSummary.afterPartyTotalCount > 0
                ? String(paymentSummary.afterPartyTotalCount)
                : "—"
            }
          />
          <SummaryCell
            label="受領合計"
            value={
              billingTotals.billingTotal > 0
                ? `${formatYen(billingTotals.paidTotal)} / ${formatYen(billingTotals.billingTotal)}`
                : formatYen(billingTotals.paidTotal)
            }
            valueClassName="text-base"
            bordered
          />
        </div>
      )}

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

      {/* 表示分岐 */}
      {invitations.length === 0 ? (
        event.status === "finished" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            招待はありません
          </p>
        ) : event.status === "draft" ? null : (
          <NoInvitationsEmpty eventId={event.id} canIssue={canIssue} />
        )
      ) : (
        <InvitationList
          eventId={event.id}
          eventStatus={event.status}
          invitations={invitations}
          feeSettings={{
            attendanceFee: event.attendanceFee,
            afterPartyEnabled: event.afterPartyEnabled,
            afterPartyFee: event.afterPartyFee,
          }}
          isOrganizer={isOrganizer}
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
  valueClassName,
}: {
  label: string;
  value: string;
  bordered?: boolean;
  className?: string;
  /** 値の文字サイズ調整用（既定の text-xl では長すぎる金額など） */
  valueClassName?: string;
}) {
  const muted = value === "0" || value === "—";
  return (
    <div
      className={`flex flex-col justify-center ${bordered ? "border-l" : ""} ${className ?? ""}`}
    >
      <div
        className={`font-light tabular-nums leading-none tracking-tight ${
          valueClassName ?? "text-xl"
        } ${muted ? "text-muted-foreground" : ""}`}
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
