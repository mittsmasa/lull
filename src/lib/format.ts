/**
 * datetime 文字列を表示用にフォーマット
 * "2026-03-15T14:00" → "2026/03/15 14:00"
 * ISO 8601 タイムゾーン付き ("2026-03-15T14:00:00+09:00") にも対応
 */
export function formatDatetime(datetime: string): string {
  // タイムゾーン情報を除去（+HH:MM, Z 等）
  const withoutTz = datetime.replace(/([+-]\d{2}:\d{2}|Z)$/, "");
  // ミリ秒・秒を除去（HH:mm:ss.sss → HH:mm）
  const withoutSeconds = withoutTz.replace(/(\d{2}:\d{2}):\d{2}(\.\d+)?/, "$1");
  // "YYYY-MM-DDTHH:mm" → "YYYY/MM/DD HH:mm"
  return withoutSeconds.replace(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/,
    "$1/$2/$3 $4",
  );
}

/**
 * epoch ミリ秒を表示用にフォーマット
 * 1773055200000 → "2026/03/15 14:00"
 *
 * DB に epoch ms で保存されている時刻（paid_at 等）の表示に使う。
 * SSR 環境（UTC）でもゲスト・主催者に同じ時刻を見せるため timeZone を明示する
 */
export function formatEpochDatetime(ts: number): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).formatToParts(new Date(ts));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // ロケール依存の区切り文字を経由せず組み立てる（"2026/03/15 14:00" に固定）
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * datetime 文字列から日付部分を抽出
 * "2026-03-15T14:00" → "2026/03/15"
 */
export function formatDate(datetime: string): string {
  const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return datetime;
  return `${match[1]}/${match[2]}/${match[3]}`;
}

/**
 * datetime 文字列から時刻部分を抽出
 * "2026-03-15T14:00" → "14:00"
 */
export function formatTime(datetime: string): string {
  const match = datetime.match(/T(\d{2}:\d{2})/);
  if (!match) return datetime;
  return match[1];
}
