"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { createPerformerInvitation } from "@/app/(main)/events/[eventId]/members/_actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InvitePerformerForm({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createPerformerInvitation(eventId, null, formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      if (result && "token" in result) {
        const url = `${window.location.origin}/join/${result.token}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success("招待リンクをコピーしました");
        } catch {
          toast.error(`クリップボードへのコピーに失敗しました。URL: ${url}`);
        }
        formRef.current?.reset();
      }
    });
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
          action={handleSubmit}
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
