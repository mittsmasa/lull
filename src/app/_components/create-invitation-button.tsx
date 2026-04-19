"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createGuestInvitation } from "@/app/(main)/events/[eventId]/invitations/_actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyTextFromPromise } from "@/lib/clipboard";
import { formatGuestInvitationCopy } from "@/lib/invitation-copy";
import { buildShareUrl } from "@/lib/share-url";

export function CreateInvitationButton({ eventId }: { eventId: string }) {
  const [isPending, setIsPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // iOS Safari のクリップボードは user gesture 直下で呼ばないと失敗するため、
  // form action は使わず、preventDefault() した onSubmit ハンドラ内で
  // copyTextFromPromise を呼び出して user gesture を維持する。
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const guestName = (formData.get("guestName") as string | null) || undefined;

    setIsPending(true);
    let successName: string | null | undefined;
    try {
      await copyTextFromPromise(async () => {
        const result = await createGuestInvitation(eventId, guestName);
        if ("error" in result) {
          throw new Error(result.error);
        }
        const url = buildShareUrl(`/i/${result.token}`);
        successName = guestName ?? null;
        return formatGuestInvitationCopy({
          url,
          guestName: guestName ?? null,
          status: "pending",
        });
      });
      toast.success(
        successName
          ? `${successName} さんの招待リンクをコピーしました`
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
        <CardTitle className="text-lg font-light tracking-wide">
          ゲスト招待リンクを発行
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="inviteGuestName">ゲスト名（任意）</Label>
            <Input
              type="text"
              id="inviteGuestName"
              name="guestName"
              maxLength={100}
              placeholder="ゲスト名を入力（空でもOK）"
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
