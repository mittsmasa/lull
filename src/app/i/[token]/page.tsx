import { InvitationResponseForm } from "@/app/_components/invitation-response-form";
import { QrCode } from "@/app/_components/qr-code";
import type { EventStatus } from "@/db/schema";
import { formatDatetime, formatTime } from "@/lib/format";
import { getInvitationByToken } from "@/lib/queries/invitations";

// ============================================================
// ローカルコンポーネント
// ============================================================

function ErrorView({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-light tracking-wide">招待リンクエラー</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

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
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="text-3xl font-light tracking-wide">{event.name}</h1>
      <div className="flex flex-col gap-1 text-muted-foreground">
        <p>{inviterName} さんからの招待</p>
        <p>{formatDatetime(event.startDatetime)}</p>
        <p>{event.venue}</p>
        {event.openDatetime && <p>開場: {formatTime(event.openDatetime)}</p>}
      </div>
    </div>
  );
}

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
    <div className="rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-light tracking-wide">現在の回答</h2>
      <div className="flex flex-col gap-2 text-sm">
        <p>
          <span className="text-muted-foreground">お名前: </span>
          {invitation.guestName}
        </p>
        <p>
          <span className="text-muted-foreground">メール: </span>
          {invitation.guestEmail}
        </p>
        <p>
          <span className="text-muted-foreground">出欠: </span>
          {invitation.status === "accepted" ? "出席" : "辞退"}
        </p>
        {invitation.companions.length > 0 && (
          <div>
            <span className="text-muted-foreground">同伴者: </span>
            {invitation.companions.map((c) => c.name).join("、")}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusMessage({
  isInvalidated,
  eventStatus,
}: {
  isInvalidated: boolean;
  eventStatus: EventStatus;
}) {
  let message: string;
  if (isInvalidated) {
    message = "この招待は主催者により変更が制限されています。";
  } else if (eventStatus === "ongoing") {
    message = "回答の変更期間は終了しました。";
  } else {
    message = "現在回答の変更はできません。";
  }

  return (
    <div className="mt-4 rounded-md bg-muted p-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ============================================================
// メインページ
// ============================================================

export default async function InvitationResponsePage(
  props: PageProps<"/i/[token]">,
) {
  const { token } = await props.params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return <ErrorView message="この招待リンクは無効です" />;
  }

  const { event } = invitation;
  const isInvalidated = !!invitation.invalidatedAt;

  if (event.status === "draft") {
    return <ErrorView message="現在準備中です" />;
  }

  if (event.status === "finished") {
    return <ErrorView message="この招待リンクは期限切れです" />;
  }

  // 無効化済み + pending/declined → 無効
  if (isInvalidated && invitation.status !== "accepted") {
    return <ErrorView message="この招待リンクは無効です" />;
  }

  // 回答変更が可能か判定
  const canModify =
    !isInvalidated &&
    event.status === "published" &&
    invitation.status !== "pending";

  // 初回回答が可能か判定
  const canRespond =
    !isInvalidated &&
    invitation.status === "pending" &&
    (event.status === "published" || event.status === "ongoing");

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <EventInfoHeader
        event={event}
        inviterName={invitation.inviterDisplayName}
      />

      {invitation.status === "accepted" && (
        <div className="mb-8">
          <QrCode path={`/i/${token}`} />
        </div>
      )}

      {invitation.status !== "pending" && (
        <CurrentResponseView invitation={invitation} />
      )}

      {(canRespond || canModify) && (
        <div className="mt-8">
          <InvitationResponseForm token={token} invitation={invitation} />
        </div>
      )}

      {!canRespond && !canModify && invitation.status !== "pending" && (
        <StatusMessage
          isInvalidated={isInvalidated}
          eventStatus={event.status}
        />
      )}
    </div>
  );
}
