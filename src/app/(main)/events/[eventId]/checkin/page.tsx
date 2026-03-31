import { notFound } from "next/navigation";
import { CheckInView } from "@/app/_components/check-in-view";
import { HeaderConfig } from "@/app/_components/header-config";
import { getEventMembership } from "@/lib/queries/events";
import {
  getCheckInList,
  getCheckInSummary,
  getEventForInvitationManagement,
} from "@/lib/queries/invitations";
import { requireSession } from "@/lib/session";

export default async function CheckInPage(
  props: PageProps<"/events/[eventId]/checkin">,
) {
  const { eventId } = await props.params;
  const session = await requireSession();

  const membership = await getEventMembership(eventId, session.user.id);
  if (!membership) notFound();

  const event = await getEventForInvitationManagement(eventId);
  if (!event) notFound();

  const summary = await getCheckInSummary(eventId);
  const checkInList = await getCheckInList(eventId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <HeaderConfig showBackButton />
      <CheckInView event={event} summary={summary} initialList={checkInList} />
    </div>
  );
}
