import { notFound } from "next/navigation";
import { HeaderConfig } from "@/app/_components/header-config";
import { MemberManagement } from "@/app/_components/member-management";
import { getEventMembership } from "@/lib/queries/events";
import {
  getEventForMemberManagement,
  getEventMembers,
  getPerformerInvitations,
} from "@/lib/queries/members";
import { requireSession } from "@/lib/session";

export default async function MembersPage(
  props: PageProps<"/events/[eventId]/members">,
) {
  const { eventId } = await props.params;
  const session = await requireSession();

  const membership = await getEventMembership(eventId, session.user.id);
  if (!membership) {
    notFound();
  }

  const event = await getEventForMemberManagement(eventId);
  if (!event) {
    notFound();
  }

  const members = await getEventMembers(eventId);
  const invitations = await getPerformerInvitations(eventId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <HeaderConfig showBackButton />
      <MemberManagement
        event={event}
        members={members}
        performerInvitations={invitations}
        currentUserId={session.user.id}
        currentUserRole={membership.role}
      />
    </div>
  );
}
