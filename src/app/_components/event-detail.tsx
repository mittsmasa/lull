"use client";

import {
  CalendarBlank,
  CaretRight,
  IdentificationCard,
  MapPin,
  MusicNotes,
  Scan,
  Users,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { PendingLinkIndicator } from "@/app/_components/pending-link-indicator";
import {
  deleteEvent,
  updateEvent,
  updateEventStatus,
} from "@/app/(main)/events/_actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { EventStatus, MemberRole } from "@/db/schema";
import {
  statusLabels,
  statusVariants,
  transitionLabels,
} from "@/lib/event-status";
import { formatDatetime } from "@/lib/format";
import type { EventStats } from "@/lib/queries/events";

type EventDetailProps = {
  event: {
    id: string;
    name: string;
    venue: string;
    startDatetime: string;
    openDatetime: string | null;
    status: EventStatus;
    totalSeats: number;
    eventMembers: Array<{
      id: string;
      role: MemberRole;
      displayName: string;
      user: { id: string; name: string; image: string | null };
    }>;
  };
  stats: EventStats;
  currentUserRole: MemberRole;
  availableTransitions: EventStatus[];
};

export function EventDetail({
  event,
  stats,
  currentUserRole,
  availableTransitions,
}: EventDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [, editAction, isEditPending] = useActionState(
    async (
      prevState: Awaited<ReturnType<typeof updateEvent>> | null,
      formData: FormData,
    ) => {
      const result = await updateEvent(event.id, prevState, formData);
      if (result && "error" in result) {
        toast.error(result.error);
      } else if (result && "event" in result) {
        toast.success("イベントを更新しました");
        setIsEditing(false);
      }
      return result;
    },
    null,
  );
  const isOrganizer = currentUserRole === "organizer";
  const canEdit =
    isOrganizer && (event.status === "draft" || event.status === "published");
  const canDelete =
    isOrganizer && (event.status === "draft" || event.status === "finished");

  const handleStatusChange = (newStatus: EventStatus) => {
    startTransition(async () => {
      const result = await updateEventStatus(event.id, newStatus);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("ステータスを変更しました");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteEvent(event.id);
      if (result?.error) {
        toast.error(result.error);
      }
      // 成功時は redirect されるため、ここには到達しない
    });
  };

  return (
    <div className="flex flex-col gap-10">
      {/* ヒーロー */}
      <header className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Badge
              variant={statusVariants[event.status]}
              className="w-fit tracking-[0.18em] uppercase"
            >
              {statusLabels[event.status]}
            </Badge>
            <h1 className="font-light text-3xl tracking-wide leading-tight md:text-4xl">
              {event.name}
            </h1>
          </div>
          {canEdit && !isEditing && (
            <Button
              variant="outline"
              onClick={() => setIsEditing(true)}
              className="tracking-wider"
            >
              編集
            </Button>
          )}
          {canEdit && isEditing && (
            <Button
              variant="ghost"
              onClick={() => setIsEditing(false)}
              className="tracking-wider"
            >
              キャンセル
            </Button>
          )}
        </div>

        {!isEditing && (
          <dl className="grid gap-6 border-border/60 border-y py-6 md:grid-cols-3">
            <FactItem
              icon={<CalendarBlank className="h-4 w-4" aria-hidden />}
              label="開演"
              value={formatDatetime(event.startDatetime)}
              sub={
                event.openDatetime
                  ? `開場 ${formatDatetime(event.openDatetime)}`
                  : null
              }
            />
            <FactItem
              icon={<MapPin className="h-4 w-4" aria-hidden />}
              label="会場"
              value={event.venue}
            />
            <FactItem
              icon={<IdentificationCard className="h-4 w-4" aria-hidden />}
              label="座席"
              value={
                event.totalSeats === 0 ? "無制限" : `${event.totalSeats} 席`
              }
            />
          </dl>
        )}
      </header>

      {/* 編集モード */}
      {isEditing && (
        <div className="rounded-sm border border-border/50 bg-card p-8">
          <h2 className="mb-6 font-light font-serif text-foreground text-lg">
            イベント情報を編集
          </h2>

          <form action={editAction} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">イベント名</Label>
              <Input
                type="text"
                id="name"
                name="name"
                required
                maxLength={100}
                defaultValue={event.name}
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="date">開催日</Label>
                <Input
                  type="date"
                  id="date"
                  name="date"
                  required
                  defaultValue={event.startDatetime.split("T")[0]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="startTime">開演時刻</Label>
                <Input
                  type="time"
                  id="startTime"
                  name="startTime"
                  required
                  defaultValue={event.startDatetime.split("T")[1]}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="openTime">開場時刻（任意）</Label>
              <Input
                type="time"
                id="openTime"
                name="openTime"
                defaultValue={event.openDatetime?.split("T")[1] ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="venue">会場</Label>
              <Input
                type="text"
                id="venue"
                name="venue"
                required
                maxLength={200}
                defaultValue={event.venue}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="totalSeats">座席数（0 = 無制限）</Label>
              <Input
                type="number"
                id="totalSeats"
                name="totalSeats"
                required
                min={0}
                max={9999}
                defaultValue={event.totalSeats}
              />
            </div>
            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={isEditPending}
                className="tracking-wider"
              >
                {isEditPending ? "更新中..." : "イベントを更新"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="tracking-wider"
                onClick={() => setIsEditing(false)}
              >
                キャンセル
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* 管理ハブ */}
      {!isEditing && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs uppercase text-muted-foreground tracking-[0.24em]">
              管理
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ManageTile
              href={`/events/${event.id}/programs`}
              icon={<MusicNotes className="h-4 w-4" aria-hidden />}
              label="プログラム"
              primary={`${stats.programCount} 件`}
              hint="演目・休憩・あいさつ"
            />
            <ManageTile
              href={`/events/${event.id}/members`}
              icon={<IdentificationCard className="h-4 w-4" aria-hidden />}
              label="メンバー"
              primary={`${stats.performerCount} 名`}
              hint="出演者の一覧と招待"
            />
            <ManageTile
              href={`/events/${event.id}/invitations`}
              icon={<Users className="h-4 w-4" aria-hidden />}
              label="ゲスト"
              primary={
                stats.invitationTotal === 0
                  ? "未発行"
                  : `${stats.invitationAccepted} / ${stats.invitationTotal} 出席`
              }
              hint={
                stats.invitationPending > 0
                  ? `未回答 ${stats.invitationPending} 件`
                  : "全員回答済"
              }
            />
            <ManageTile
              href={`/events/${event.id}/checkin`}
              icon={<Scan className="h-4 w-4" aria-hidden />}
              label="チェックイン"
              primary={
                stats.invitationAccepted === 0
                  ? "受付なし"
                  : `${stats.totalAttendees} 名 来場`
              }
              hint={
                stats.invitationAccepted === 0
                  ? "出席者が確定したら受付できます"
                  : `出席予定 ${stats.invitationAccepted} 名`
              }
            />
          </div>
        </section>
      )}

      {/* 二次アクション */}
      {!isEditing && isOrganizer && availableTransitions.length > 0 && (
        <Collapsible className="rounded-sm border border-border/60 border-dashed">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm tracking-wider transition-colors hover:bg-muted/40">
            <span className="text-muted-foreground">ステータスを変更</span>
            <CaretRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator />
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {availableTransitions.map((next) => (
                <Button
                  key={next}
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleStatusChange(next)}
                  className="tracking-wider"
                >
                  {transitionLabels[next]}
                </Button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Danger Zone */}
      {!isEditing && canDelete && (
        <div className="mt-2 flex items-center justify-between gap-4 border-border/40 border-t pt-6">
          <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
            このイベントを削除
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                削除
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>イベントを削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  {event.status === "finished"
                    ? `「${event.name}」のすべてのデータ（招待・チェックイン記録・プログラム情報）が完全に削除されます。この操作は元に戻せません。`
                    : `「${event.name}」を削除すると、関連するメンバー・招待・プログラム情報もすべて削除されます。この操作は元に戻せません。`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isPending}>
                  {isPending ? "削除中..." : "削除する"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function FactItem({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: <dl> の子として <fieldset> は使えないため、name-value group のラッパとして div + role="group" を採用
    <div role="group" className="flex flex-col gap-1.5">
      <dt className="flex items-center gap-2 text-muted-foreground text-xs tracking-[0.2em] uppercase">
        <span className="text-foreground/60">{icon}</span>
        {label}
      </dt>
      <dd className="font-light text-base leading-relaxed">{value}</dd>
      {sub && (
        <dd className="text-muted-foreground text-xs tracking-wide">{sub}</dd>
      )}
    </div>
  );
}

function ManageTile({
  href,
  icon,
  label,
  primary,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 rounded-sm border border-border/60 bg-card p-5 transition-colors hover:border-foreground/40 hover:bg-muted/30"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-muted-foreground text-xs tracking-[0.2em] uppercase">
          <span className="text-foreground/60">{icon}</span>
          <PendingLinkIndicator>{label}</PendingLinkIndicator>
        </span>
        <CaretRight
          className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-light text-foreground text-xl tracking-wide">
          {primary}
        </span>
        <span className="text-muted-foreground text-xs tracking-wide">
          {hint}
        </span>
      </div>
    </Link>
  );
}
