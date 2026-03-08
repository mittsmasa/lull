"use client";

import {
  CheckCircle,
  QrCode,
  Spinner,
  User,
  Users,
  Warning,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import {
  type LookupInvitation,
  lookupInvitationByToken,
  performCheckIn,
  undoCheckIn,
} from "@/app/(main)/events/[eventId]/checkin/_actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventStatus } from "@/db/schema";
import type { CheckInSummary } from "@/lib/queries/invitations";
import { QrScanner } from "./qr-scanner";

type CheckInViewProps = {
  event: {
    id: string;
    name: string;
    status: EventStatus;
    totalSeats: number;
  };
  summary: CheckInSummary;
};

type ViewState =
  | { mode: "idle" }
  | { mode: "scanning" }
  | { mode: "loading" }
  | { mode: "error"; message: string }
  | { mode: "found"; invitation: LookupInvitation };

/** スキャン結果の URL からトークンを抽出 */
function extractToken(scannedValue: string): string | null {
  const match = scannedValue.match(/\/i\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/** タイムスタンプを HH:mm 形式にフォーマット */
function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function CheckInView({
  event,
  summary: initialSummary,
}: CheckInViewProps) {
  const [viewState, setViewState] = useState<ViewState>({ mode: "idle" });
  const [summary, setSummary] = useState<CheckInSummary>(initialSummary);
  const [scanKey, setScanKey] = useState(0);
  const [processing, setProcessing] = useState<string | null>(null);

  const handleScan = useCallback(
    async (decodedText: string) => {
      const token = extractToken(decodedText);
      if (!token) {
        setViewState({
          mode: "error",
          message: "QR コードからトークンを読み取れませんでした",
        });
        return;
      }

      setViewState({ mode: "loading" });

      const result = await lookupInvitationByToken(event.id, token);
      if ("error" in result) {
        setViewState({ mode: "error", message: result.error });
      } else {
        setViewState({ mode: "found", invitation: result.invitation });
      }
    },
    [event.id],
  );

  const handleCheckIn = async (
    invitationId: string,
    targetType: "guest" | "companion",
    targetId?: string,
  ) => {
    const key = targetType === "guest" ? "guest" : (targetId ?? "");
    setProcessing(key);
    const result = await performCheckIn(
      event.id,
      invitationId,
      targetType,
      targetId,
    );
    setProcessing(null);

    if ("error" in result) {
      setViewState({ mode: "error", message: result.error });
      return;
    }

    setSummary(result.summary);

    // 確認パネル内の招待情報を更新
    if (viewState.mode === "found") {
      const now = Date.now();
      const updated = { ...viewState.invitation };
      if (targetType === "guest") {
        updated.checkedIn = true;
        updated.checkedInAt = now;
      } else {
        updated.companions = updated.companions.map((c) =>
          c.id === targetId ? { ...c, checkedIn: true, checkedInAt: now } : c,
        );
      }
      setViewState({ mode: "found", invitation: updated });
    }
  };

  const handleUndo = async (
    invitationId: string,
    targetType: "guest" | "companion",
    targetId?: string,
  ) => {
    const key = targetType === "guest" ? "guest" : (targetId ?? "");
    setProcessing(key);
    const result = await undoCheckIn(
      event.id,
      invitationId,
      targetType,
      targetId,
    );
    setProcessing(null);

    if ("error" in result) {
      setViewState({ mode: "error", message: result.error });
      return;
    }

    setSummary(result.summary);

    if (viewState.mode === "found") {
      const updated = { ...viewState.invitation };
      if (targetType === "guest") {
        updated.checkedIn = false;
        updated.checkedInAt = null;
      } else {
        updated.companions = updated.companions.map((c) =>
          c.id === targetId ? { ...c, checkedIn: false, checkedInAt: null } : c,
        );
      }
      setViewState({ mode: "found", invitation: updated });
    }
  };

  const startScanning = () => {
    setScanKey((k) => k + 1);
    setViewState({ mode: "scanning" });
  };

  // ongoing 以外はメッセージのみ表示
  if (event.status !== "ongoing") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              チェックインは開催中のイベントでのみ利用できます
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>

      {/* サマリーカード */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">来場者数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8">
            <div className="flex items-center gap-2">
              <User className="text-muted-foreground size-5" />
              <span className="text-sm">
                ゲスト: {summary.checkedInGuests}/{summary.totalAccepted}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground size-5" />
              <span className="text-sm">
                同伴者: {summary.checkedInCompanions}/{summary.totalCompanions}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* メインエリア */}
      {viewState.mode === "idle" && (
        <div className="flex justify-center">
          <Button onClick={startScanning} size="lg" className="gap-2">
            <QrCode className="size-5" />
            QR スキャン
          </Button>
        </div>
      )}

      {viewState.mode === "scanning" && (
        <div className="space-y-4">
          <QrScanner key={scanKey} onScan={handleScan} />
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setViewState({ mode: "idle" })}
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {viewState.mode === "loading" && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Spinner className="size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">照会中...</p>
        </div>
      )}

      {viewState.mode === "error" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <Warning className="text-destructive size-10" />
            <p className="text-destructive text-center text-sm">
              {viewState.message}
            </p>
            <Button variant="outline" onClick={startScanning}>
              再スキャン
            </Button>
          </CardContent>
        </Card>
      )}

      {viewState.mode === "found" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {viewState.invitation.guestName ?? "名前未登録"}
            </CardTitle>
            {viewState.invitation.guestEmail && (
              <p className="text-muted-foreground text-sm">
                {viewState.invitation.guestEmail}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {/* ゲスト本人 */}
            <div className="flex min-h-14 items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-2">
                <User className="text-muted-foreground size-4" />
                <span className="text-sm font-medium">本人</span>
                {viewState.invitation.checkedIn &&
                  viewState.invitation.checkedInAt && (
                    <span className="text-muted-foreground text-xs">
                      {formatTimestamp(viewState.invitation.checkedInAt)}
                    </span>
                  )}
              </div>
              {viewState.invitation.checkedIn ? (
                <div className="flex items-center gap-2">
                  <CheckCircle
                    className="size-5 text-emerald-800/70"
                    weight="fill"
                  />
                  <button
                    type="button"
                    className="text-muted-foreground text-xs underline"
                    disabled={processing === "guest"}
                    onClick={() => handleUndo(viewState.invitation.id, "guest")}
                  >
                    取り消し
                  </button>
                </div>
              ) : (
                <Button
                  size="sm"
                  disabled={processing === "guest"}
                  onClick={() =>
                    handleCheckIn(viewState.invitation.id, "guest")
                  }
                >
                  チェックイン
                </Button>
              )}
            </div>

            {/* 同伴者 */}
            {viewState.invitation.companions.map((companion) => (
              <div
                key={companion.id}
                className="flex min-h-14 items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-2">
                  <Users className="text-muted-foreground size-4" />
                  <span className="text-sm font-medium">{companion.name}</span>
                  {companion.checkedIn && companion.checkedInAt && (
                    <span className="text-muted-foreground text-xs">
                      {formatTimestamp(companion.checkedInAt)}
                    </span>
                  )}
                </div>
                {companion.checkedIn ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle
                      className="size-5 text-emerald-800/70"
                      weight="fill"
                    />
                    <button
                      type="button"
                      className="text-muted-foreground text-xs underline"
                      disabled={processing === companion.id}
                      onClick={() =>
                        handleUndo(
                          viewState.invitation.id,
                          "companion",
                          companion.id,
                        )
                      }
                    >
                      取り消し
                    </button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled={processing === companion.id}
                    onClick={() =>
                      handleCheckIn(
                        viewState.invitation.id,
                        "companion",
                        companion.id,
                      )
                    }
                  >
                    チェックイン
                  </Button>
                )}
              </div>
            ))}

            {/* 次のゲストボタン */}
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={startScanning}
                className="gap-2"
              >
                <QrCode className="size-4" />
                次のゲスト
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
