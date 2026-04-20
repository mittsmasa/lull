import {
  CheckCircle,
  Circle,
  User,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { InvitationResponseForm } from "@/app/_components/invitation-response-form";
import { QrCode } from "@/app/_components/qr-code";
import type { EventStatus } from "@/db/schema";
import { formatDate, formatDatetime, formatTime } from "@/lib/format";
import { getInvitationByToken } from "@/lib/queries/invitations";

// ============================================================
// Shell
// ============================================================

function GuestShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-10 px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Error
// ============================================================

function ErrorView({ title, message }: { title: string; message: string }) {
  return (
    <GuestShell>
      <div className="mt-16 flex flex-col items-center gap-4 text-center animate-in fade-in slide-in-from-bottom-1 duration-700 motion-reduce:animate-none">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Lull
        </p>
        <h1 className="font-serif text-2xl leading-tight">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>
    </GuestShell>
  );
}

// ============================================================
// Hero
// ============================================================

function EventInfoHeader({
  event,
  inviterName,
}: {
  event: {
    name: string;
    venue: string;
    startDatetime: string;
    openDatetime: string | null;
  };
  inviterName: string;
}) {
  return (
    <header className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-700 motion-reduce:animate-none">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          You are invited
        </p>
        <h1 className="font-serif text-3xl leading-[1.3] sm:text-4xl">
          {event.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {inviterName} さんからの招待
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-4 border-t border-border/50 pt-6 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 motion-reduce:animate-none motion-reduce:delay-0">
        <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          開演
        </dt>
        <dd className="text-sm tabular-nums">
          {formatTime(event.startDatetime)}
        </dd>
        {event.openDatetime && (
          <>
            <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              開場
            </dt>
            <dd className="text-sm tabular-nums">
              {formatTime(event.openDatetime)}
            </dd>
          </>
        )}
        <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          会場
        </dt>
        <dd className="text-sm">
          <span className="tabular-nums">
            {formatDate(event.startDatetime)}
          </span>
          {" ／ "}
          {event.venue}
        </dd>
      </dl>
    </header>
  );
}

// ============================================================
// Helpers
// ============================================================

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </p>
  );
}

function formatCheckInTime(ts: number): string {
  // SSR 環境（UTC）でも JST で表示するため timeZone を明示する
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(new Date(ts));
}

// ============================================================
// Current Response
// ============================================================

function CurrentResponseView({
  invitation,
}: {
  invitation: {
    guestName: string | null;
    guestEmail: string | null;
    status: string;
    companions: { id: string; name: string }[];
  };
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border/50 pt-6">
      <SectionLabel>現在の回答</SectionLabel>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">
        <dt className="text-xs text-muted-foreground">お名前</dt>
        <dd className="text-sm">{invitation.guestName}</dd>
        <dt className="text-xs text-muted-foreground">メール</dt>
        <dd className="break-all text-sm">{invitation.guestEmail}</dd>
        <dt className="text-xs text-muted-foreground">出欠</dt>
        <dd className="text-sm">
          {invitation.status === "accepted" ? "出席" : "辞退"}
        </dd>
        {invitation.companions.length > 0 && (
          <>
            <dt className="text-xs text-muted-foreground">同伴者</dt>
            <dd className="text-sm">
              {invitation.companions.map((c) => c.name).join("、")}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

// ============================================================
// Check-in Status
// ============================================================

type CheckInRow = {
  key: string;
  name: string;
  role: "self" | "companion";
  checkedIn: boolean;
  checkedInAt: number | null;
};

function CheckInStatusView({
  invitation,
}: {
  invitation: {
    guestName: string | null;
    checkedIn: boolean;
    checkedInAt: number | null;
    companions: {
      id: string;
      name: string;
      checkedIn: boolean;
      checkedInAt: number | null;
    }[];
  };
}) {
  const rows: CheckInRow[] = [
    {
      key: "self",
      name: invitation.guestName ?? "本人",
      role: "self",
      checkedIn: invitation.checkedIn,
      checkedInAt: invitation.checkedInAt,
    },
    ...invitation.companions.map<CheckInRow>((c) => ({
      key: c.id,
      name: c.name,
      role: "companion",
      checkedIn: c.checkedIn,
      checkedInAt: c.checkedInAt,
    })),
  ];

  return (
    <section className="flex flex-col gap-4 border-t border-border/50 pt-6">
      <SectionLabel>受付状況</SectionLabel>
      <ul>
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center gap-3 border-b border-border/30 py-3 last:border-b-0"
          >
            <span className="text-muted-foreground">
              {row.role === "self" ? (
                <User className="size-4" />
              ) : (
                <UsersThree className="size-4" />
              )}
            </span>
            <span className="flex-1 text-sm">{row.name}</span>
            <span
              className={
                row.checkedIn ? "text-primary" : "text-muted-foreground/50"
              }
            >
              {row.checkedIn ? (
                <CheckCircle className="size-4" weight="fill" />
              ) : (
                <Circle className="size-4" />
              )}
            </span>
            <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
              {row.checkedIn && row.checkedInAt
                ? `${formatCheckInTime(row.checkedInAt)} 受付済み`
                : "未受付"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================
// Status Note
// ============================================================

function StatusNote({
  isInvalidated,
  eventStatus,
}: {
  isInvalidated: boolean;
  eventStatus: EventStatus;
}) {
  let message: string;
  if (isInvalidated) {
    message = "この招待は主催者により変更が制限されています";
  } else if (eventStatus === "ongoing") {
    message = "回答の変更期間は終了しました";
  } else {
    message = "現在、回答の変更はできません";
  }

  return (
    <p className="border-t border-border/50 pt-6 text-xs tracking-wide text-muted-foreground">
      {message}
    </p>
  );
}

// ============================================================
// Main
// ============================================================

export default async function InvitationResponsePage(
  props: PageProps<"/i/[token]">,
) {
  const { token } = await props.params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <ErrorView
        title="招待リンクが見つかりません"
        message="リンクに問題がある場合は、招待者にお問い合わせください"
      />
    );
  }

  const { event } = invitation;
  const isInvalidated = !!invitation.invalidatedAt;

  if (event.status === "draft") {
    return (
      <ErrorView
        title="現在準備中です"
        message="イベント公開までしばらくお待ちください"
      />
    );
  }

  // finished + accepted → 思い出カード
  if (event.status === "finished") {
    if (invitation.status === "accepted") {
      return (
        <GuestShell>
          <EventInfoHeader
            event={event}
            inviterName={invitation.inviterDisplayName}
          />
          <CurrentResponseView invitation={invitation} />
          <CheckInStatusView invitation={invitation} />
          <p className="border-t border-border/50 pt-6 text-xs tracking-wide text-muted-foreground">
            このイベントは終了しました。お越しいただきありがとうございました
          </p>
        </GuestShell>
      );
    }
    return (
      <ErrorView
        title="招待リンクの期限が切れました"
        message="イベントはすでに終了しています"
      />
    );
  }

  // 無効化済み + pending/declined → 無効
  if (isInvalidated && invitation.status !== "accepted") {
    return (
      <ErrorView
        title="招待リンクは無効です"
        message="リンクに問題がある場合は、招待者にお問い合わせください"
      />
    );
  }

  const canModify =
    !isInvalidated &&
    event.status === "published" &&
    invitation.status !== "pending";

  const canRespond =
    !isInvalidated &&
    invitation.status === "pending" &&
    (event.status === "published" || event.status === "ongoing");

  const showCheckInStatus =
    invitation.status === "accepted" && event.status === "ongoing";

  const showPass =
    invitation.status === "accepted" &&
    (event.status === "published" || event.status === "ongoing");

  const passCaption =
    event.status === "ongoing"
      ? "スタッフにこのコードをお見せください"
      : "当日、受付でお見せください";

  return (
    <GuestShell>
      <EventInfoHeader
        event={event}
        inviterName={invitation.inviterDisplayName}
      />

      {showPass && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300 motion-reduce:animate-none motion-reduce:delay-0">
          <QrCode
            path={`/i/${token}`}
            eventName={event.name}
            eventDatetime={formatDatetime(event.startDatetime)}
            caption={passCaption}
          />
        </div>
      )}

      {showCheckInStatus && <CheckInStatusView invitation={invitation} />}

      {invitation.status !== "pending" && (
        <CurrentResponseView invitation={invitation} />
      )}

      {(canRespond || canModify) && (
        <div className="border-t border-border/50 pt-8">
          <InvitationResponseForm token={token} invitation={invitation} />
        </div>
      )}

      {!canRespond && !canModify && invitation.status !== "pending" && (
        <StatusNote isInvalidated={isInvalidated} eventStatus={event.status} />
      )}
    </GuestShell>
  );
}
