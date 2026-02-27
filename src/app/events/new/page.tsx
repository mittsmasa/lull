import { CreateEventForm } from "@/app/_components/create-event-form";
import { requireSession } from "@/lib/session";

export default async function NewEventPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-10 text-2xl font-light tracking-wide">
        イベントを作成
      </h1>
      <CreateEventForm />
    </div>
  );
}
