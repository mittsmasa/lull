import { notFound } from "next/navigation";
import { HeaderConfig } from "@/app/_components/header-config";
import { InvitationManagement } from "@/app/_components/invitation-management";
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <HeaderConfig showBackButton />
      <InvitationManagement
        event={event}
        invitations={allInvitations}
        seatSummary={seatSummary}
        paymentSummary={paymentSummary}
        currentMemberId={membership.id}
        currentUserRole={membership.role}
      />
    </div>
  );
}
