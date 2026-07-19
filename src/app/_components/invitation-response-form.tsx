"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { respondToInvitation } from "@/app/i/[token]/_actions";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AfterPartyAttendance,
  InvitationStatus,
  PaymentMethod,
} from "@/db/schema";
import { calcBilling, formatYen } from "@/lib/payment";

type InvitationResponseFormProps = {
  token: string;
  invitation: {
    guestName: string | null;
    guestEmail: string | null;
    status: InvitationStatus;
    afterPartyAttendance: AfterPartyAttendance | null;
    paymentMethod: PaymentMethod | null;
    companions: { id: string; name: string; afterPartyAttending: boolean }[];
  };
  event: {
    attendanceFee: number;
    afterPartyEnabled: boolean;
    afterPartyVenue: string | null;
    afterPartyStartTime: string | null;
    afterPartyFee: number;
  };
  stripeEnabled: boolean;
};

type CompanionEntry = {
  key: string;
  name: string;
  afterPartyAttending: boolean;
};

let companionKeyCounter = 0;
function nextCompanionKey() {
  return `companion-${++companionKeyCounter}`;
}

export function InvitationResponseForm({
  token,
  invitation,
  event,
  stripeEnabled,
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
          afterPartyAttending: c.afterPartyAttending,
        }))
      : [],
  );
  const [afterParty, setAfterParty] = useState<AfterPartyAttendance | null>(
    invitation.afterPartyAttendance,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    invitation.paymentMethod,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(!isUpdate);
  const [hasJustResponded, setHasJustResponded] = useState(false);

  // 請求額のライブ表示（サーバーと同じ算出ロジックを共有）
  const namedCompanions = companions.filter((c) => c.name.trim());
  const billing = calcBilling(
    {
      attendanceFee: event.attendanceFee,
      afterPartyEnabled: event.afterPartyEnabled,
      afterPartyFee: event.afterPartyFee,
    },
    {
      status: attendance,
      companionCount: namedCompanions.length,
      afterPartyAttendance: afterParty,
      afterPartyCompanionCount: namedCompanions.filter(
        (c) => c.afterPartyAttending,
      ).length,
    },
  );

  const handleAddCompanion = () => {
    if (companions.length >= 4) return;
    setCompanions([
      ...companions,
      { key: nextCompanionKey(), name: "", afterPartyAttending: false },
    ]);
  };

  const handleRemoveCompanion = (key: string) => {
    setCompanions(companions.filter((c) => c.key !== key));
  };

  const handleCompanionChange = (key: string, value: string) => {
    setCompanions(
      companions.map((c) => (c.key === key ? { ...c, name: value } : c)),
    );
  };

  const handleCompanionAfterPartyChange = (key: string, checked: boolean) => {
    setCompanions(
      companions.map((c) =>
        c.key === key ? { ...c, afterPartyAttending: checked } : c,
      ),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    startTransition(async () => {
      const result = await respondToInvitation(token, {
        guestName,
        guestEmail,
        attendance,
        companions:
          attendance === "accepted"
            ? companions
                .filter((c) => c.name.trim())
                .map((c) => ({
                  name: c.name,
                  afterPartyAttending:
                    afterParty === "attending" && c.afterPartyAttending,
                }))
            : [],
        afterPartyAttendance:
          attendance === "accepted" && event.afterPartyEnabled
            ? afterParty
            : null,
        paymentMethod: billing.total > 0 ? paymentMethod : null,
      });

      if (result) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        if (result.error) toast.error(result.error);
      } else {
        toast.success("回答を受け取りました");
        if (!isUpdate) setHasJustResponded(true);
        setIsOpen(false);
      }
    });
  };

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            RSVP
          </p>
          <h2 className="font-serif text-2xl leading-tight">
            回答は送信済みです
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="self-start rounded-sm px-1 py-1 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          回答を変更する
        </button>
        {hasJustResponded && <PwaInstallBanner dismissId="guest" />}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          RSVP
        </p>
        <h2 className="font-serif text-2xl leading-tight">
          {isUpdate ? "回答を変更する" : "出欠をお聞かせください"}
        </h2>
      </div>

      <fieldset
        disabled={isPending}
        className="flex flex-col gap-8 disabled:opacity-70"
      >
        {/* ゲスト名 */}
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="guestName"
            className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            お名前
          </Label>
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
            <p className="text-xs text-destructive">{fieldErrors.guestName}</p>
          )}
        </div>

        {/* メールアドレス */}
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="guestEmail"
            className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            メールアドレス
          </Label>
          <Input
            id="guestEmail"
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            required
            placeholder="name@example.com"
          />
          {fieldErrors.guestEmail && (
            <p className="text-xs text-destructive">{fieldErrors.guestEmail}</p>
          )}
        </div>

        {/* 出欠選択 */}
        <div className="flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            発表会の出欠
          </p>
          <div className="grid grid-cols-1 gap-3">
            <label className="block cursor-pointer rounded-sm border border-border/50 p-5 text-left transition-colors has-[input:checked]:border-foreground has-[input:checked]:bg-foreground/[0.03] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
              <input
                type="radio"
                name="attendance"
                value="accepted"
                checked={attendance === "accepted"}
                onChange={() => setAttendance("accepted")}
                className="sr-only"
              />
              <p className="font-serif text-lg">出席します</p>
              <p className="mt-1 text-xs text-muted-foreground">
                ご来場をお待ちしています
              </p>
            </label>
            <label className="block cursor-pointer rounded-sm border border-border/50 p-5 text-left transition-colors has-[input:checked]:border-foreground has-[input:checked]:bg-foreground/[0.03] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
              <input
                type="radio"
                name="attendance"
                value="declined"
                checked={attendance === "declined"}
                onChange={() => setAttendance("declined")}
                className="sr-only"
              />
              <p className="font-serif text-lg">辞退します</p>
              <p className="mt-1 text-xs text-muted-foreground">
                また次の機会にお会いできますように
              </p>
            </label>
          </div>
        </div>

        {/* 同伴者 */}
        {attendance === "accepted" && (
          <div className="flex flex-col gap-3 border-t border-border/50 pt-6">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              同伴者（最大 4 名）
            </p>
            {companions.map((companion, index) => (
              <div key={companion.key} className="flex items-center gap-2">
                <Input
                  type="text"
                  value={companion.name}
                  onChange={(e) =>
                    handleCompanionChange(companion.key, e.target.value)
                  }
                  maxLength={100}
                  placeholder={`同伴者 ${index + 1} のお名前`}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveCompanion(companion.key)}
                  className="shrink-0 rounded-sm px-2 py-1 text-xs text-muted-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  削除
                </button>
              </div>
            ))}
            {companions.length < 4 && (
              <button
                type="button"
                onClick={handleAddCompanion}
                className="self-start rounded-sm px-1 py-1 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                同伴者を追加
              </button>
            )}
            {fieldErrors.companions && (
              <p className="text-xs text-destructive">
                {fieldErrors.companions}
              </p>
            )}
          </div>
        )}

        {/* 懇親会 */}
        {attendance === "accepted" && event.afterPartyEnabled && (
          <div className="flex flex-col gap-3 border-t border-border/50 pt-6">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              After party
            </p>
            <div className="flex flex-col gap-1">
              <p className="font-serif text-lg">懇親会のご案内</p>
              <p className="text-xs text-muted-foreground">
                {[
                  event.afterPartyVenue,
                  event.afterPartyStartTime
                    ? `${event.afterPartyStartTime}〜`
                    : null,
                  event.afterPartyFee > 0
                    ? `会費 ${formatYen(event.afterPartyFee)}/人`
                    : "会費無料",
                ]
                  .filter(Boolean)
                  .join("　")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block cursor-pointer rounded-sm border border-border/50 p-4 text-center transition-colors has-[input:checked]:border-foreground has-[input:checked]:bg-foreground/[0.03] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                <input
                  type="radio"
                  name="afterParty"
                  value="attending"
                  required
                  checked={afterParty === "attending"}
                  onChange={() => setAfterParty("attending")}
                  className="sr-only"
                />
                <p className="font-serif">参加します</p>
              </label>
              <label className="block cursor-pointer rounded-sm border border-border/50 p-4 text-center transition-colors has-[input:checked]:border-foreground has-[input:checked]:bg-foreground/[0.03] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                <input
                  type="radio"
                  name="afterParty"
                  value="declined"
                  checked={afterParty === "declined"}
                  onChange={() => setAfterParty("declined")}
                  className="sr-only"
                />
                <p className="font-serif">参加しません</p>
              </label>
            </div>
            {afterParty === "attending" &&
              companions.some((c) => c.name.trim()) && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    同伴者の懇親会参加
                  </p>
                  {companions
                    .filter((c) => c.name.trim())
                    .map((c) => (
                      <div key={c.key} className="flex items-center gap-2">
                        <Checkbox
                          id={`companion-after-party-${c.key}`}
                          checked={c.afterPartyAttending}
                          onCheckedChange={(checked) =>
                            handleCompanionAfterPartyChange(
                              c.key,
                              checked === true,
                            )
                          }
                        />
                        <Label
                          htmlFor={`companion-after-party-${c.key}`}
                          className="cursor-pointer text-sm font-normal"
                        >
                          {c.name}
                        </Label>
                      </div>
                    ))}
                </div>
              )}
            {fieldErrors.afterPartyAttendance && (
              <p className="text-xs text-destructive">
                {fieldErrors.afterPartyAttendance}
              </p>
            )}
          </div>
        )}

        {/* お支払い */}
        {billing.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/50 pt-6">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Payment
            </p>
            <div className="flex flex-col gap-1 text-sm">
              {billing.attendanceSubtotal > 0 && (
                <p className="flex justify-between text-muted-foreground">
                  <span>
                    参加費 {formatYen(billing.attendanceFee)} ×{" "}
                    {billing.attendeeCount} 名
                  </span>
                  <span>{formatYen(billing.attendanceSubtotal)}</span>
                </p>
              )}
              {billing.afterPartySubtotal > 0 && (
                <p className="flex justify-between text-muted-foreground">
                  <span>
                    懇親会費 {formatYen(billing.afterPartyFee)} ×{" "}
                    {billing.afterPartyCount} 名
                  </span>
                  <span>{formatYen(billing.afterPartySubtotal)}</span>
                </p>
              )}
              <p className="flex justify-between border-t border-border/50 pt-1 font-medium">
                <span>合計</span>
                <span>{formatYen(billing.total)}</span>
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {stripeEnabled && (
                <label className="block cursor-pointer rounded-sm border border-border/50 p-4 text-left transition-colors has-[input:checked]:border-foreground has-[input:checked]:bg-foreground/[0.03] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="prepaid"
                    required
                    checked={paymentMethod === "prepaid"}
                    onChange={() => setPaymentMethod("prepaid")}
                    className="sr-only"
                  />
                  <p className="font-serif">事前支払い（オンライン決済）</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    回答後、このページからカードでお支払いいただけます
                  </p>
                </label>
              )}
              <label className="block cursor-pointer rounded-sm border border-border/50 p-4 text-left transition-colors has-[input:checked]:border-foreground has-[input:checked]:bg-foreground/[0.03] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="onsite"
                  required
                  checked={paymentMethod === "onsite"}
                  onChange={() => setPaymentMethod("onsite")}
                  className="sr-only"
                />
                <p className="font-serif">当日支払い</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  当日受付にて現金・電子決済でお支払いください
                </p>
              </label>
            </div>
            {fieldErrors.paymentMethod && (
              <p className="text-xs text-destructive">
                {fieldErrors.paymentMethod}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <Button
        type="submit"
        disabled={isPending}
        className="h-12 w-full bg-foreground text-background tracking-[0.15em] hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending
          ? "送信中..."
          : isUpdate
            ? "回答を変更する"
            : "回答を送信する"}
      </Button>
    </form>
  );
}
