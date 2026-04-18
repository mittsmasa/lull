"use client";

import { Spinner } from "@phosphor-icons/react";
import { useLinkStatus } from "next/link";
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
import { cn } from "@/lib/utils";

export function EventCardInner({
  event,
}: {
  event: {
    id: string;
    name: string;
    startDatetime: string;
    venue: string;
    status: EventStatus;
    role: MemberRole;
  };
}) {
  const { pending } = useLinkStatus();

  return (
    <Card
      className={cn(
        "transition-all duration-300 ease-out hover:scale-[1.01] hover:bg-accent/50",
        pending && "opacity-60",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="font-light tracking-wide flex items-center gap-2">
            {pending && <Spinner className="size-4 animate-spin" />}
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
  );
}
