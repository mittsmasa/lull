"use client";

import {
  CheckCircle,
  Circle,
  MagnifyingGlass,
  QrCode,
  Spinner,
  Warning,
  X,
} from "@phosphor-icons/react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  createOnsiteCheckoutSession,
  getInvitationPaymentStatus,
  type LookupInvitation,
  type LookupPayment,
  lookupInvitationByToken,
  performBulkCheckIn,
  performCheckIn,
  recordOnsitePayment,
  undoCheckIn,
} from "@/app/(main)/events/[eventId]/checkin/_actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EventStatus } from "@/db/schema";
import { statusLabels, statusVariants } from "@/lib/event-status";
import {
  calcBilling,
  formatYen,
  PAID_METHOD_LABELS,
  STRIPE_MIN_AMOUNT_JPY,
} from "@/lib/payment";
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
    attendanceFee: number;
    afterPartyEnabled: boolean;
    afterPartyFee: number;
  };
  summary: CheckInSummary;
  initialList: CheckInListItem[];
  /** Stripe 設定済みか。決済 QR を出せるかの判定に使う（server-only のため prop 経由） */
  stripeEnabled: boolean;
};

type ViewState =
  | { mode: "idle" }
  | { mode: "scanning" }
  | { mode: "loading" }
  | { mode: "error"; message: string }
  | { mode: "found"; invitation: LookupInvitation };

type RosterFilter = "pending" | "done";

function extractToken(scannedValue: string): string | null {
  const match = scannedValue.match(/\/i\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function formatTimestamp(ts: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(new Date(ts));
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}

export function CheckInView({
  event,
  summary: initialSummary,
  initialList,
  stripeEnabled,
}: CheckInViewProps) {
  const [viewState, setViewState] = useState<ViewState>({ mode: "idle" });
  const [summary, setSummary] = useState<CheckInSummary>(initialSummary);
  const [checkInList, setCheckInList] =
    useState<CheckInListItem[]>(initialList);
  const [scanKey, setScanKey] = useState(0);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("pending");
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);

  const updateListAfterCheckIn = useCallback(
    (
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
            return { ...item, checkedIn, checkedInAt: ts };
          }
          return {
            ...item,
            companions: item.companions.map((c) =>
              c.id === targetId ? { ...c, checkedIn, checkedInAt: ts } : c,
            ),
          };
        }),
      );
    },
    [],
  );

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
    try {
      const result = await performCheckIn(
        event.id,
        invitationId,
        targetType,
        targetId,
      );
      if ("error" in result) {
        setViewState({ mode: "error", message: result.error });
        vibrate([20, 50, 20]);
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
      vibrate(10);
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

  const handleBulkCheckIn = async (invitationId: string) => {
    setProcessing("bulk");
    try {
      const result = await performBulkCheckIn(event.id, invitationId);
      if ("error" in result) {
        setViewState({ mode: "error", message: result.error });
        vibrate([20, 50, 20]);
        return;
      }
      setSummary(result.summary);
      const ts = result.checkedInAt;
      if (result.guest.updated) {
        updateListAfterCheckIn(invitationId, "guest", undefined, true, ts);
      }
      for (const c of result.companions) {
        if (c.updated) {
          updateListAfterCheckIn(invitationId, "companion", c.id, true, ts);
        }
      }
      vibrate(10);
      if (viewState.mode === "found") {
        const updated = { ...viewState.invitation };
        updated.checkedIn = true;
        // 本人が既済だった場合は DB の既存時刻を保持（bulk の now で上書きしない）
        updated.checkedInAt = result.guest.updated ? ts : updated.checkedInAt;
        updated.companions = updated.companions.map((c) => ({
          ...c,
          checkedIn: true,
          checkedInAt: c.checkedIn ? c.checkedInAt : ts,
        }));
        setViewState({ mode: "found", invitation: updated });
      }
    } catch {
      setViewState({
        mode: "error",
        message: "一括チェックイン処理中にエラーが発生しました",
      });
    } finally {
      setProcessing(null);
    }
  };

  const startScanning = async () => {
    if (isRequestingCamera) return;
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
    setIsRequestingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
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
    } finally {
      setIsRequestingCamera(false);
    }
    setScanKey((k) => k + 1);
    setViewState({ mode: "scanning" });
  };

  const selectFromList = (item: CheckInListItem) => {
    // 一覧経由でも QR 経由（lookup）と同じ形に揃える。請求額は現在の設定・回答から算出
    const afterPartyCompanionCount = item.companions.filter(
      (c) => c.afterPartyAttending,
    ).length;
    const billing = calcBilling(
      {
        attendanceFee: event.attendanceFee,
        afterPartyEnabled: event.afterPartyEnabled,
        afterPartyFee: event.afterPartyFee,
      },
      {
        status: "accepted",
        companionCount: item.companions.length,
        afterPartyAttendance: item.afterPartyAttendance,
        afterPartyCompanionCount,
      },
    );
    setViewState({
      mode: "found",
      invitation: {
        id: item.id,
        guestName: item.guestName,
        guestEmail: null,
        inviterDisplayName: item.inviterDisplayName,
        checkedIn: item.checkedIn,
        checkedInAt: item.checkedInAt,
        afterPartyAttendance: item.afterPartyAttendance,
        afterPartyCount:
          item.afterPartyAttendance === "attending"
            ? 1 + afterPartyCompanionCount
            : 0,
        payment: {
          billing,
          paymentMethod: item.paymentMethod,
          paidAt: item.paidAt,
          paidMethod: item.paidMethod,
          paidAmount: item.paidAmount,
        },
        companions: item.companions,
      },
    });
  };

  // 名前フィルタ + ステータスフィルタ
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isDoneFilter = rosterFilter === "done";
    return checkInList
      .map((item) => {
        const guestNameMatched =
          q === "" || (item.guestName?.toLowerCase().includes(q) ?? false);
        const matchedCompanions = item.companions.filter(
          (c) => q === "" || c.name.toLowerCase().includes(q),
        );
        return { item, guestNameMatched, matchedCompanions };
      })
      .filter(
        ({ guestNameMatched, matchedCompanions }) =>
          guestNameMatched || matchedCompanions.length > 0,
      )
      .map(({ item, guestNameMatched, matchedCompanions }) => {
        // 表示する子行: クエリなし or guest 名マッチ → 同伴者全員、companion 名のみマッチ → マッチした子行のみ
        const displayCompanions =
          q === "" || guestNameMatched ? item.companions : matchedCompanions;
        return { item, guestNameMatched, displayCompanions };
      })
      .filter(({ item, displayCompanions }) => {
        // 未来場 / 来場済 切替（招待全体（本人 + 表示中の同伴者）の状態で判定）
        if (isDoneFilter) {
          return item.checkedIn || displayCompanions.some((c) => c.checkedIn);
        }
        return !item.checkedIn || displayCompanions.some((c) => !c.checkedIn);
      });
  }, [checkInList, searchQuery, rosterFilter]);

  const pendingCount = useMemo(
    () =>
      checkInList.reduce(
        (sum, i) =>
          sum +
          (i.checkedIn ? 0 : 1) +
          i.companions.filter((c) => !c.checkedIn).length,
        0,
      ),
    [checkInList],
  );
  const doneCount = useMemo(
    () =>
      checkInList.reduce(
        (sum, i) =>
          sum +
          (i.checkedIn ? 1 : 0) +
          i.companions.filter((c) => c.checkedIn).length,
        0,
      ),
    [checkInList],
  );

  const totalArrived = summary.checkedInGuests + summary.checkedInCompanions;
  const totalExpected = summary.totalAccepted + summary.totalCompanions;

  // ongoing 以外はメッセージのみ表示
  if (event.status !== "ongoing") {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <div>
          <h1 className="text-3xl font-light tracking-wide">チェックイン</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-muted-foreground">{event.name}</span>
            <Badge variant={statusVariants[event.status]}>
              {statusLabels[event.status]}
            </Badge>
          </div>
        </div>
        <Card className="mt-6">
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
    <div className="mx-auto max-w-md px-4 pb-32">
      {/* Sticky top: イベント名 + ステータス */}
      <div className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-14 z-10 -mx-4 mb-2 border-b px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
              Event
            </div>
            <div className="truncate text-base font-medium">{event.name}</div>
          </div>
          <Badge variant={statusVariants[event.status]} className="shrink-0">
            {statusLabels[event.status]}
          </Badge>
        </div>
      </div>

      {viewState.mode === "scanning" ? (
        <ScanningView
          scanKey={scanKey}
          onScan={handleScan}
          onCancel={() => setViewState({ mode: "idle" })}
        />
      ) : (
        <>
          <ArrivalsHero
            arrived={totalArrived}
            expected={totalExpected}
            checkedInGuests={summary.checkedInGuests}
            checkedInCompanions={summary.checkedInCompanions}
          />
          <RosterSection
            filteredList={filteredList}
            pendingCount={pendingCount}
            doneCount={doneCount}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            rosterFilter={rosterFilter}
            onFilterChange={setRosterFilter}
            onSelect={selectFromList}
          />
        </>
      )}

      {/* Sticky bottom CTA */}
      {viewState.mode !== "scanning" && (
        <div
          className="from-background/0 via-background/85 to-background/95 fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-b px-4 pt-3 backdrop-blur-md"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        >
          <Button
            onClick={startScanning}
            disabled={isRequestingCamera}
            className="h-14 w-full gap-2 text-base"
          >
            <QrCode className="size-5" />
            {isRequestingCamera ? "カメラを起動中..." : "QR スキャン"}
          </Button>
        </div>
      )}

      {/* Dialog: スキャン結果 / 一覧選択結果 / loading / error */}
      <Dialog
        open={
          viewState.mode === "loading" ||
          viewState.mode === "error" ||
          viewState.mode === "found"
        }
        onOpenChange={(open) => {
          if (!open) setViewState({ mode: "idle" });
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
          <DialogHeader>
            <div className="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
              {viewState.mode === "error" ? "Error" : "Guest"}
            </div>
            <DialogTitle className="text-2xl font-light tracking-tight">
              {viewState.mode === "found"
                ? (viewState.invitation.guestName ?? "名前未登録")
                : viewState.mode === "error"
                  ? "照会エラー"
                  : "照会中"}
            </DialogTitle>
          </DialogHeader>
          {viewState.mode === "loading" && (
            <div className="flex flex-col items-center gap-2 py-10">
              <Spinner className="size-8 animate-spin" />
              <p className="text-muted-foreground text-sm">照会中...</p>
            </div>
          )}
          {viewState.mode === "error" && (
            <div className="space-y-4 pt-2">
              <div className="border-destructive bg-destructive/5 flex items-start gap-3 rounded-md border-l-2 px-3 py-3">
                <Warning className="text-destructive mt-0.5 size-5 shrink-0" />
                <p className="text-destructive text-sm">{viewState.message}</p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={startScanning}>
                  再スキャン
                </Button>
              </div>
            </div>
          )}
          {viewState.mode === "found" && (
            <FoundPanel
              eventId={event.id}
              invitation={viewState.invitation}
              stripeEnabled={stripeEnabled}
              processing={processing}
              onCheckIn={handleCheckIn}
              onUndo={handleUndo}
              onBulk={handleBulkCheckIn}
              onClose={() => setViewState({ mode: "idle" })}
              onRescan={startScanning}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Sub: ArrivalsHero
// ============================================================

type ArrivalsHeroProps = {
  arrived: number;
  expected: number;
  checkedInGuests: number;
  checkedInCompanions: number;
};

function ArrivalsHero({
  arrived,
  expected,
  checkedInGuests,
  checkedInCompanions,
}: ArrivalsHeroProps) {
  const arrivedMv = useMotionValue(arrived);
  const arrivedDisplay = useTransform(arrivedMv, (v) => Math.round(v));
  const prevArrived = useRef(arrived);

  useEffect(() => {
    const controls = animate(arrivedMv, arrived, {
      duration: prevArrived.current === arrived ? 0 : 0.8,
      ease: "easeOut",
    });
    prevArrived.current = arrived;
    return () => controls.stop();
  }, [arrived, arrivedMv]);

  const ratio = expected === 0 ? 0 : Math.min(arrived / expected, 1);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const remaining = Math.max(expected - arrived, 0);

  return (
    <section className="px-1 pt-6 pb-8">
      <div className="text-muted-foreground mb-5 text-[10px] font-medium tracking-[0.28em] uppercase">
        Arrivals
      </div>
      <div className="flex items-end gap-5">
        <div className="relative size-24 shrink-0">
          <svg
            viewBox="0 0 100 100"
            className="size-full -rotate-90"
            role="img"
            aria-label={`チェックイン進捗 ${expected === 0 ? 0 : Math.round(ratio * 100)}%`}
          >
            <title>{`チェックイン進捗 ${expected === 0 ? 0 : Math.round(ratio * 100)}%`}</title>
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="6"
              className="stroke-border"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="stroke-emerald-700/70 transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-xs tabular-nums">
            {expected === 0 ? "—" : `${Math.round(ratio * 100)}%`}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <motion.span className="text-6xl font-light tabular-nums tracking-tight">
              {arrivedDisplay}
            </motion.span>
            <span className="text-muted-foreground/60 text-2xl font-thin">
              /
            </span>
            <span className="text-muted-foreground text-2xl font-light tabular-nums">
              {expected}
            </span>
          </div>
          <div className="text-muted-foreground mt-1 text-xs tabular-nums">
            本人 {checkedInGuests} · 同伴 {checkedInCompanions} · 残 {remaining}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Sub: RosterSection
// ============================================================

type RosterSectionProps = {
  filteredList: {
    item: CheckInListItem;
    guestNameMatched: boolean;
    displayCompanions: CheckInListItem["companions"];
  }[];
  pendingCount: number;
  doneCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  rosterFilter: RosterFilter;
  onFilterChange: (f: RosterFilter) => void;
  onSelect: (item: CheckInListItem) => void;
};

function RosterSection({
  filteredList,
  pendingCount,
  doneCount,
  searchQuery,
  onSearchChange,
  rosterFilter,
  onFilterChange,
  onSelect,
}: RosterSectionProps) {
  return (
    <section className="space-y-3 px-1">
      <div className="flex items-center justify-between gap-3">
        <div className="text-muted-foreground text-[10px] font-medium tracking-[0.28em] uppercase">
          Roster
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          value={rosterFilter}
          onValueChange={(v) => {
            if (v === "pending" || v === "done") onFilterChange(v);
          }}
        >
          <ToggleGroupItem value="pending" className="text-xs">
            未来場 {pendingCount}
          </ToggleGroupItem>
          <ToggleGroupItem value="done" className="text-xs">
            来場済 {doneCount}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="relative">
        <MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="名前で絞り込み"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <ul className="divide-border/60 divide-y border-y">
        {filteredList.length === 0 && (
          <li className="text-muted-foreground py-6 text-center text-sm">
            {searchQuery
              ? "該当するゲストが見つかりません"
              : rosterFilter === "pending"
                ? "未来場のゲストはいません"
                : "来場済のゲストはまだいません"}
          </li>
        )}
        {filteredList.map(({ item, displayCompanions }) => {
          const totalCompanions = item.companions.length;
          // 招待全体（本人 + 全同伴者）の状態で判定
          const allCheckedIn =
            item.checkedIn && item.companions.every((c) => c.checkedIn);
          const someCheckedIn =
            item.checkedIn || item.companions.some((c) => c.checkedIn);
          const partial = someCheckedIn && !allCheckedIn;
          // 全員済の場合に表示する最終 checkedInAt（本人 + 同伴者の最大値）
          const finalCheckedInAt = allCheckedIn
            ? Math.max(
                item.checkedInAt ?? 0,
                ...item.companions.map((c) => c.checkedInAt ?? 0),
              )
            : 0;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="hover:bg-muted/40 flex w-full items-center gap-3 px-1 py-3 text-left transition-colors"
              >
                {allCheckedIn ? (
                  <CheckCircle
                    className="size-4 shrink-0 text-emerald-700"
                    weight="fill"
                  />
                ) : partial ? (
                  <CheckCircle
                    className="size-4 shrink-0 text-emerald-700/60"
                    weight="duotone"
                  />
                ) : (
                  <Circle className="text-muted-foreground/60 size-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={`flex items-center gap-2 text-sm ${
                      allCheckedIn ? "text-muted-foreground" : ""
                    }`}
                  >
                    <span className="truncate">
                      {item.guestName ?? "名前未登録"}
                    </span>
                    {totalCompanions > 0 && (
                      <span className="text-muted-foreground border-border/60 shrink-0 rounded-full border px-1.5 text-[10px] tabular-nums">
                        +{totalCompanions}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 truncate text-xs">
                    {item.inviterDisplayName} の招待
                  </div>
                  {displayCompanions.length > 0 && searchQuery && (
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {displayCompanions.map((c) => c.name).join("、")}
                    </div>
                  )}
                </div>
                {allCheckedIn && finalCheckedInAt > 0 && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatTimestamp(finalCheckedInAt)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ============================================================
// Sub: ScanningView
// ============================================================

type ScanningViewProps = {
  scanKey: number;
  onScan: (decoded: string) => void;
  onCancel: () => void;
};

function ScanningView({ scanKey, onScan, onCancel }: ScanningViewProps) {
  return (
    <div className="space-y-5 pt-4">
      <div className="text-muted-foreground text-[10px] font-medium tracking-[0.28em] uppercase">
        Scanning
      </div>
      <QrScanner key={scanKey} onScan={onScan} />
      <p className="text-muted-foreground text-center text-xs tracking-wide">
        QR コードをフレーム内に収めてください
      </p>
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={onCancel}
          className="gap-2 rounded-full"
        >
          <X className="size-4" />
          キャンセル
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Sub: FoundPanel (Dialog 中身)
// ============================================================

type FoundPanelProps = {
  eventId: string;
  invitation: LookupInvitation;
  stripeEnabled: boolean;
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
  onBulk: (invitationId: string) => void;
  onClose: () => void;
  onRescan: () => void;
};

function FoundPanel({
  eventId,
  invitation: inv,
  stripeEnabled,
  processing,
  onCheckIn,
  onUndo,
  onBulk,
  onClose,
  onRescan,
}: FoundPanelProps) {
  const totalPeople = 1 + inv.companions.length;
  const remainingPending =
    (inv.checkedIn ? 0 : 1) + inv.companions.filter((c) => !c.checkedIn).length;
  const allDone = remainingPending === 0;
  const lastCheckedInAt = useMemo(() => {
    const times = [
      inv.checkedIn ? inv.checkedInAt : null,
      ...inv.companions.map((c) => (c.checkedIn ? c.checkedInAt : null)),
    ].filter((t): t is number => t !== null);
    return times.length > 0 ? Math.max(...times) : null;
  }, [inv]);

  return (
    <div className="space-y-4">
      <div className="text-muted-foreground -mt-2 space-y-0.5 text-xs">
        <p className="tabular-nums">
          {inv.guestEmail ? `${inv.guestEmail} · ` : ""}合計 {totalPeople} 名
        </p>
        <p>{inv.inviterDisplayName} の招待</p>
      </div>

      <div className="space-y-2">
        <PersonRow
          label="本人"
          name={inv.guestName ?? "名前未登録"}
          checkedIn={inv.checkedIn}
          checkedInAt={inv.checkedInAt}
          processing={processing === "guest" || processing === "bulk"}
          onCheckIn={() => onCheckIn(inv.id, "guest")}
          onUndo={() => onUndo(inv.id, "guest")}
        />
        {inv.companions.map((c) => (
          <PersonRow
            key={c.id}
            label="同伴"
            name={c.name}
            checkedIn={c.checkedIn}
            checkedInAt={c.checkedInAt}
            processing={processing === c.id || processing === "bulk"}
            onCheckIn={() => onCheckIn(inv.id, "companion", c.id)}
            onUndo={() => onUndo(inv.id, "companion", c.id)}
          />
        ))}
      </div>

      {remainingPending >= 2 && (
        <Button
          variant="outline"
          className="w-full rounded-full text-xs"
          disabled={processing !== null}
          onClick={() => onBulk(inv.id)}
        >
          残り {remainingPending} 名を一括チェックイン
        </Button>
      )}

      {allDone && lastCheckedInAt && (
        <div className="flex items-center justify-center gap-2 rounded-md bg-emerald-700/10 px-3 py-2.5 text-[10px] font-medium tracking-[0.18em] text-emerald-800 uppercase">
          <CheckCircle className="size-3.5" weight="fill" />
          All checked in · {formatTimestamp(lastCheckedInAt)}
        </div>
      )}

      <PaymentPanel
        eventId={eventId}
        invitationId={inv.id}
        guestName={inv.guestName}
        stripeEnabled={stripeEnabled}
        afterPartyAttendance={inv.afterPartyAttendance}
        afterPartyCount={inv.afterPartyCount}
        initialPayment={inv.payment}
      />

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button variant="outline" onClick={onClose}>
          閉じる
        </Button>
        <Button onClick={onRescan} className="gap-2">
          <QrCode className="size-4" />
          次のゲスト
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Sub: PaymentPanel（懇親会・会費の受領）
// ============================================================

/** 決済 QR 提示中の入金確認ポーリング。招待状ページ側と同じ間隔・回数 */
const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_MAX_COUNT = 20;

type QrState =
  | { mode: "idle" }
  | { mode: "creating" }
  /** QR 提示中。`exhausted` はポーリングを打ち切ったあと（QR 自体は有効） */
  | { mode: "shown"; url: string; exhausted: boolean }
  | { mode: "settled" }
  | { mode: "error"; message: string };

type PaymentPanelProps = {
  eventId: string;
  invitationId: string;
  guestName: string | null;
  stripeEnabled: boolean;
  afterPartyAttendance: "attending" | "declined" | null;
  afterPartyCount: number;
  initialPayment: LookupPayment;
};

function PaymentPanel({
  eventId,
  invitationId,
  guestName,
  stripeEnabled,
  afterPartyAttendance,
  afterPartyCount,
  initialPayment,
}: PaymentPanelProps) {
  const [payment, setPayment] = useState(initialPayment);
  const [qrState, setQrState] = useState<QrState>({ mode: "idle" });
  const [isPending, startTransition] = useTransition();

  const { billing } = payment;
  const paid = payment.paidAt !== null;
  // 受領ボタンの非活性は「全額受領済み」のときのみ。
  // 受領額 < 現請求額（差額あり）は警告表示のうえボタンを活性のまま残す
  const fullyPaid = paid && (payment.paidAmount ?? 0) >= billing.total;
  const shortfall = billing.total - (payment.paidAmount ?? 0);

  // オンライン決済で回収できる条件。満たさない場合のみ手動の受領記録を出す。
  // 一部入金済み（差額あり）は Checkout セッションを組めないため対象外にする
  const canUseCheckout =
    stripeEnabled && !paid && billing.total >= STRIPE_MIN_AMOUNT_JPY;
  const unavailableReason = !stripeEnabled
    ? "オンライン決済が設定されていません"
    : paid
      ? "一部入金済みのため、差額は決済 QR で回収できません"
      : `オンライン決済は合計 ${formatYen(STRIPE_MIN_AMOUNT_JPY)} 以上でご利用いただけます`;

  // QR 提示中は入金を定期確認する。webhook の到達を待たずに受付で完結させる。
  // 打ち切り後は「待っています」を出し続けず、確認できていないことを明示する
  const polling = qrState.mode === "shown" && !qrState.exhausted;
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let count = 0;

    const check = async () => {
      try {
        const result = await getInvitationPaymentStatus(eventId, invitationId);
        if (cancelled || "error" in result) return;
        setPayment(result.payment);
        if (result.payment.paidAt !== null) {
          setQrState({ mode: "settled" });
          vibrate(10);
          toast.success("お支払いを確認しました");
        }
      } catch (error) {
        // 一時的な通信断。次のポーリングで再確認するため画面は変えない
        console.error("Failed to check payment status:", error);
      }
    };

    const timer = setInterval(() => {
      count += 1;
      if (count >= PAYMENT_POLL_MAX_COUNT) {
        clearInterval(timer);
        setQrState((prev) =>
          prev.mode === "shown" ? { ...prev, exhausted: true } : prev,
        );
        return;
      }
      void check();
    }, PAYMENT_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [polling, eventId, invitationId]);

  // 請求も入金記録もなければ何も出さない（会費なしイベントでは UI 差分ゼロ）
  if (billing.total <= 0 && !paid) return null;

  const handleShowQr = () => {
    setQrState({ mode: "creating" });
    startTransition(async () => {
      try {
        const result = await createOnsiteCheckoutSession(eventId, invitationId);
        if ("paid" in result) {
          // 生成前に支払い済みが判明した（webhook 未達で画面が古かった等）
          setPayment(result.payment);
          setQrState({ mode: "settled" });
          return;
        }
        if ("error" in result) {
          setQrState({ mode: "error", message: result.error });
          return;
        }
        setQrState({ mode: "shown", url: result.url, exhausted: false });
      } catch (error) {
        // 通信失敗。"creating" のまま固まらせず、再試行できる状態に戻す
        console.error("Failed to create onsite checkout session:", error);
        setQrState({
          mode: "error",
          message:
            "決済 QR を準備できませんでした。通信状況を確認して再試行してください",
        });
      }
    });
  };

  const handleReceive = () => {
    startTransition(async () => {
      try {
        const result = await recordOnsitePayment(eventId, invitationId);
        if ("error" in result) {
          toast.error(result.error);
        } else {
          setPayment(result.payment);
          setQrState({ mode: "idle" });
          toast.success("受領を記録しました");
        }
      } catch (error) {
        // 記録できたか分からないまま無反応にしない
        console.error("Failed to record onsite payment:", error);
        toast.error("受領を記録できませんでした。再度お試しください");
      }
    });
  };

  // 決済 QR の提示中は支払いだけに集中させる（内訳や受領ボタンは畳む）
  if (qrState.mode === "shown" || qrState.mode === "settled") {
    return (
      <CheckoutQrPanel
        state={qrState}
        guestName={guestName}
        amount={billing.total}
        paidAmount={payment.paidAmount ?? 0}
        onRecheck={() =>
          setQrState((prev) =>
            prev.mode === "shown" ? { ...prev, exhausted: false } : prev,
          )
        }
        onBack={() => setQrState({ mode: "idle" })}
      />
    );
  }

  const breakdown = [
    billing.attendanceSubtotal > 0
      ? `参加費 ${formatYen(billing.attendanceSubtotal)}`
      : null,
    billing.afterPartySubtotal > 0
      ? `懇親会 ${formatYen(billing.afterPartySubtotal)}`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="text-muted-foreground text-[9px] font-medium tracking-[0.22em] uppercase">
        Payment
      </div>
      <dl className="space-y-1 text-sm">
        {afterPartyAttendance !== null && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">懇親会</dt>
            <dd>
              {afterPartyAttendance === "attending"
                ? `参加 ${afterPartyCount} 名`
                : "不参加"}
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">ご請求</dt>
          <dd className="tabular-nums">
            {formatYen(billing.total)}
            {breakdown.length > 1 && (
              <span className="text-muted-foreground text-xs">
                （{breakdown.join(" + ")}）
              </span>
            )}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">支払い</dt>
          <dd>
            {paid ? (
              <span className="text-emerald-700">
                ✓ {formatYen(payment.paidAmount ?? 0)} 受領済
                {payment.paidMethod &&
                  `（${PAID_METHOD_LABELS[payment.paidMethod]}）`}
              </span>
            ) : (
              "未払い"
            )}
          </dd>
        </div>
      </dl>

      {paid && shortfall > 0 && (
        <div className="flex items-start gap-2 rounded-md border-amber-500 border-l-2 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-500">
          <Warning className="mt-0.5 size-4 shrink-0" />
          <span>
            差額 {formatYen(shortfall)} あり（受領{" "}
            {formatYen(payment.paidAmount ?? 0)} / 現請求{" "}
            {formatYen(billing.total)}）
          </span>
        </div>
      )}

      {qrState.mode === "error" && (
        <div className="flex items-start gap-2 rounded-md border-destructive border-l-2 bg-destructive/5 px-3 py-2 text-destructive text-xs">
          <Warning className="mt-0.5 size-4 shrink-0" />
          <span>{qrState.message}</span>
        </div>
      )}

      {fullyPaid ? (
        <p className="text-muted-foreground text-xs">
          取消は招待管理画面の「入金済みを解除」から行えます
        </p>
      ) : canUseCheckout && qrState.mode !== "error" ? (
        <Button
          className="h-11 w-full gap-2"
          disabled={isPending}
          onClick={handleShowQr}
        >
          <QrCode className="size-4" />
          {qrState.mode === "creating"
            ? "決済 QR を準備中..."
            : "決済 QR を表示"}
        </Button>
      ) : (
        <div className="space-y-1.5">
          {qrState.mode === "error" ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleShowQr}
              >
                再試行
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleReceive}
              >
                電子決済で受領
              </Button>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {unavailableReason}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isPending}
                onClick={handleReceive}
              >
                電子決済で受領
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub: CheckoutQrPanel（決済 QR の提示と入金待ち）
// ============================================================

type CheckoutQrPanelProps = {
  state:
    | { mode: "shown"; url: string; exhausted: boolean }
    | { mode: "settled" };
  guestName: string | null;
  amount: number;
  paidAmount: number;
  onRecheck: () => void;
  onBack: () => void;
};

function CheckoutQrPanel({
  state,
  guestName,
  amount,
  paidAmount,
  onRecheck,
  onBack,
}: CheckoutQrPanelProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = state.mode === "shown" ? state.url : null;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 240, margin: 2 })
      .then((generated) => {
        if (!cancelled) setDataUrl(generated);
      })
      .catch((error) => {
        console.error("Failed to generate checkout QR code:", error);
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const settled = state.mode === "settled";

  return (
    <div className="space-y-4 border-t pt-3">
      <div className="text-muted-foreground text-[9px] font-medium tracking-[0.22em] uppercase">
        Payment
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          {guestName && (
            <p className="text-muted-foreground text-xs">{guestName} さま</p>
          )}
          <p className="text-4xl font-light tabular-nums tracking-tight">
            {formatYen(settled ? paidAmount : amount)}
          </p>
        </div>

        {settled ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex size-32 items-center justify-center rounded-lg bg-emerald-700/10"
          >
            <CheckCircle className="size-14 text-emerald-700" weight="fill" />
          </motion.div>
        ) : dataUrl ? (
          // biome-ignore lint/performance/noImgElement: data URL のため next/image 不要
          <img
            src={dataUrl}
            alt="お支払い用の QR コード"
            width={240}
            height={240}
            className="size-56 rounded-sm border bg-white p-2"
          />
        ) : (
          <div className="size-56 animate-pulse rounded-sm bg-muted/40" />
        )}

        {settled ? (
          <p className="text-sm text-emerald-700">お支払いを受領しました</p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              ゲストのスマートフォンで読み取っていただいてください
            </p>
            {state.mode === "shown" && state.exhausted ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-muted-foreground text-center text-xs">
                  お支払いをまだ確認できていません。QR
                  はそのままお使いいただけます
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={onRecheck}
                >
                  お支払いを再確認
                </Button>
              </div>
            ) : (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Spinner className="size-3.5 animate-spin" />
                お支払いを待っています
              </div>
            )}
          </div>
        )}
      </div>

      <Button variant="outline" className="w-full" onClick={onBack}>
        {settled ? "支払い状況に戻る" : "戻る"}
      </Button>
    </div>
  );
}

// ============================================================
// Sub: PersonRow
// ============================================================

type PersonRowProps = {
  label: "本人" | "同伴";
  name: string;
  checkedIn: boolean;
  checkedInAt: number | null;
  processing: boolean;
  onCheckIn: () => void;
  onUndo: () => void;
};

function PersonRow({
  label,
  name,
  checkedIn,
  checkedInAt,
  processing,
  onCheckIn,
  onUndo,
}: PersonRowProps) {
  // 直前の checkedIn 状態を覚えておき、false → true の遷移時のみ flash アニメ
  const prevCheckedIn = useRef(checkedIn);
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (!prevCheckedIn.current && checkedIn) {
      setFlashKey((k) => k + 1);
    }
    prevCheckedIn.current = checkedIn;
  }, [checkedIn]);

  return (
    <motion.div
      key={flashKey}
      initial={
        flashKey > 0 ? { backgroundColor: "rgba(16,185,129,0.16)" } : false
      }
      animate={{ backgroundColor: "rgba(16,185,129,0)" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="bg-card flex items-center gap-3 rounded-lg border p-3"
    >
      {checkedIn ? (
        <motion.div
          key={`check-${flashKey}`}
          initial={flashKey > 0 ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{
            duration: 0.42,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          <CheckCircle className="size-5 text-emerald-700" weight="fill" />
        </motion.div>
      ) : (
        <Circle className="text-muted-foreground/60 size-5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-[9px] font-medium tracking-[0.22em] uppercase">
          {label}
        </div>
        <div className="truncate text-sm font-medium">{name}</div>
      </div>
      {checkedIn ? (
        <div className="flex items-center gap-3">
          {checkedInAt && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatTimestamp(checkedInAt)}
            </span>
          )}
          <button
            type="button"
            className="text-muted-foreground text-xs underline underline-offset-2"
            disabled={processing}
            onClick={onUndo}
          >
            取り消し
          </button>
        </div>
      ) : (
        <Button size="sm" disabled={processing} onClick={onCheckIn}>
          チェックイン
        </Button>
      )}
    </motion.div>
  );
}
