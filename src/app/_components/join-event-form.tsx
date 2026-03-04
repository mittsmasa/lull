"use client";

import { useState, useTransition } from "react";
import { acceptPerformerInvitation } from "@/app/join/[token]/_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { sessionStorageKeys } from "@/lib/hooks/storage-keys";
import { useSessionStorage } from "@/lib/hooks/use-session-storage";

type JoinEventFormProps = {
  token: string;
  defaultDisplayName: string;
  isAuthenticated: boolean;
};

export function JoinEventForm({
  token,
  defaultDisplayName,
  isAuthenticated,
}: JoinEventFormProps) {
  const key = sessionStorageKeys.joinDisplayName(token);
  const [savedDisplayName, setSavedDisplayName] = useSessionStorage(
    key,
    defaultDisplayName,
  );

  const [displayName, setDisplayName] = useState(
    savedDisplayName ?? defaultDisplayName,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleJoinAuthenticated = () => {
    startTransition(async () => {
      const result = await acceptPerformerInvitation(token, displayName);
      if (result?.error) {
        setError(result.error);
      }
      // 成功時は redirect されるため、ここには到達しない
    });
  };

  const handleJoinWithGoogle = () => {
    // OAuth 前に表示名を sessionStorage に保存
    setSavedDisplayName(displayName);
    authClient.signIn.social({
      provider: "google",
      callbackURL: `/join/${token}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">表示名</Label>
        <Input
          type="text"
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          required
        />
        <p className="text-xs text-muted-foreground">
          プログラムに表示される名前です。あとで変更できます
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isAuthenticated ? (
        <Button
          onClick={handleJoinAuthenticated}
          disabled={isPending || !displayName.trim()}
          className="w-full tracking-wider"
        >
          {isPending ? "参加処理中..." : "参加する"}
        </Button>
      ) : (
        <Button
          onClick={handleJoinWithGoogle}
          disabled={!displayName.trim()}
          className="w-full tracking-wider"
        >
          Google アカウントで参加する
        </Button>
      )}
    </div>
  );
}
