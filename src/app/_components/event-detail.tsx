"use client";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventStatus, MemberRole } from "@/db/schema";
import {
  statusLabels,
  statusVariants,
  transitionLabels,
} from "@/lib/event-status";
import { formatDatetime } from "@/lib/format";

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
  currentUserRole: MemberRole;
  availableTransitions: EventStatus[];
};

export function EventDetail({
  event,
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
    <div className="flex flex-col gap-8">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-wide">{event.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <Badge variant={statusVariants[event.status]}>
              {statusLabels[event.status]}
            </Badge>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? "キャンセル" : "編集"}
          </Button>
        )}
      </div>

      {/* イベント情報 — 閲覧モード */}
      {!isEditing && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
                開催日時
              </p>
              <p className="leading-relaxed">
                {formatDatetime(event.startDatetime)}
              </p>
            </div>
            {event.openDatetime && (
              <div>
                <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
                  開場
                </p>
                <p className="leading-relaxed">
                  {formatDatetime(event.openDatetime)}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
                会場
              </p>
              <p className="leading-relaxed">{event.venue}</p>
            </div>
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
                座席数
              </p>
              <p className="leading-relaxed">
                {event.totalSeats === 0 ? "無制限" : `${event.totalSeats} 席`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* イベント情報 — 編集モード */}
      {isEditing && (
        <div className="rounded-sm border border-border/50 bg-card p-8">
          <h2 className="mb-6 font-serif text-lg font-light text-foreground">
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

      {/* ステータス変更（主催者のみ） */}
      {isOrganizer && availableTransitions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-light tracking-wide text-lg">
              ステータス変更
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            {availableTransitions.map((next) => (
              <Button
                key={next}
                variant="outline"
                disabled={isPending}
                onClick={() => handleStatusChange(next)}
                className="tracking-wider"
              >
                {transitionLabels[next]}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 管理メニュー（後続で実装するページへのリンク） */}
      <Card>
        <CardHeader>
          <CardTitle className="font-light tracking-wide text-lg">
            管理
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" asChild className="tracking-wider">
            <Link href={`/events/${event.id}/programs`}>
              <PendingLinkIndicator>プログラム管理</PendingLinkIndicator>
            </Link>
          </Button>
          <Button variant="outline" asChild className="tracking-wider">
            <Link href={`/events/${event.id}/members`}>
              <PendingLinkIndicator>メンバー管理</PendingLinkIndicator>
            </Link>
          </Button>
          <Button variant="outline" asChild className="tracking-wider">
            <Link href={`/events/${event.id}/invitations`}>
              <PendingLinkIndicator>招待管理</PendingLinkIndicator>
            </Link>
          </Button>
          <Button variant="outline" asChild className="tracking-wider">
            <Link href={`/events/${event.id}/checkin`}>
              <PendingLinkIndicator>チェックイン</PendingLinkIndicator>
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* 削除（主催者 + draft/finished のみ） */}
      {isOrganizer &&
        (event.status === "draft" || event.status === "finished") && (
          <div className="pt-4 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">イベントを削除</Button>
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
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isPending}
                  >
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
