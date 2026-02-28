import { notFound } from "next/navigation";
import { EventDetail } from "@/app/_components/event-detail";
import { VALID_TRANSITIONS } from "@/db/schema";
import { getEventDetail, getEventMembership } from "@/lib/queries/events";
import { requireSession } from "@/lib/session";

export default async function EventDetailPage(
  props: PageProps<"/events/[eventId]">,
) {
  const { eventId } = await props.params;
  const session = await requireSession();

  const member = await getEventMembership(eventId, session.user.id);
  if (!member) {
    notFound();
  }

  const event = await getEventDetail(eventId);
  if (!event) {
    notFound();
  }

  const availableTransitions = [...VALID_TRANSITIONS[event.status]];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <EventDetail
        event={event}
        currentUserRole={member.role}
        availableTransitions={availableTransitions}
      />
    </div>
  );
}
