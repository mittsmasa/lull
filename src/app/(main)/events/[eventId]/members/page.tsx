import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HeaderConfig } from "@/app/_components/header-config";
import { MemberManagement } from "@/app/_components/member-management";
import { PageSkeleton } from "@/app/_components/page-skeleton";
import { getEventMembership } from "@/lib/queries/events";
import {
  getEventForMemberManagement,
  getEventMembers,
  getPerformerInvitations,
} from "@/lib/queries/members";
import { requireSessionForRender } from "@/lib/session";

export default function MembersPage(
  props: PageProps<"/events/[eventId]/members">,
) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <HeaderConfig showBackButton />
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <MembersContent params={props.params} />
      </Suspense>
    </div>
  );
}

async function MembersContent({
  params,
}: Pick<PageProps<"/events/[eventId]/members">, "params">) {
  const { eventId } = await params;
  const session = await requireSessionForRender();

  const membership = await getEventMembership(eventId, session.user.id);
  if (!membership) {
    notFound();
  }

  const event = await getEventForMemberManagement(eventId);
  if (!event) {
    notFound();
  }

  const members = await getEventMembers(eventId);
  const invitations =
    membership.role === "organizer"
      ? await getPerformerInvitations(eventId)
      : [];

  return (
    <MemberManagement
      event={event}
      members={members}
      performerInvitations={invitations}
      currentUserId={session.user.id}
      currentUserRole={membership.role}
    />
  );
}
