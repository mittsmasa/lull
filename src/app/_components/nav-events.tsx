import {
  NavEventList,
  type NavigationEvent,
} from "@/app/_components/navigation-sheet";
import { SkeletonRule } from "@/app/_components/skeleton";
import { getEventsByUserId } from "@/lib/queries/events";
import { getSessionForRender } from "@/lib/session";

/**
 * ナビゲーションのマイイベント一覧。
 * セッションと DB を読むため `<Suspense>` の内側に置く。
 */
export async function NavEvents() {
  const session = await getSessionForRender();
  if (!session) return null;

  const events: NavigationEvent[] = (
    await getEventsByUserId(session.user.id)
  ).map((e) => ({ id: e.id, name: e.name, status: e.status }));

  return <NavEventList events={events} />;
}

export function NavEventsSkeleton() {
  return (
    <div className="mt-4 flex flex-col gap-1">
      <p className="px-3 pb-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        マイイベント
      </p>
      <div className="flex flex-col gap-4 px-3 py-3">
        <SkeletonRule className="w-5/6" />
        <SkeletonRule className="w-2/3" />
        <SkeletonRule className="w-3/4" />
      </div>
    </div>
  );
}
