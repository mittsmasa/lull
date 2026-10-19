import { CreateEventDialog } from "@/app/_components/create-event-dialog";
import { EventCard } from "@/app/_components/event-card";
import { getEventsByUserId } from "@/lib/queries/events";
import { requireSession } from "@/lib/session";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function DashboardPage() {
  const session = await requireSession();
  const events = await getEventsByUserId(session.user.id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">マイイベント</h1>
        <CreateEventDialog />
      </div>

      {events.length === 0 ? (
        <p className="leading-relaxed text-muted-foreground">
          イベントがありません。新しいイベントを作成しましょう。
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
