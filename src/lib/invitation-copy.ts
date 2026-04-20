import type { InvitationStatus } from "@/db/schema";

const invitationStatusCopyLabels: Record<InvitationStatus, string> = {
  pending: "回答待ち",
  accepted: "出席",
  declined: "辞退",
};

type GuestInvitationCopyInput = {
  url: string;
  guestName: string | null;
  status: InvitationStatus;
  isInvalidated?: boolean;
};

/**
 * ゲスト招待リンクのコピー文面を組み立てる。
 * - ゲスト名があれば先頭に添える
 * - 現在の状態（回答待ち / 出席 / 辞退 / 無効）をラベルとして付与
 */
export function formatGuestInvitationCopy({
  url,
  guestName,
  status,
  isInvalidated,
}: GuestInvitationCopyInput): string {
  const title = guestName ? `${guestName} さんへの招待リンク` : "招待リンク";
  const stateLabel = isInvalidated
    ? "無効"
    : invitationStatusCopyLabels[status];
  return `${title}（${stateLabel}）\n${url}`;
}

type PerformerInvitationCopyInput = {
  url: string;
  displayName: string;
};

/** 出演者招待リンクのコピー文面 */
export function formatPerformerInvitationCopy({
  url,
  displayName,
}: PerformerInvitationCopyInput): string {
  return `${displayName} さんへの出演者招待リンク\n${url}`;
}
