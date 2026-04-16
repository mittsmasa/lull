"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { acceptPerformerInvitation } from "@/app/join/[token]/_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const displayNameKey = sessionStorageKeys.joinDisplayName(token);
  const pendingKey = sessionStorageKeys.joinPending(token);

  const [savedDisplayName, setSavedDisplayName] = useSessionStorage(
    displayNameKey,
    defaultDisplayName,
  );
  const [pendingFlag, setPendingFlag, removePendingFlag] = useSessionStorage(
    pendingKey,
    "",
  );

  const [displayName, setDisplayName] = useState(
    savedDisplayName ?? defaultDisplayName,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoJoinTriggered = useRef(false);

  const submitJoin = (name: string) => {
    startTransition(async () => {
      const result = await acceptPerformerInvitation(token, name);
      if (result?.error) {
        setError(result.error);
      }
      // 成功時は redirect されるため、ここには到達しない
    });
  };

  // OAuth 戻り直後の自動参加
  // ref ガードで重複実行を防ぐため、deps が変動しても初回 1 度だけ submit される
  useEffect(() => {
    if (autoJoinTriggered.current) return;
    if (!isAuthenticated) return;
    if (pendingFlag !== "true") return;

    autoJoinTriggered.current = true;
    removePendingFlag();
    const name = (savedDisplayName ?? defaultDisplayName).trim();
    if (!name) return;

    startTransition(async () => {
      const result = await acceptPerformerInvitation(token, name);
      if (result?.error) {
        setError(result.error);
      }
    });
  }, [
    isAuthenticated,
    pendingFlag,
    savedDisplayName,
    defaultDisplayName,
    removePendingFlag,
    token,
  ]);

  const handleJoinAuthenticated = () => {
    submitJoin(displayName);
  };

  const handleJoinWithGoogle = () => {
    setSavedDisplayName(displayName);
    setPendingFlag("true");
    const target = `/join/${token}`;
    if (process.env.NEXT_PUBLIC_VERCEL_ENV === "preview") {
      authClient.signIn.oauth2({
        providerId: "google",
        callbackURL: target,
      });
      return;
    }
    authClient.signIn.social({
      provider: "google",
      callbackURL: target,
    });
  };

  const isAutoJoining =
    isAuthenticated && (pendingFlag === "true" || autoJoinTriggered.current);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="displayName"
          className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
        >
          Display Name
        </label>
        <Input
          type="text"
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          required
          disabled={isAutoJoining || isPending}
        />
        <p className="text-xs text-muted-foreground">
          プログラムに表示される名前です。あとで変更できます
        </p>
      </div>

      {error && (
        <p className="border-l-2 border-destructive pl-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {isAuthenticated ? (
        <Button
          onClick={handleJoinAuthenticated}
          disabled={isPending || isAutoJoining || !displayName.trim()}
          className="w-full tracking-[0.18em]"
        >
          {isPending || isAutoJoining ? "参加処理中..." : "参加する"}
        </Button>
      ) : (
        <Button
          onClick={handleJoinWithGoogle}
          disabled={!displayName.trim()}
          className="w-full tracking-[0.18em]"
        >
          Google アカウントで参加する
        </Button>
      )}
    </div>
  );
}
