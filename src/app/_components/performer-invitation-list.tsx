"use client";

import { useCallback, useState, useTransition } from "react";
import {
  deletePerformerInvitation,
  invalidatePerformerInvitation,
} from "@/app/(main)/events/[eventId]/members/_actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { EventStatus, PerformerInvitationStatus } from "@/db/schema";
import type { PerformerInvitationItem } from "@/lib/queries/members";

const invitationStatusLabels: Record<PerformerInvitationStatus, string> = {
  pending: "未承認",
  accepted: "承認済み",
  invalidated: "無効",
};

const invitationStatusVariants: Record<
  PerformerInvitationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  accepted: "default",
  invalidated: "destructive",
};

export function PerformerInvitationList({
  eventId,
  eventStatus,
  invitations,
}: {
  eventId: string;
  eventStatus: EventStatus;
  invitations: PerformerInvitationItem[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canInvalidate =
    eventStatus === "draft" ||
    eventStatus === "published" ||
    eventStatus === "ongoing";

  const handleCopy = useCallback(
    async (invitationId: string, token: string) => {
      try {
        const url = `${window.location.origin}/join/${token}`;
        await navigator.clipboard.writeText(url);
        setCopiedId(invitationId);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        setError("クリップボードへのコピーに失敗しました");
      }
    },
    [],
  );

  const handleInvalidate = (invitationId: string) => {
    setPendingId(invitationId);
    startTransition(async () => {
      const result = await invalidatePerformerInvitation(eventId, invitationId);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(null);
      }
      setPendingId(null);
    });
  };

  const handleDelete = (invitationId: string) => {
    setPendingId(invitationId);
    startTransition(async () => {
      const result = await deletePerformerInvitation(eventId, invitationId);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(null);
      }
      setPendingId(null);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-light tracking-wide text-lg">
          出演者招待一覧
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {invitations.map((inv, index) => (
          <div key={inv.id}>
            {index > 0 && <Separator />}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="leading-relaxed">{inv.displayName}</span>
                <Badge variant={invitationStatusVariants[inv.status]}>
                  {invitationStatusLabels[inv.status]}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {inv.status === "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(inv.id, inv.token)}
                  >
                    {copiedId === inv.id ? "コピーしました" : "リンクをコピー"}
                  </Button>
                )}
                {canInvalidate && inv.status === "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleInvalidate(inv.id)}
                  >
                    {pendingId === inv.id ? "無効化中..." : "無効化"}
                  </Button>
                )}
                {inv.status === "invalidated" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleDelete(inv.id)}
                  >
                    {pendingId === inv.id ? "削除中..." : "削除"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
