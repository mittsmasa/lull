"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { createGuestInvitation } from "@/app/(main)/events/[eventId]/invitations/_actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildShareUrl } from "@/lib/share-url";

export function CreateInvitationButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    const guestName = formData.get("guestName") as string | undefined;
    startTransition(async () => {
      const result = await createGuestInvitation(
        eventId,
        guestName || undefined,
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const url = buildShareUrl(`/i/${result.token}`);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("招待リンクをコピーしました");
      } catch {
        toast.error(`クリップボードへのコピーに失敗しました。URL: ${url}`);
      }
      formRef.current?.reset();
    });
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
          action={handleSubmit}
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
