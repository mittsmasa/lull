import { Suspense } from "react";
import { CreateEventDialog } from "@/app/_components/create-event-dialog";
import { EventCard } from "@/app/_components/event-card";
import { SkeletonBlock, SkeletonRule } from "@/app/_components/skeleton";
import { getEventsByUserId } from "@/lib/queries/events";
import { requireSessionForRender } from "@/lib/session";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">マイイベント</h1>
        <CreateEventDialog />
      </div>

      <Suspense fallback={<EventListSkeleton />}>
        <EventList />
      </Suspense>
    </div>
  );
}

function EventListSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {["first", "second"].map((slot) => (
        <div
          key={slot}
          className="flex flex-col gap-4 rounded-md border border-border/50 p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <SkeletonBlock className="h-5 w-1/2" />
            <SkeletonBlock className="h-5 w-20 rounded-full" />
          </div>
          <SkeletonRule className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

async function EventList() {
  const session = await requireSessionForRender();
  const events = await getEventsByUserId(session.user.id);

  if (events.length === 0) {
    return (
      <p className="leading-relaxed text-muted-foreground">
        イベントがありません。新しいイベントを作成しましょう。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
