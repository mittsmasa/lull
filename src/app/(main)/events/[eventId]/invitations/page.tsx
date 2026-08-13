import { notFound } from "next/navigation";
import { HeaderConfig } from "@/app/_components/header-config";
import { InvitationManagement } from "@/app/_components/invitation-management";
import { summarizeBilling } from "@/lib/payment";
import { getEventMembership } from "@/lib/queries/events";
import {
  getEventForInvitationManagement,
  getInvitationsByEventId,
  getPaymentSummary,
  getSeatSummary,
} from "@/lib/queries/invitations";
import { requireSession } from "@/lib/session";

export default async function InvitationsPage(
  props: PageProps<"/events/[eventId]/invitations">,
) {
  const { eventId } = await props.params;
  const session = await requireSession();

  const membership = await getEventMembership(eventId, session.user.id);
  if (!membership) {
    notFound();
  }

  const event = await getEventForInvitationManagement(eventId);
  if (!event) {
    notFound();
  }

  const [allInvitations, seatSummary, paymentSummary] = await Promise.all([
    getInvitationsByEventId(eventId),
    getSeatSummary(eventId, event.totalSeats),
    getPaymentSummary(eventId),
  ]);

  // 一覧は自分が発行した招待のみ。他メンバーの招待はクライアントへ渡さない
  const myInvitations = allInvitations.filter(
    (i) => i.memberId === membership.id,
  );

  // サマリは一覧と非連動でイベント全体を集計する
  const accepted = allInvitations.filter((i) => i.status === "accepted");
  const responseSummary = {
    acceptedCount:
      accepted.length + accepted.reduce((sum, i) => sum + i.companionCount, 0),
    pendingCount: allInvitations.filter(
      (i) => i.status === "pending" && !i.invalidatedAt,
    ).length,
  };

  // 請求額は保存値がないため、イベント全体でも calcBilling を通して集計する
  const billingTotals = summarizeBilling(allInvitations, {
    attendanceFee: event.attendanceFee,
    afterPartyEnabled: event.afterPartyEnabled,
    afterPartyFee: event.afterPartyFee,
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <HeaderConfig showBackButton />
      <InvitationManagement
        event={event}
        invitations={myInvitations}
        seatSummary={seatSummary}
        paymentSummary={paymentSummary}
        responseSummary={responseSummary}
        billingTotals={billingTotals}
        currentUserRole={membership.role}
      />
    </div>
  );
}
