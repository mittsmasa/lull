import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EventStatus, MemberRole } from "@/db/schema";
import { statusLabels, statusVariants } from "@/lib/event-status";
import { formatDatetime } from "@/lib/format";

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
      <Card className="transition-all duration-300 ease-out hover:scale-[1.01] hover:bg-accent/50">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="font-light tracking-wide">
              {event.name}
            </CardTitle>
            <CardDescription className="leading-relaxed">
              {formatDatetime(event.startDatetime)} / {event.venue}
            </CardDescription>
          </div>
          <Badge variant={statusVariants[event.status]}>
            {statusLabels[event.status]}
          </Badge>
        </CardHeader>
      </Card>
    </Link>
  );
}
