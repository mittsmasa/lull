"use client";

import { useState, useTransition } from "react";
import {
  removeMember,
  updateDisplayName,
} from "@/app/(main)/events/[eventId]/members/_actions";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { EventStatus, MemberRole } from "@/db/schema";
import type { MemberWithUser } from "@/lib/queries/members";

const roleLabels: Record<MemberRole, string> = {
  organizer: "主催者",
  performer: "出演者",
};

export function MemberList({
  eventId,
  eventStatus,
  members,
  currentUserId,
  isOrganizer,
  canModify,
}: {
  eventId: string;
  eventStatus: EventStatus;
  members: MemberWithUser[];
  currentUserId: string;
  isOrganizer: boolean;
  canModify: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canUpdateDisplayName =
    eventStatus === "draft" ||
    eventStatus === "published" ||
    eventStatus === "ongoing";

  const handleRemove = (memberId: string) => {
    setPendingId(memberId);
    startTransition(async () => {
      const result = await removeMember(eventId, memberId);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(null);
      }
      setPendingId(null);
    });
  };

  // 主催者を先頭に、残りは createdAt 順
  const sorted = [...members].sort((a, b) => {
    if (a.role === "organizer" && b.role !== "organizer") return -1;
    if (a.role !== "organizer" && b.role === "organizer") return 1;
    return a.createdAt - b.createdAt;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-light tracking-wide text-lg">
          メンバー一覧
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {sorted.map((member, index) => (
          <div key={member.id}>
            {index > 0 && <Separator />}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="leading-relaxed">{member.displayName}</span>
                <Badge
                  variant={
                    member.role === "organizer" ? "secondary" : "outline"
                  }
                >
                  {roleLabels[member.role]}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {/* 自分の行のみ表示名変更ボタン */}
                {member.user.id === currentUserId && canUpdateDisplayName && (
                  <EditDisplayNameDialog
                    eventId={eventId}
                    currentDisplayName={member.displayName}
                  />
                )}
                {/* 削除ボタン（主催者のみ、出演者のみ、draft/published のみ） */}
                {isOrganizer && canModify && member.role === "performer" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isPending}
                      >
                        削除
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          メンバーを削除しますか？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          「{member.displayName}
                          」を削除します。このメンバーに紐づくゲスト招待も削除されます。この操作は元に戻せません。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemove(member.id)}
                          disabled={isPending}
                        >
                          {pendingId === member.id ? "削除中..." : "削除する"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            メンバーがいません
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// EditDisplayNameDialog
// ============================================================

function EditDisplayNameDialog({
  eventId,
  currentDisplayName,
}: {
  eventId: string;
  currentDisplayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateDisplayName(eventId, null, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(null);
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          表示名変更
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>表示名を変更</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">表示名</Label>
            <Input
              type="text"
              id="displayName"
              name="displayName"
              required
              maxLength={50}
              defaultValue={currentDisplayName}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "変更中..." : "変更"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
