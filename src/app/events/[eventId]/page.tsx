import { notFound } from "next/navigation";
import { EventDetail } from "@/app/_components/event-detail";
import { getEventDetail, getEventMembership } from "@/lib/queries/events";
import { requireSession } from "@/lib/session";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const session = await requireSession();

  const member = await getEventMembership(eventId, session.user.id);
  if (!member) {
    notFound();
  }

  const event = await getEventDetail(eventId);
  if (!event) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <EventDetail event={event} currentUserRole={member.role} />
    </div>
  );
}
