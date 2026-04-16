import { redirect } from "next/navigation";
import { JoinEventForm } from "@/app/_components/join-event-form";
import { formatDatetime, formatTime } from "@/lib/format";
import { getEventMembership } from "@/lib/queries/events";
import { getPerformerInvitationByToken } from "@/lib/queries/members";
import { getSession } from "@/lib/session";

// ============================================================
// Shell
// ============================================================

function JoinShell({ children }: { children: React.ReactNode }) {
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
    <JoinShell>
      <div className="mt-16 flex flex-col items-center gap-4 text-center animate-in fade-in slide-in-from-bottom-1 duration-700 motion-reduce:animate-none">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Lull
        </p>
        <h1 className="font-serif text-2xl leading-tight">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>
    </JoinShell>
  );
}

// ============================================================
// Hero + EventInfo
// ============================================================

function PerformerInvitationHeader({
  event,
}: {
  event: {
    name: string;
    venue: string;
    startDatetime: string;
    openDatetime: string | null;
  };
}) {
  return (
    <header className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:animate-none">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Performer Invitation
        </p>
        <h1 className="font-serif text-3xl leading-[1.3] sm:text-4xl">
          {event.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          出演者として招待されています
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 border-t border-border/50 pt-6 animate-in fade-in slide-in-from-bottom-1 duration-500 delay-100 fill-mode-both motion-reduce:animate-none motion-reduce:delay-0">
        <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          日時
        </dt>
        <dd className="text-sm tabular-nums">
          {formatDatetime(event.startDatetime)}
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
        <dd className="text-sm">{event.venue}</dd>
      </dl>
    </header>
  );
}

// ============================================================
// Main
// ============================================================

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const invitation = await getPerformerInvitationByToken(token);

  // トークンが存在しない
  if (!invitation) {
    return (
      <ErrorView
        title="この招待リンクは無効です"
        message="リンクに問題がある場合は、招待者にお問い合わせください"
      />
    );
  }

  // 無効化済みトークン
  if (invitation.status === "invalidated") {
    return (
      <ErrorView
        title="この招待リンクは無効です"
        message="リンクに問題がある場合は、招待者にお問い合わせください"
      />
    );
  }

  // イベントが finished → 期限切れ
  if (invitation.event.status === "finished") {
    return (
      <ErrorView
        title="この招待リンクは期限切れです"
        message="イベントはすでに終了しています"
      />
    );
  }

  const session = await getSession();

  // 受諾済みトークンの処理
  if (invitation.status === "accepted") {
    if (session && session.user.id === invitation.acceptedByUserId) {
      // 受諾した本人 → イベント詳細へ
      redirect(`/events/${invitation.event.id}`);
    }
    // 別ユーザーまたは未認証 → エラー
    return (
      <ErrorView
        title="この招待リンクは既に使用済みです"
        message="心当たりがない場合は、招待者にお問い合わせください"
      />
    );
  }

  // --- ここから status === "pending" ---

  // 既にログイン済みの場合
  if (session) {
    // 既にこのイベントのメンバー？
    const membership = await getEventMembership(
      invitation.event.id,
      session.user.id,
    );
    if (membership) {
      redirect(`/events/${invitation.event.id}`);
    }
  }

  return (
    <JoinShell>
      <PerformerInvitationHeader event={invitation.event} />
      <div className="border-t border-border/50 pt-8 animate-in fade-in slide-in-from-bottom-1 duration-500 delay-200 fill-mode-both motion-reduce:animate-none motion-reduce:delay-0">
        <JoinEventForm
          token={token}
          defaultDisplayName={invitation.displayName}
          isAuthenticated={!!session}
        />
      </div>
    </JoinShell>
  );
}
