import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckInView } from "@/app/_components/check-in-view";
import { HeaderConfig } from "@/app/_components/header-config";
import { PageSkeleton } from "@/app/_components/page-skeleton";
import { getEventMembership } from "@/lib/queries/events";
import {
  getCheckInList,
  getCheckInSummary,
  getEventForInvitationManagement,
} from "@/lib/queries/invitations";
import { requireSessionForRender } from "@/lib/session";
import { isStripeEnabled } from "@/lib/stripe";

export default function CheckInPage(
  props: PageProps<"/events/[eventId]/checkin">,
) {
  return (
    <>
      <HeaderConfig showBackButton />
      <Suspense
        fallback={
          <div className="mx-auto max-w-md px-4 py-12">
            <PageSkeleton stats rows={6} />
          </div>
        }
      >
        <CheckInContent params={props.params} />
      </Suspense>
    </>
  );
}

async function CheckInContent({
  params,
}: Pick<PageProps<"/events/[eventId]/checkin">, "params">) {
  const { eventId } = await params;
  const session = await requireSessionForRender();

  const membership = await getEventMembership(eventId, session.user.id);
  if (!membership) notFound();

  const event = await getEventForInvitationManagement(eventId);
  if (!event) notFound();

  const summary = await getCheckInSummary(eventId);
  const checkInList = await getCheckInList(eventId);

  return (
    <CheckInView
      event={event}
      summary={summary}
      initialList={checkInList}
      stripeEnabled={isStripeEnabled()}
    />
  );
}
