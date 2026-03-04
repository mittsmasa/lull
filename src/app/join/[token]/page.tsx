import { redirect } from "next/navigation";
import { JoinEventForm } from "@/app/_components/join-event-form";
import { formatDatetime } from "@/lib/format";
import { getEventMembership } from "@/lib/queries/events";
import { getPerformerInvitationByToken } from "@/lib/queries/members";
import { getSession } from "@/lib/session";

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const invitation = await getPerformerInvitationByToken(token);

  // トークンが存在しない
  if (!invitation) {
    return <ErrorView message="この招待リンクは無効です" />;
  }

  // 無効化済みトークン
  if (invitation.status === "invalidated") {
    return <ErrorView message="この招待リンクは無効です" />;
  }

  // イベントが finished → 期限切れ
  if (invitation.event.status === "finished") {
    return <ErrorView message="この招待リンクは期限切れです" />;
  }

  const session = await getSession();

  // 受諾済みトークンの処理
  if (invitation.status === "accepted") {
    if (session && session.user.id === invitation.acceptedByUserId) {
      // 受諾した本人 → イベント詳細へ
      redirect(`/events/${invitation.event.id}`);
    }
    // 別ユーザーまたは未認証 → エラー
    return <ErrorView message="この招待リンクは既に使用済みです" />;
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
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-serif text-3xl font-light tracking-wide">
            {invitation.event.name}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            出演者として招待されています
          </p>
        </div>

        <div className="rounded-sm border border-border/50 bg-card p-6 space-y-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
              開催日時
            </p>
            <p className="leading-relaxed">
              {formatDatetime(invitation.event.startDatetime)}
            </p>
          </div>
          {invitation.event.openDatetime && (
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
                開場
              </p>
              <p className="leading-relaxed">
                {formatDatetime(invitation.event.openDatetime)}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
              会場
            </p>
            <p className="leading-relaxed">{invitation.event.venue}</p>
          </div>
        </div>

        <JoinEventForm
          token={token}
          defaultDisplayName={invitation.displayName}
          isAuthenticated={!!session}
        />
      </div>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center space-y-4">
        <h1 className="font-serif text-2xl font-light tracking-wide">
          {message}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          リンクに問題がある場合は、招待者にお問い合わせください
        </p>
      </div>
    </div>
  );
}
