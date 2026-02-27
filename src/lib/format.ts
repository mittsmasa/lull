/**
 * datetime 文字列を表示用にフォーマット
 * "2026-03-15T14:00" → "2026/03/15 14:00"
 * ISO 8601 タイムゾーン付き ("2026-03-15T14:00:00+09:00") にも対応
 */
export function formatDatetime(datetime: string): string {
  // タイムゾーン情報を除去（+HH:MM, Z 等）
  const withoutTz = datetime.replace(/([+-]\d{2}:\d{2}|Z)$/, "");
  // 秒を除去（HH:mm:ss → HH:mm）
  const withoutSeconds = withoutTz.replace(/(\d{2}:\d{2}):\d{2}/, "$1");
  // "YYYY-MM-DDTHH:mm" → "YYYY/MM/DD HH:mm"
  return withoutSeconds.replace(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/,
    "$1/$2/$3 $4",
  );
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
