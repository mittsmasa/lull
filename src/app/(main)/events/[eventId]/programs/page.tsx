import { notFound } from "next/navigation";
import { HeaderConfig } from "@/app/_components/header-config";
import { ProgramManagement } from "@/app/_components/program-management";
import { getEventMembership } from "@/lib/queries/events";
import {
  getEventForProgramManagement,
  getEventMembersForSelect,
  getProgramsByEventId,
} from "@/lib/queries/programs";
import { requireSession } from "@/lib/session";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function ProgramsPage(
  props: PageProps<"/events/[eventId]/programs">,
) {
  const { eventId } = await props.params;
  const session = await requireSession();

  const membership = await getEventMembership(eventId, session.user.id);
  if (!membership) {
    notFound();
  }

  const event = await getEventForProgramManagement(eventId);
  if (!event) {
    notFound();
  }

  const [programs, members] = await Promise.all([
    getProgramsByEventId(eventId),
    getEventMembersForSelect(eventId),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <HeaderConfig showBackButton />
      <ProgramManagement
        event={event}
        programs={programs}
        members={members}
        currentUserRole={membership.role}
      />
    </div>
  );
}
