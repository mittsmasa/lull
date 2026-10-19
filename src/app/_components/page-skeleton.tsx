import { SkeletonBlock, SkeletonRule } from "@/app/_components/skeleton";

// 行ごとに幅を散らして文章の塊らしく見せる。キーにも使うので重複させない
const ROW_WIDTHS = [
  "w-full",
  "w-5/6",
  "w-2/3",
  "w-11/12",
  "w-3/4",
  "w-4/5",
] as const;

const STAT_TILES = ["seats", "responses", "payments"] as const;

/**
 * `(main)` 配下のページ共通の fallback。
 * 見出し・メタ情報・本文の行数を実際のレイアウトに寄せて確保し、
 * 差し込み時のレイアウトシフトを抑える。
 */
export function PageSkeleton({
  stats = false,
  rows = 4,
}: {
  /** 上部に統計タイルを 3 枚置くか */
  stats?: boolean;
  /** 本文の行数 */
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <SkeletonBlock className="h-7 w-1/2" />
        <SkeletonRule className="w-2/3" />
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {STAT_TILES.map((tile) => (
            <div
              key={tile}
              className="flex flex-col gap-3 rounded-md border border-border/50 p-4"
            >
              <SkeletonBlock className="h-6 w-2/3" />
              <SkeletonRule className="w-1/2" />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6">
        {ROW_WIDTHS.slice(0, rows).map((w) => (
          <SkeletonRule key={w} className={w} />
        ))}
      </div>
    </div>
  );
}
