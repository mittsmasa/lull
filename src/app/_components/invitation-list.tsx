"use client";

import {
  CheckCircle,
  Copy,
  DotsThree,
  Trash,
  XCircle,
} from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteInvitation,
  invalidateInvitation,
  proxyChangeStatus,
} from "@/app/(main)/events/[eventId]/invitations/_actions";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EventStatus } from "@/db/schema";
import { copyText } from "@/lib/clipboard";
import { formatGuestInvitationCopy } from "@/lib/invitation-copy";
import type { InvitationItem } from "@/lib/queries/invitations";
import { buildShareUrl } from "@/lib/share-url";
import { cn } from "@/lib/utils";
import { ParticipantAvatar } from "./participant-avatar";

type View = "all" | "mine";

type Props = {
  eventId: string;
  eventStatus: EventStatus;
  invitations: InvitationItem[];
  currentMemberId: string;
  isOrganizer: boolean;
  view: View;
};

export function InvitationList({
  eventId,
  eventStatus,
  invitations,
  currentMemberId,
  isOrganizer,
  view,
}: Props) {
  const visible =
    view === "mine"
      ? invitations.filter((i) => i.memberId === currentMemberId)
      : invitations;

  const sortedByCreated = (a: InvitationItem, b: InvitationItem) =>
    a.createdAt - b.createdAt;

  const pendingItems = visible
    .filter((i) => i.status === "pending" && !i.invalidatedAt)
    .sort(sortedByCreated);
  const acceptedItems = visible
    .filter((i) => i.status === "accepted")
    .sort(sortedByCreated);
  const declinedOrInvalidatedItems = visible
    .filter((i) => i.status === "declined" || !!i.invalidatedAt)
    .sort(sortedByCreated);

  const renderRow = (invitation: InvitationItem, section: SectionKind) => (
    <InvitationRow
      key={invitation.id}
      eventId={eventId}
      eventStatus={eventStatus}
      invitation={invitation}
      currentMemberId={currentMemberId}
      isOrganizer={isOrganizer}
      section={section}
    />
  );

  return (
    <div className="flex flex-col gap-7">
      {pendingItems.length > 0 && (
        <Section label="回答待ち" count={pendingItems.length}>
          {pendingItems.map((i) => renderRow(i, "pending"))}
        </Section>
      )}
      {acceptedItems.length > 0 && (
        <Section label="出席" count={acceptedItems.length}>
          {acceptedItems.map((i) => renderRow(i, "accepted"))}
        </Section>
      )}
      {declinedOrInvalidatedItems.length > 0 && (
        <Section label="辞退・無効化" count={declinedOrInvalidatedItems.length}>
          {declinedOrInvalidatedItems.map((i) =>
            renderRow(i, "declined-invalidated"),
          )}
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
  children,
}: {
  label: string;
  count: number;
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
        </span>
      </div>
      <ul className="mt-2 border-t">{children}</ul>
    </section>
  );
}

// ============================================================
// InvitationRow
// ============================================================

type SectionKind = "pending" | "accepted" | "declined-invalidated";

function InvitationRow({
  eventId,
  eventStatus,
  invitation,
  currentMemberId,
  isOrganizer,
  section,
}: {
  eventId: string;
  eventStatus: EventStatus;
  invitation: InvitationItem;
  currentMemberId: string;
  isOrganizer: boolean;
  section: SectionKind;
}) {
  const [isPending, startTransition] = useTransition();
  const [invalidateOpen, setInvalidateOpen] = useState(false);
  const [proxyToDeclinedOpen, setProxyToDeclinedOpen] = useState(false);
  const [proxyToAcceptedOpen, setProxyToAcceptedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isInvalidated = !!invitation.invalidatedAt;
  const isFinished = eventStatus === "finished";
  const canModify = eventStatus === "published" || eventStatus === "ongoing";
  const isMine = invitation.memberId === currentMemberId;
  const canControl = isOrganizer || isMine;

  // メニュー出し分け（plan の表に従う）
  const showCopy = !isInvalidated;
  const showInvalidate = canModify && canControl && !isInvalidated;
  const showProxyToDeclined =
    canModify &&
    isOrganizer &&
    invitation.status === "accepted" &&
    !isInvalidated;
  const showProxyToAccepted =
    canModify &&
    isOrganizer &&
    invitation.status === "declined" &&
    !isInvalidated;
  const showDelete = !isFinished && isInvalidated && canControl;

  const hasMenu =
    showCopy ||
    showInvalidate ||
    showProxyToDeclined ||
    showProxyToAccepted ||
    showDelete;

  const guestDisplayName = invitation.guestName ?? "未設定";

  const avatarVariant = isInvalidated
    ? ("invalidated" as const)
    : invitation.status === "accepted"
      ? ("accepted" as const)
      : ("pending" as const);

  const handleCopyLink = async () => {
    const url = buildShareUrl(`/i/${invitation.token}`);
    const text = formatGuestInvitationCopy({
      url,
      guestName: invitation.guestName,
      status: invitation.status,
      isInvalidated,
    });
    try {
      await copyText(text);
      toast.success("リンクをコピーしました");
    } catch {
      toast.error(`クリップボードへのコピーに失敗しました。URL: ${url}`);
    }
  };

  const handleInvalidate = () => {
    startTransition(async () => {
      const result = await invalidateInvitation(eventId, invitation.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("招待を無効化しました");
      }
    });
  };

  const handleProxyChange = (newStatus: "accepted" | "declined") => {
    startTransition(async () => {
      const result = await proxyChangeStatus(eventId, invitation.id, newStatus);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("出欠を変更しました");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteInvitation(eventId, invitation.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("招待を削除しました");
      }
    });
  };

  // メタテキスト構築
  const metaParts: string[] = [`招待: ${invitation.inviterDisplayName}`];
  if (invitation.status === "declined" && !isInvalidated) {
    metaParts.push("辞退");
  } else if (isInvalidated) {
    metaParts.push("無効化済み");
  }
  if (invitation.status === "accepted" && invitation.companionCount > 0) {
    metaParts.push(`同伴 +${invitation.companionCount}名`);
  }

  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b py-3.5",
        isInvalidated && "opacity-60",
      )}
    >
      <ParticipantAvatar
        displayName={guestDisplayName}
        variant={avatarVariant}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[15px] leading-snug",
            isInvalidated && "line-through",
          )}
        >
          {guestDisplayName}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {metaParts.join(" · ")}
        </div>
        {section === "accepted" && invitation.companionNames.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-auto p-0 text-[11px] text-muted-foreground hover:text-foreground"
              >
                同伴者を表示
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-1 flex flex-col gap-0.5 pl-3 text-[12px] text-muted-foreground">
                {invitation.companionNames.map((name, idx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 同伴者名は同名の可能性があるため name 単体では一意にならない
                  <li key={`${name}-${idx}`}>{name}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
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
            {showCopy && (
              <DropdownMenuItem onSelect={() => void handleCopyLink()}>
                <Copy className="size-4" aria-hidden />
                リンクをコピー
              </DropdownMenuItem>
            )}
            {showProxyToAccepted && (
              <DropdownMenuItem onSelect={() => setProxyToAcceptedOpen(true)}>
                <CheckCircle className="size-4" aria-hidden />
                出席に変更
              </DropdownMenuItem>
            )}
            {showProxyToDeclined && (
              <DropdownMenuItem onSelect={() => setProxyToDeclinedOpen(true)}>
                <XCircle className="size-4" aria-hidden />
                辞退に変更
              </DropdownMenuItem>
            )}
            {showInvalidate && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setInvalidateOpen(true)}
              >
                <XCircle className="size-4" aria-hidden />
                招待を無効化
              </DropdownMenuItem>
            )}
            {showDelete && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash className="size-4" aria-hidden />
                招待を削除
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {showInvalidate && (
        <AlertDialog open={invalidateOpen} onOpenChange={setInvalidateOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>招待を無効化しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                {invitation.status === "accepted"
                  ? "同伴者情報も削除され、座席が解放されます。"
                  : "ゲストはこのリンクで回答できなくなります。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleInvalidate()}
                disabled={isPending}
              >
                無効化する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showProxyToDeclined && (
        <AlertDialog
          open={proxyToDeclinedOpen}
          onOpenChange={setProxyToDeclinedOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>出欠を辞退に変更しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                同伴者情報も削除されます。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleProxyChange("declined")}
                disabled={isPending}
              >
                辞退に変更
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showProxyToAccepted && (
        <AlertDialog
          open={proxyToAcceptedOpen}
          onOpenChange={setProxyToAcceptedOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>出欠を出席に変更しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                空き枠を消費します。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleProxyChange("accepted")}
                disabled={isPending}
              >
                出席に変更
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showDelete && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>招待を削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDelete()}
                disabled={isPending}
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}
