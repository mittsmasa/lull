"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createPerformerInvitation } from "@/app/(main)/events/[eventId]/members/_actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyTextFromPromise } from "@/lib/clipboard";
import { formatPerformerInvitationCopy } from "@/lib/invitation-copy";
import { buildShareUrl } from "@/lib/share-url";

export function InvitePerformerForm({ eventId }: { eventId: string }) {
  const [isPending, setIsPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // iOS Safari のクリップボードは user gesture 直下での呼び出しを要求するため、
  // onSubmit から直接 copyTextFromPromise を呼んで gesture を維持する。
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const displayName = (formData.get("displayName") as string | null) ?? "";

    setIsPending(true);
    try {
      await copyTextFromPromise(async () => {
        const result = await createPerformerInvitation(eventId, null, formData);
        if (!result || "error" in result) {
          throw new Error(result?.error ?? "招待リンクの発行に失敗しました");
        }
        const url = buildShareUrl(`/join/${result.token}`);
        return formatPerformerInvitationCopy({ url, displayName });
      });
      toast.success(
        displayName
          ? `${displayName} さんの招待リンクをコピーしました`
          : "招待リンクをコピーしました",
      );
      formRef.current?.reset();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "招待リンクの発行に失敗しました";
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-light tracking-wide text-lg">
          出演者を招待
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="inviteDisplayName">表示名</Label>
            <Input
              type="text"
              id="inviteDisplayName"
              name="displayName"
              required
              maxLength={50}
              placeholder="出演者の表示名を入力"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "発行中..." : "招待リンクを発行"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
