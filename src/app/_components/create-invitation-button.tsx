"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createGuestInvitation } from "@/app/(main)/events/[eventId]/invitations/_actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateInvitationButton({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const handleSubmit = (formData: FormData) => {
    const guestName = formData.get("guestName") as string | undefined;
    startTransition(async () => {
      const result = await createGuestInvitation(
        eventId,
        guestName || undefined,
      );
      if ("error" in result) {
        setError(result.error);
      } else {
        setError(null);
        const url = `${window.location.origin}/i/${result.token}`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          setError(`クリップボードへのコピーに失敗しました。URL: ${url}`);
        }
        formRef.current?.reset();
      }
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
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
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
            {copied && (
              <span className="text-sm text-muted-foreground">
                リンクをコピーしました
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
