"use client";

import { useEffect, useState, useTransition } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import type { EventStatus } from "@/db/schema";
import type { InvitationItem } from "@/lib/queries/invitations";

// ============================================================
// 定数
// ============================================================

const invitationStatusLabels: Record<string, string> = {
  pending: "回答待ち",
  accepted: "出席",
  declined: "辞退",
};

const invitationStatusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  accepted: "default",
  declined: "secondary",
};

// ============================================================
// InvitationList
// ============================================================

export function InvitationList({
  eventId,
  eventStatus,
  invitations,
  currentMemberId,
  isOrganizer,
}: {
  eventId: string;
  eventStatus: EventStatus;
  invitations: InvitationItem[];
  currentMemberId: string;
  isOrganizer: boolean;
}) {
  const mine = invitations.filter((i) => i.memberId === currentMemberId);
  const others = invitations.filter((i) => i.memberId !== currentMemberId);

  const renderRows = (items: InvitationItem[]) =>
    items.map((invitation) => (
      <InvitationRow
        key={invitation.id}
        eventId={eventId}
        eventStatus={eventStatus}
        invitation={invitation}
        currentMemberId={currentMemberId}
        isOrganizer={isOrganizer}
      />
    ));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-light tracking-wide">
          招待一覧
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {mine.length > 0 && (
            <>
              <p className="text-sm font-medium text-muted-foreground">
                自分の招待
              </p>
              {renderRows(mine)}
            </>
          )}
          {mine.length > 0 && others.length > 0 && (
            <Separator className="my-2" />
          )}
          {others.length > 0 && (
            <>
              <p className="text-sm font-medium text-muted-foreground">
                他のメンバーの招待
              </p>
              {renderRows(others)}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// InvitationRow
// ============================================================

function InvitationRow({
  eventId,
  eventStatus,
  invitation,
  currentMemberId,
  isOrganizer,
}: {
  eventId: string;
  eventStatus: EventStatus;
  invitation: InvitationItem;
  currentMemberId: string;
  isOrganizer: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const isInvalidated = !!invitation.invalidatedAt;
  const canInvalidate =
    !isInvalidated &&
    (eventStatus === "published" || eventStatus === "ongoing") &&
    (isOrganizer || invitation.memberId === currentMemberId);
  const canProxy =
    isOrganizer &&
    !isInvalidated &&
    invitation.status !== "pending" &&
    (eventStatus === "published" || eventStatus === "ongoing");
  const canCopyLink = !isInvalidated;

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/i/${invitation.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError(`クリップボードへのコピーに失敗しました。URL: ${url}`);
    }
  };

  const handleInvalidate = () => {
    startTransition(async () => {
      const result = await invalidateInvitation(eventId, invitation.id);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteInvitation(eventId, invitation.id);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  const handleProxyChange = (newStatus: "accepted" | "declined") => {
    startTransition(async () => {
      const result = await proxyChangeStatus(eventId, invitation.id, newStatus);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{invitation.guestName ?? "—"}</span>
            {isInvalidated ? (
              <Badge variant="destructive">無効化済み</Badge>
            ) : (
              <Badge variant={invitationStatusVariants[invitation.status]}>
                {invitationStatusLabels[invitation.status]}
              </Badge>
            )}
            {invitation.companionCount > 0 && (
              <span className="text-sm text-muted-foreground">
                +{invitation.companionCount}名
              </span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            招待者: {invitation.inviterDisplayName}
          </span>
        </div>
      </div>

      {invitation.companionNames.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
            >
              同伴者を表示（{invitation.companionNames.length}名）
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 flex flex-col gap-0.5 pl-4 text-sm text-muted-foreground">
              {invitation.companionNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canCopyLink && (
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            {copied ? "コピーしました" : "リンクをコピー"}
          </Button>
        )}

        {canInvalidate && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                無効化
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>招待リンクを無効化</AlertDialogTitle>
                <AlertDialogDescription>
                  この招待リンクを無効化しますか？無効化すると、ゲストはこのリンクで回答できなくなります。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleInvalidate}>
                  無効化する
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canProxy && invitation.status === "accepted" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                辞退に変更
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>出欠を辞退に変更</AlertDialogTitle>
                <AlertDialogDescription>
                  この招待の出欠を辞退に変更しますか？同伴者の情報も削除されます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleProxyChange("declined")}
                >
                  辞退に変更
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canProxy && invitation.status === "declined" && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleProxyChange("accepted")}
          >
            出席に変更
          </Button>
        )}

        {isInvalidated &&
          (isOrganizer || invitation.memberId === currentMemberId) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isPending}>
                  削除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>招待を削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    この招待を完全に削除しますか？この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
      </div>
    </div>
  );
}
