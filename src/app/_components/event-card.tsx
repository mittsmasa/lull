import Link from "next/link";
import { EventCardInner } from "@/app/_components/event-card-inner";
import type { EventStatus, MemberRole } from "@/db/schema";

type EventCardProps = {
  event: {
    id: string;
    name: string;
    startDatetime: string;
    venue: string;
    status: EventStatus;
    role: MemberRole;
  };
};

export function EventCard({ event }: EventCardProps) {
  return (
    <Link href={`/events/${event.id}`}>
      <EventCardInner event={event} />
    </Link>
  );
}
