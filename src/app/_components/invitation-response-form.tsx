"use client";

import { useState, useTransition } from "react";
import { respondToInvitation } from "@/app/i/[token]/_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvitationStatus } from "@/db/schema";

// ============================================================
// 型定義
// ============================================================

type InvitationResponseFormProps = {
  token: string;
  invitation: {
    guestName: string | null;
    guestEmail: string | null;
    status: InvitationStatus;
    companions: { id: string; name: string }[];
  };
};

// ============================================================
// InvitationResponseForm
// ============================================================

type CompanionEntry = { key: string; name: string };

let companionKeyCounter = 0;
function nextCompanionKey() {
  return `companion-${++companionKeyCounter}`;
}

export function InvitationResponseForm({
  token,
  invitation,
}: InvitationResponseFormProps) {
  const isUpdate = invitation.status !== "pending";

  const [guestName, setGuestName] = useState(invitation.guestName ?? "");
  const [guestEmail, setGuestEmail] = useState(invitation.guestEmail ?? "");
  const [attendance, setAttendance] = useState<"accepted" | "declined">(
    isUpdate ? (invitation.status as "accepted" | "declined") : "accepted",
  );
  const [companions, setCompanions] = useState<CompanionEntry[]>(
    isUpdate
      ? invitation.companions.map((c) => ({
          key: nextCompanionKey(),
          name: c.name,
        }))
      : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  const handleAddCompanion = () => {
    if (companions.length >= 4) return;
    setCompanions([...companions, { key: nextCompanionKey(), name: "" }]);
  };

  const handleRemoveCompanion = (key: string) => {
    setCompanions(companions.filter((c) => c.key !== key));
  };

  const handleCompanionChange = (key: string, value: string) => {
    setCompanions(
      companions.map((c) => (c.key === key ? { ...c, name: value } : c)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccess(false);

    startTransition(async () => {
      const result = await respondToInvitation(token, {
        guestName,
        guestEmail,
        attendance,
        companions:
          attendance === "accepted"
            ? companions.map((c) => c.name).filter((n) => n.trim())
            : [],
      });

      if (result) {
        if (result.error) setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      } else {
        setSuccess(true);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h2 className="text-lg font-light tracking-wide">
        {isUpdate ? "回答を変更" : "出欠を回答"}
      </h2>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          回答を送信しました
        </div>
      )}

      {/* ゲスト名 */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="guestName">お名前</Label>
        <Input
          id="guestName"
          type="text"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          required
          maxLength={100}
          placeholder="お名前を入力"
        />
        {fieldErrors.guestName && (
          <p className="text-sm text-destructive">{fieldErrors.guestName}</p>
        )}
      </div>

      {/* メールアドレス */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="guestEmail">メールアドレス</Label>
        <Input
          id="guestEmail"
          type="email"
          value={guestEmail}
          onChange={(e) => setGuestEmail(e.target.value)}
          required
          placeholder="メールアドレスを入力"
        />
        {fieldErrors.guestEmail && (
          <p className="text-sm text-destructive">{fieldErrors.guestEmail}</p>
        )}
      </div>

      {/* 出欠選択 */}
      <div className="flex flex-col gap-2">
        <Label>出欠</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="attendance"
              value="accepted"
              checked={attendance === "accepted"}
              onChange={() => setAttendance("accepted")}
              className="accent-primary"
            />
            <span>出席</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="attendance"
              value="declined"
              checked={attendance === "declined"}
              onChange={() => setAttendance("declined")}
              className="accent-primary"
            />
            <span>辞退</span>
          </label>
        </div>
      </div>

      {/* 同伴者 */}
      {attendance === "accepted" && (
        <div className="flex flex-col gap-3">
          <Label>同伴者（最大4名）</Label>
          {companions.map((companion, index) => (
            <div key={companion.key} className="flex items-center gap-2">
              <Input
                type="text"
                value={companion.name}
                onChange={(e) =>
                  handleCompanionChange(companion.key, e.target.value)
                }
                maxLength={100}
                placeholder={`同伴者${index + 1}のお名前`}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleRemoveCompanion(companion.key)}
              >
                削除
              </Button>
            </div>
          ))}
          {companions.length < 4 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCompanion}
              className="self-start"
            >
              同伴者を追加
            </Button>
          )}
          {fieldErrors.companions && (
            <p className="text-sm text-destructive">{fieldErrors.companions}</p>
          )}
        </div>
      )}

      {/* 送信ボタン */}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "送信中..." : isUpdate ? "回答を変更" : "回答を送信"}
      </Button>
    </form>
  );
}
