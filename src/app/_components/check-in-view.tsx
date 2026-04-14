"use client";

import {
  CaretDown,
  CaretUp,
  CheckCircle,
  Circle,
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
  searchInvitationByName,
  undoCheckIn,
} from "@/app/(main)/events/[eventId]/checkin/_actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { EventStatus } from "@/db/schema";
import { statusLabels, statusVariants } from "@/lib/event-status";
import type {
  CheckInListItem,
  CheckInSummary,
} from "@/lib/queries/invitations";
import { QrScanner } from "./qr-scanner";

type CheckInViewProps = {
  event: {
    id: string;
    name: string;
    status: EventStatus;
    totalSeats: number;
  };
  summary: CheckInSummary;
  initialList: CheckInListItem[];
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
  initialList,
}: CheckInViewProps) {
  const [viewState, setViewState] = useState<ViewState>({ mode: "idle" });
  const [summary, setSummary] = useState<CheckInSummary>(initialSummary);
  const [checkInList, setCheckInList] =
    useState<CheckInListItem[]>(initialList);
  const [scanKey, setScanKey] = useState(0);
  const [processing, setProcessing] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

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

  /** チェックイン後にローカルリストを更新 */
  const updateListAfterCheckIn = (
    invitationId: string,
    targetType: "guest" | "companion",
    targetId: string | undefined,
    checkedIn: boolean,
    checkedInAt?: number | null,
  ) => {
    const ts = checkedIn ? (checkedInAt ?? null) : null;
    setCheckInList((prev) =>
      prev.map((item) => {
        if (item.id !== invitationId) return item;
        if (targetType === "guest") {
          return {
            ...item,
            checkedIn,
            checkedInAt: ts,
          };
        }
        return {
          ...item,
          companions: item.companions.map((c) =>
            c.id === targetId ? { ...c, checkedIn, checkedInAt: ts } : c,
          ),
        };
      }),
    );
  };

  const handleCheckIn = async (
    invitationId: string,
    targetType: "guest" | "companion",
    targetId?: string,
  ) => {
    const key = targetType === "guest" ? "guest" : (targetId ?? "");
    setProcessing(key);
    try {
      const result = await performCheckIn(
        event.id,
        invitationId,
        targetType,
        targetId,
      );

      if ("error" in result) {
        setViewState({ mode: "error", message: result.error });
        return;
      }

      const serverTime = result.checkedInAt;
      setSummary(result.summary);
      updateListAfterCheckIn(
        invitationId,
        targetType,
        targetId,
        true,
        serverTime,
      );

      // 確認パネル内の招待情報を更新
      if (viewState.mode === "found") {
        const updated = { ...viewState.invitation };
        if (targetType === "guest") {
          updated.checkedIn = true;
          updated.checkedInAt = serverTime;
        } else {
          updated.companions = updated.companions.map((c) =>
            c.id === targetId
              ? { ...c, checkedIn: true, checkedInAt: serverTime }
              : c,
          );
        }
        setViewState({ mode: "found", invitation: updated });
      }
    } catch {
      setViewState({
        mode: "error",
        message: "チェックイン処理中にエラーが発生しました",
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleUndo = async (
    invitationId: string,
    targetType: "guest" | "companion",
    targetId?: string,
  ) => {
    const key = targetType === "guest" ? "guest" : (targetId ?? "");
    setProcessing(key);
    try {
      const result = await undoCheckIn(
        event.id,
        invitationId,
        targetType,
        targetId,
      );

      if ("error" in result) {
        setViewState({ mode: "error", message: result.error });
        return;
      }

      setSummary(result.summary);
      updateListAfterCheckIn(invitationId, targetType, targetId, false);

      if (viewState.mode === "found") {
        const updated = { ...viewState.invitation };
        if (targetType === "guest") {
          updated.checkedIn = false;
          updated.checkedInAt = null;
        } else {
          updated.companions = updated.companions.map((c) =>
            c.id === targetId
              ? { ...c, checkedIn: false, checkedInAt: null }
              : c,
          );
        }
        setViewState({ mode: "found", invitation: updated });
      }
    } catch {
      setViewState({
        mode: "error",
        message: "取り消し処理中にエラーが発生しました",
      });
    } finally {
      setProcessing(null);
    }
  };

  const startScanning = async () => {
    // PWA / iOS Safari で権限ダイアログを確実に出すため、
    // ユーザー操作のコールスタックから直接 getUserMedia を呼ぶ
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setViewState({
        mode: "error",
        message: "お使いのブラウザはカメラ機能に対応していません",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      // html5-qrcode 側で再度 getUserMedia が呼ばれるので、ここでは停止
      for (const track of stream.getTracks()) {
        track.stop();
      }
    } catch (err: unknown) {
      const isDenied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError");
      setViewState({
        mode: "error",
        message: isDenied
          ? "カメラへのアクセスが許可されていません。ブラウザまたは端末の設定からカメラを許可してください。"
          : err instanceof Error
            ? err.message
            : "カメラの起動に失敗しました",
      });
      return;
    }
    setScanKey((k) => k + 1);
    setViewState({ mode: "scanning" });
  };

  const [searchResults, setSearchResults] = useState<LookupInvitation[] | null>(
    null,
  );

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const result = await searchInvitationByName(event.id, searchQuery);
    setSearching(false);
    if ("error" in result) {
      setViewState({ mode: "error", message: result.error });
    } else {
      setSearchResults(result.invitations);
    }
  };

  /** リスト行タップで found モードに遷移 */
  const selectFromList = (item: CheckInListItem) => {
    setViewState({
      mode: "found",
      invitation: {
        id: item.id,
        guestName: item.guestName,
        guestEmail: null,
        checkedIn: item.checkedIn,
        checkedInAt: item.checkedInAt,
        companions: item.companions,
      },
    });
  };

  // ongoing 以外はメッセージのみ表示
  if (event.status !== "ongoing") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-light tracking-wide">チェックイン</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-muted-foreground">{event.name}</span>
            <Badge variant={statusVariants[event.status]}>
              {statusLabels[event.status]}
            </Badge>
          </div>
        </div>
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
      <div>
        <h1 className="text-3xl font-light tracking-wide">チェックイン</h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-muted-foreground">{event.name}</span>
          <Badge variant={statusVariants[event.status]}>
            {statusLabels[event.status]}
          </Badge>
        </div>
      </div>

      {/* QR スキャンボタン（上部に常設） */}
      {viewState.mode !== "scanning" ? (
        <Button onClick={startScanning} size="lg" className="w-full gap-2">
          <QrCode className="size-5" />
          QR スキャン
        </Button>
      ) : (
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

      {/* 名前検索フォーム（常設） */}
      {viewState.mode !== "scanning" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">名前で検索</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="ゲスト名を入力"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) setSearchResults(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />
              <Button
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                className="shrink-0"
              >
                {searching ? (
                  <Spinner className="size-4 animate-spin" />
                ) : (
                  "検索"
                )}
              </Button>
            </div>

            {searchResults !== null && searchResults.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-2">
                該当するゲストが見つかりません
              </p>
            )}

            {searchResults && searchResults.length > 0 && (
              <div className="space-y-1">
                {searchResults.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-3 hover:bg-muted/50 transition-colors border"
                    onClick={() =>
                      setViewState({ mode: "found", invitation: inv })
                    }
                  >
                    {inv.checkedIn ? (
                      <CheckCircle
                        className="size-4 shrink-0 text-emerald-800/70"
                        weight="fill"
                      />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-sm flex-1 text-left">
                      {inv.guestName ?? "名前未登録"}
                    </span>
                    {inv.companions.length > 0 && (
                      <span className="text-muted-foreground text-xs">
                        +{inv.companions.length}名
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* 来場者一覧（Collapsible） */}
      <Collapsible open={listOpen} onOpenChange={setListOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between px-6 py-4"
            >
              <span className="text-base font-semibold">来場者一覧</span>
              {listOpen ? (
                <CaretUp className="size-5 text-muted-foreground" />
              ) : (
                <CaretDown className="size-5 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-1 pt-0">
              {checkInList.length === 0 && (
                <p className="text-muted-foreground text-sm py-2">
                  出席予定のゲストがいません
                </p>
              )}
              {checkInList.map((item) => (
                <div key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                    onClick={() => selectFromList(item)}
                  >
                    {item.checkedIn ? (
                      <CheckCircle
                        className="size-4 shrink-0 text-emerald-800/70"
                        weight="fill"
                      />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-sm flex-1 text-left">
                      {item.guestName ?? "名前未登録"}
                    </span>
                    {item.checkedIn && item.checkedInAt && (
                      <span className="text-muted-foreground text-xs">
                        {formatTimestamp(item.checkedInAt)}
                      </span>
                    )}
                  </button>
                  {item.companions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md pl-6 pr-2 py-2 hover:bg-muted/50 transition-colors"
                      onClick={() => selectFromList(item)}
                    >
                      {c.checkedIn ? (
                        <CheckCircle
                          className="size-4 shrink-0 text-emerald-800/70"
                          weight="fill"
                        />
                      ) : (
                        <Circle className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-sm flex-1 text-left">{c.name}</span>
                      {c.checkedIn && c.checkedInAt && (
                        <span className="text-muted-foreground text-xs">
                          {formatTimestamp(c.checkedInAt)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
