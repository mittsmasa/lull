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
  type SearchInvitationResult,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/**
 * 結果の表示先。
 * - popup: QR スキャン / 名前検索で選択したアイテム / 一覧からの選択など、
 *   ユーザーが特定のゲストを指定したケースは Dialog で表示する（切り替わりに
 *   気づけるようカメラ時と同じ体験に統一）。
 * - inline: ページ下部にそのまま出す。カメラ起動・検索時のエラーなど、
 *   特定ゲストに紐づかない状態の通知に使用する。
 */
type ResultSource = "popup" | "inline";

type ViewState =
  | { mode: "idle" }
  | { mode: "scanning" }
  | { mode: "loading"; source: ResultSource }
  | { mode: "error"; message: string; source: ResultSource }
  | {
      mode: "found";
      invitation: LookupInvitation;
      source: ResultSource;
    };

/** スキャン結果の URL からトークンを抽出 */
function extractToken(scannedValue: string): string | null {
  const match = scannedValue.match(/\/i\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/** タイムスタンプを JST の HH:mm 形式にフォーマット */
function formatTimestamp(ts: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(new Date(ts));
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
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);

  const handleScan = useCallback(
    async (decodedText: string) => {
      const token = extractToken(decodedText);
      if (!token) {
        setViewState({
          mode: "error",
          message: "QR コードからトークンを読み取れませんでした",
          source: "popup",
        });
        return;
      }

      setViewState({ mode: "loading", source: "popup" });

      const result = await lookupInvitationByToken(event.id, token);
      if ("error" in result) {
        setViewState({
          mode: "error",
          message: result.error,
          source: "popup",
        });
      } else {
        setViewState({
          mode: "found",
          invitation: result.invitation,
          source: "popup",
        });
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

      const currentSource: ResultSource =
        viewState.mode === "found" ? viewState.source : "inline";

      if ("error" in result) {
        setViewState({
          mode: "error",
          message: result.error,
          source: currentSource,
        });
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
        setViewState({
          mode: "found",
          invitation: updated,
          source: viewState.source,
        });
      }
    } catch {
      const currentSource: ResultSource =
        viewState.mode === "found" ? viewState.source : "inline";
      setViewState({
        mode: "error",
        message: "チェックイン処理中にエラーが発生しました",
        source: currentSource,
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

      const currentSource: ResultSource =
        viewState.mode === "found" ? viewState.source : "inline";

      if ("error" in result) {
        setViewState({
          mode: "error",
          message: result.error,
          source: currentSource,
        });
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
        setViewState({
          mode: "found",
          invitation: updated,
          source: viewState.source,
        });
      }
    } catch {
      const currentSource: ResultSource =
        viewState.mode === "found" ? viewState.source : "inline";
      setViewState({
        mode: "error",
        message: "取り消し処理中にエラーが発生しました",
        source: currentSource,
      });
    } finally {
      setProcessing(null);
    }
  };

  const startScanning = async () => {
    // 権限ダイアログ表示中の連打で getUserMedia が多重実行されるのを防ぐ
    if (isRequestingCamera) return;
    // PWA / iOS Safari で権限ダイアログを確実に出すため、
    // ユーザー操作のコールスタックから直接 getUserMedia を呼ぶ
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setViewState({
        mode: "error",
        message: "お使いのブラウザはカメラ機能に対応していません",
        source: "inline",
      });
      return;
    }
    setIsRequestingCamera(true);
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
        source: "inline",
      });
      return;
    } finally {
      setIsRequestingCamera(false);
    }
    setScanKey((k) => k + 1);
    setViewState({ mode: "scanning" });
  };

  const [searchResults, setSearchResults] = useState<
    SearchInvitationResult[] | null
  >(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const result = await searchInvitationByName(event.id, searchQuery);
    setSearching(false);
    if ("error" in result) {
      setViewState({
        mode: "error",
        message: result.error,
        source: "inline",
      });
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
      source: "popup",
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
        <Button
          onClick={startScanning}
          size="lg"
          className="w-full gap-2"
          disabled={isRequestingCamera}
        >
          <QrCode className="size-5" />
          {isRequestingCamera ? "カメラを起動中..." : "QR スキャン"}
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
                placeholder="ゲスト名・同伴者名を入力"
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
                {searchResults.map((inv) => {
                  const matchedCompanionNames = inv.companions
                    .filter((c) => inv.matchedCompanionIds.includes(c.id))
                    .map((c) => c.name);
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      className="flex w-full items-start gap-2 rounded-md px-3 py-3 hover:bg-muted/50 transition-colors border"
                      onClick={() =>
                        setViewState({
                          mode: "found",
                          invitation: {
                            id: inv.id,
                            guestName: inv.guestName,
                            guestEmail: inv.guestEmail,
                            checkedIn: inv.checkedIn,
                            checkedInAt: inv.checkedInAt,
                            companions: inv.companions,
                          },
                          source: "popup",
                        })
                      }
                    >
                      {inv.checkedIn ? (
                        <CheckCircle
                          className="size-4 shrink-0 mt-0.5 text-emerald-800/70"
                          weight="fill"
                        />
                      ) : (
                        <Circle className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                      )}
                      <div className="flex-1 text-left">
                        <div className="text-sm">
                          {inv.guestName ?? "名前未登録"}
                          {inv.companions.length > 0 && (
                            <span className="text-muted-foreground text-xs ml-2">
                              +{inv.companions.length}名
                            </span>
                          )}
                        </div>
                        {matchedCompanionNames.length > 0 && (
                          <div className="text-muted-foreground text-xs mt-0.5">
                            同伴者: {matchedCompanionNames.join("、")}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* サマリーカード：チェックイン済み / 出席予定 合計 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">来場者数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <Users className="text-muted-foreground size-5 self-center" />
            <span className="text-2xl font-light tabular-nums">
              {summary.checkedInGuests + summary.checkedInCompanions}
            </span>
            <span className="text-muted-foreground text-sm">/</span>
            <span className="text-muted-foreground tabular-nums">
              {summary.totalAccepted + summary.totalCompanions}
            </span>
            <span className="text-muted-foreground text-xs ml-1">
              名がチェックイン済み
            </span>
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

      {/* インライン（名前検索・一覧選択）からの結果表示 */}
      {(viewState.mode === "loading" ||
        viewState.mode === "error" ||
        viewState.mode === "found") &&
        viewState.source === "inline" && (
          <ResultPanel
            viewState={viewState}
            processing={processing}
            onCheckIn={handleCheckIn}
            onUndo={handleUndo}
            onRescan={startScanning}
          />
        )}

      {/* QR スキャン結果はポップアップで表示 */}
      <Dialog
        open={
          (viewState.mode === "loading" ||
            viewState.mode === "error" ||
            viewState.mode === "found") &&
          viewState.source === "popup"
        }
        onOpenChange={(open) => {
          if (!open) setViewState({ mode: "idle" });
        }}
      >
        <DialogContent className="max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewState.mode === "found"
                ? (viewState.invitation.guestName ?? "名前未登録")
                : viewState.mode === "error"
                  ? "QR スキャンエラー"
                  : "照会中"}
            </DialogTitle>
          </DialogHeader>
          {(viewState.mode === "loading" ||
            viewState.mode === "error" ||
            viewState.mode === "found") &&
            viewState.source === "popup" && (
              <ResultPanel
                viewState={viewState}
                processing={processing}
                onCheckIn={handleCheckIn}
                onUndo={handleUndo}
                onRescan={startScanning}
                variant="dialog"
              />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ResultPanelProps = {
  viewState:
    | { mode: "loading"; source: ResultSource }
    | { mode: "error"; message: string; source: ResultSource }
    | {
        mode: "found";
        invitation: LookupInvitation;
        source: ResultSource;
      };
  processing: string | null;
  onCheckIn: (
    invitationId: string,
    targetType: "guest" | "companion",
    targetId?: string,
  ) => void;
  onUndo: (
    invitationId: string,
    targetType: "guest" | "companion",
    targetId?: string,
  ) => void;
  onRescan: () => void;
  /** dialog の中か inline か。dialog ではカードの枠を省略する */
  variant?: "inline" | "dialog";
};

function ResultPanel({
  viewState,
  processing,
  onCheckIn,
  onUndo,
  onRescan,
  variant = "inline",
}: ResultPanelProps) {
  if (viewState.mode === "loading") {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Spinner className="size-8 animate-spin" />
        <p className="text-muted-foreground text-sm">照会中...</p>
      </div>
    );
  }

  if (viewState.mode === "error") {
    const body = (
      <div className="flex flex-col items-center gap-4 pt-6">
        <Warning className="text-destructive size-10" />
        <p className="text-destructive text-center text-sm">
          {viewState.message}
        </p>
        <Button variant="outline" onClick={onRescan}>
          再スキャン
        </Button>
      </div>
    );
    if (variant === "dialog") return body;
    return (
      <Card>
        <CardContent>{body}</CardContent>
      </Card>
    );
  }

  const inv = viewState.invitation;
  const body = (
    <div className="space-y-3">
      {/* ゲスト本人 */}
      <div className="flex min-h-14 items-center justify-between rounded-md border p-3">
        <div className="flex items-center gap-2">
          <User className="text-muted-foreground size-4" />
          <span className="text-sm font-medium">本人</span>
          {inv.checkedIn && inv.checkedInAt && (
            <span className="text-muted-foreground text-xs">
              {formatTimestamp(inv.checkedInAt)}
            </span>
          )}
        </div>
        {inv.checkedIn ? (
          <div className="flex items-center gap-2">
            <CheckCircle className="size-5 text-emerald-800/70" weight="fill" />
            <button
              type="button"
              className="text-muted-foreground text-xs underline"
              disabled={processing === "guest"}
              onClick={() => onUndo(inv.id, "guest")}
            >
              取り消し
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            disabled={processing === "guest"}
            onClick={() => onCheckIn(inv.id, "guest")}
          >
            チェックイン
          </Button>
        )}
      </div>

      {/* 同伴者 */}
      {inv.companions.map((companion) => (
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
                onClick={() => onUndo(inv.id, "companion", companion.id)}
              >
                取り消し
              </button>
            </div>
          ) : (
            <Button
              size="sm"
              disabled={processing === companion.id}
              onClick={() => onCheckIn(inv.id, "companion", companion.id)}
            >
              チェックイン
            </Button>
          )}
        </div>
      ))}

      {/* 次のゲストボタン */}
      <div className="flex justify-center pt-2">
        <Button variant="outline" onClick={onRescan} className="gap-2">
          <QrCode className="size-4" />
          次のゲスト
        </Button>
      </div>
    </div>
  );

  if (variant === "dialog") {
    return (
      <div>
        {inv.guestEmail && (
          <p className="text-muted-foreground text-sm mb-3">{inv.guestEmail}</p>
        )}
        {body}
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {inv.guestName ?? "名前未登録"}
        </CardTitle>
        {inv.guestEmail && (
          <p className="text-muted-foreground text-sm">{inv.guestEmail}</p>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
