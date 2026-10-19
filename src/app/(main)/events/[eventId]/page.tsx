import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventDetail } from "@/app/_components/event-detail";
import { HeaderConfig } from "@/app/_components/header-config";
import { PageSkeleton } from "@/app/_components/page-skeleton";
import { VALID_TRANSITIONS } from "@/db/schema";
import {
  getEventDetail,
  getEventMembership,
  getEventStats,
} from "@/lib/queries/events";
import { requireSessionForRender } from "@/lib/session";
import { isStripeEnabled } from "@/lib/stripe";

export default function EventDetailPage(props: PageProps<"/events/[eventId]">) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <HeaderConfig showBackButton />
      <Suspense fallback={<PageSkeleton stats rows={4} />}>
        <EventDetailContent params={props.params} />
      </Suspense>
    </div>
  );
}

async function EventDetailContent({
  params,
}: Pick<PageProps<"/events/[eventId]">, "params">) {
  const { eventId } = await params;
  const session = await requireSessionForRender();

  const member = await getEventMembership(eventId, session.user.id);
  if (!member) {
    notFound();
  }

  const [event, stats] = await Promise.all([
    getEventDetail(eventId),
    getEventStats(eventId),
  ]);
  if (!event) {
    notFound();
  }

  const availableTransitions = [...VALID_TRANSITIONS[event.status]];

  return (
    <EventDetail
      event={event}
      stats={stats}
      currentUserRole={member.role}
      availableTransitions={availableTransitions}
      stripeEnabled={isStripeEnabled()}
    />
  );
}
