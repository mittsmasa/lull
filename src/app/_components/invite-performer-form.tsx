"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPerformerInvitation } from "@/app/(main)/events/[eventId]/members/_actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InvitePerformerForm({ eventId }: { eventId: string }) {
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
    startTransition(async () => {
      const result = await createPerformerInvitation(eventId, null, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else if (result && "token" in result) {
        setError(null);
        const url = `${window.location.origin}/join/${result.token}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
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
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
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
