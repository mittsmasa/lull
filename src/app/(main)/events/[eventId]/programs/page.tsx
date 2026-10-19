import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HeaderConfig } from "@/app/_components/header-config";
import { PageSkeleton } from "@/app/_components/page-skeleton";
import { ProgramManagement } from "@/app/_components/program-management";
import { getEventMembership } from "@/lib/queries/events";
import {
  getEventForProgramManagement,
  getEventMembersForSelect,
  getProgramsByEventId,
} from "@/lib/queries/programs";
import { requireSessionForRender } from "@/lib/session";

export default function ProgramsPage(
  props: PageProps<"/events/[eventId]/programs">,
) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <HeaderConfig showBackButton />
      <Suspense fallback={<PageSkeleton rows={5} />}>
        <ProgramsContent params={props.params} />
      </Suspense>
    </div>
  );
}

async function ProgramsContent({
  params,
}: Pick<PageProps<"/events/[eventId]/programs">, "params">) {
  const { eventId } = await params;
  const session = await requireSessionForRender();

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
    <ProgramManagement
      event={event}
      programs={programs}
      members={members}
      currentUserRole={membership.role}
    />
  );
}
