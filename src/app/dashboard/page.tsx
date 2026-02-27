import Link from "next/link";
import { EventCard } from "@/app/_components/event-card";
import { Button } from "@/components/ui/button";
import { getEventsByUserId } from "@/lib/queries/events";
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireSession();
  const events = await getEventsByUserId(session.user.id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">マイイベント</h1>
        <Button asChild>
          <Link href="/events/new">イベントを作成</Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="leading-relaxed text-muted-foreground">
          イベントがありません。新しいイベントを作成しましょう。
        </p>
      ) : (
        <div className="space-y-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
