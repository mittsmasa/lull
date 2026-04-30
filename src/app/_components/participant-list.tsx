"use client";

import {
  Copy,
  DotsThree,
  PencilSimple,
  Trash,
  UserMinus,
  XCircle,
} from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deletePerformerInvitation,
  invalidatePerformerInvitation,
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventStatus } from "@/db/schema";
import { copyText } from "@/lib/clipboard";
import { formatPerformerInvitationCopy } from "@/lib/invitation-copy";
import type {
  MemberWithUser,
  PerformerInvitationItem,
} from "@/lib/queries/members";
import { buildShareUrl } from "@/lib/share-url";
import { cn } from "@/lib/utils";
import { ParticipantAvatar } from "./participant-avatar";

type Props = {
  eventId: string;
  eventStatus: EventStatus;
  members: MemberWithUser[];
  invitations: PerformerInvitationItem[];
  currentUserId: string;
  isOrganizer: boolean;
};

export function ParticipantList({
  eventId,
  eventStatus,
  members,
  invitations,
  currentUserId,
  isOrganizer,
}: Props) {
  const canModify = eventStatus === "draft" || eventStatus === "published";
  const canInvalidate = canModify || eventStatus === "ongoing";
  const canEditOwnName =
    eventStatus === "draft" ||
    eventStatus === "published" ||
    eventStatus === "ongoing";

  const sortedByCreated = (
    a: { createdAt: number },
    b: { createdAt: number },
  ) => a.createdAt - b.createdAt;

  const organizers = members
    .filter((m) => m.role === "organizer")
    .sort(sortedByCreated);
  const performers = members
    .filter((m) => m.role === "performer")
    .sort(sortedByCreated);
  const pendingInvitations = invitations
    .filter((i) => i.status === "pending")
    .sort(sortedByCreated);
  const invalidatedInvitations = invitations
    .filter((i) => i.status === "invalidated")
    .sort(sortedByCreated);
  const showInvitationSection =
    isOrganizer &&
    (pendingInvitations.length > 0 || invalidatedInvitations.length > 0);

  return (
    <div className="flex flex-col gap-7">
      <Section label="主催者" count={organizers.length}>
        {organizers.map((m) => (
          <MemberRow
            key={m.id}
            eventId={eventId}
            member={m}
            isSelf={m.user.id === currentUserId}
            isOrganizer={isOrganizer}
            canModify={canModify}
            canEditOwnName={canEditOwnName}
          />
        ))}
      </Section>

      <Section label="出演者" count={performers.length}>
        {performers.length === 0 ? (
          <li className="px-1 py-4 text-sm text-muted-foreground">
            出演者はまだいません
          </li>
        ) : (
          performers.map((m) => (
            <MemberRow
              key={m.id}
              eventId={eventId}
              member={m}
              isSelf={m.user.id === currentUserId}
              isOrganizer={isOrganizer}
              canModify={canModify}
              canEditOwnName={canEditOwnName}
            />
          ))
        )}
      </Section>

      {showInvitationSection && (
        <Section
          label="招待中"
          count={pendingInvitations.length}
          subCount={
            invalidatedInvitations.length > 0
              ? `${invalidatedInvitations.length} 無効`
              : undefined
          }
        >
          {pendingInvitations.map((inv) => (
            <InvitationRow
              key={inv.id}
              eventId={eventId}
              invitation={inv}
              canModify={canModify}
              canInvalidate={canInvalidate}
            />
          ))}
          {invalidatedInvitations.map((inv) => (
            <InvitationRow
              key={inv.id}
              eventId={eventId}
              invitation={inv}
              canModify={canModify}
              canInvalidate={canInvalidate}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

// ============================================================
// Section
// ============================================================

function Section({
  label,
  count,
  subCount,
  children,
}: {
  label: string;
  count: number;
  subCount?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 px-0.5">
        <span className="text-[11px] tracking-[0.42em] text-muted-foreground">
          {label}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {count}
          {subCount ? ` / ${subCount}` : ""}
        </span>
      </div>
      <ul className="mt-2 border-t">{children}</ul>
    </section>
  );
}

// ============================================================
// MemberRow（accepted: organizer or performer）
// ============================================================

function MemberRow({
  eventId,
  member,
  isSelf,
  isOrganizer,
  canModify,
  canEditOwnName,
}: {
  eventId: string;
  member: MemberWithUser;
  isSelf: boolean;
  isOrganizer: boolean;
  canModify: boolean;
  canEditOwnName: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const showEditOwnName = isSelf && canEditOwnName;
  const showRemove =
    !isSelf && isOrganizer && canModify && member.role === "performer";
  const hasMenu = showEditOwnName || showRemove;

  const meta = isSelf
    ? "あなた"
    : member.role === "organizer"
      ? "主催者"
      : `${formatJoinDate(member.createdAt)} 参加`;

  const variant = member.role === "organizer" ? "organizer" : "performer";

  return (
    <li className="flex items-center gap-3 border-b py-3.5">
      <ParticipantAvatar displayName={member.displayName} variant={variant} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] leading-snug">
          {member.displayName}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{meta}</div>
      </div>
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-[44px] min-w-[44px] text-muted-foreground"
              aria-label="操作メニュー"
            >
              <DotsThree className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {showEditOwnName && (
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <PencilSimple className="size-4" aria-hidden />
                表示名を変更
              </DropdownMenuItem>
            )}
            {showRemove && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setRemoveOpen(true)}
              >
                <UserMinus className="size-4" aria-hidden />
                メンバーを削除
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {showEditOwnName && (
        <EditDisplayNameDialog
          eventId={eventId}
          currentDisplayName={member.displayName}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {showRemove && (
        <RemoveMemberDialog
          eventId={eventId}
          memberId={member.id}
          displayName={member.displayName}
          open={removeOpen}
          onOpenChange={setRemoveOpen}
        />
      )}
    </li>
  );
}

// ============================================================
// InvitationRow（pending or invalidated）
// ============================================================

function InvitationRow({
  eventId,
  invitation,
  canModify,
  canInvalidate,
}: {
  eventId: string;
  invitation: PerformerInvitationItem;
  canModify: boolean;
  canInvalidate: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const isPendingStatus = invitation.status === "pending";
  const isInvalidated = invitation.status === "invalidated";

  // メニュー出し分け（plan 表に従う。finished では canModify/canInvalidate がいずれも false になるため自動的に hasMenu = false）
  const showRecopy = isPendingStatus && canModify;
  const showInvalidate = isPendingStatus && canInvalidate;
  const showDelete = isInvalidated && canModify;
  const hasMenu = showRecopy || showInvalidate || showDelete;

  const handleRecopy = async () => {
    const url = buildShareUrl(`/join/${invitation.token}`);
    const text = formatPerformerInvitationCopy({
      url,
      displayName: invitation.displayName,
    });
    try {
      await copyText(text);
      toast.success("リンクをコピーしました");
    } catch {
      toast.error("クリップボードへのコピーに失敗しました");
    }
  };

  const handleInvalidate = () => {
    startTransition(async () => {
      const result = await invalidatePerformerInvitation(
        eventId,
        invitation.id,
      );
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("招待を無効化しました");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePerformerInvitation(eventId, invitation.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("招待を削除しました");
      }
    });
  };

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b py-3.5",
        isInvalidated && "opacity-60",
      )}
    >
      <ParticipantAvatar
        displayName={invitation.displayName}
        variant={isInvalidated ? "invalidated" : "pending"}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[15px] leading-snug",
            isInvalidated && "text-muted-foreground line-through",
          )}
        >
          {invitation.displayName}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {isPendingStatus ? (
            <>
              <span
                className="inline-block size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
                aria-hidden
              />
              未承認 · リンク発行済
            </>
          ) : (
            "無効化済み"
          )}
        </div>
      </div>
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-[44px] min-w-[44px] text-muted-foreground"
              aria-label="操作メニュー"
              disabled={isPending}
            >
              <DotsThree className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {showRecopy && (
              <DropdownMenuItem onSelect={() => void handleRecopy()}>
                <Copy className="size-4" aria-hidden />
                リンクを再コピー
              </DropdownMenuItem>
            )}
            {showInvalidate && (
              <DropdownMenuItem onSelect={() => handleInvalidate()}>
                <XCircle className="size-4" aria-hidden />
                招待を無効化
              </DropdownMenuItem>
            )}
            {showDelete && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => handleDelete()}
              >
                <Trash className="size-4" aria-hidden />
                招待を削除
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

// ============================================================
// EditDisplayNameDialog（自分のみ）
// ============================================================

function EditDisplayNameDialog({
  eventId,
  currentDisplayName,
  open,
  onOpenChange,
}: {
  eventId: string;
  currentDisplayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateDisplayName(eventId, null, formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("表示名を変更しました");
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>表示名を変更</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="editDisplayName">表示名</Label>
            <Input
              type="text"
              id="editDisplayName"
              name="displayName"
              required
              maxLength={50}
              defaultValue={currentDisplayName}
              className="text-base"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isPending}
              className="min-h-[44px] w-full sm:w-auto"
            >
              {isPending ? "変更中..." : "変更"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// RemoveMemberDialog（主催者 → 出演者のみ）
// ============================================================

function RemoveMemberDialog({
  eventId,
  memberId,
  displayName,
  open,
  onOpenChange,
}: {
  eventId: string;
  memberId: string;
  displayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await removeMember(eventId, memberId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("メンバーを削除しました");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>メンバーを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            「{displayName}
            」を削除します。このメンバーに紐づくゲスト招待も削除されます。この操作は元に戻せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleConfirm()}
            disabled={isPending}
          >
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// utility
// ============================================================

function formatJoinDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  const month = date.toLocaleString("ja-JP", {
    month: "numeric",
    timeZone: "Asia/Tokyo",
  });
  const day = date.toLocaleString("ja-JP", {
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
  return `${month}${day}`;
}
