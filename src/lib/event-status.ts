import type { EventStatus } from "@/db/schema";

/** ステータスの日本語ラベル */
export const statusLabels: Record<EventStatus, string> = {
  draft: "下書き",
  published: "公開中",
  ongoing: "開催中",
  finished: "終了",
};

/** ステータスに対応する Badge バリアント */
export const statusVariants: Record<
  EventStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  published: "default",
  ongoing: "secondary",
  finished: "outline",
};

/** ステータス遷移ボタンのラベル */
export const transitionLabels: Record<EventStatus, string> = {
  draft: "下書きに戻す",
  published: "公開する",
  ongoing: "開催を開始",
  finished: "終了する",
};
