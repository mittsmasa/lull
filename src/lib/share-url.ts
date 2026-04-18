/**
 * LINE 等の SNS でリンクをシェアした際、受け手が LINE 内蔵ブラウザで
 * 開くのを避けるためのクエリパラメータ付き URL を返す。
 *
 * LINE は URL に `?openExternalBrowser=1` が付いていると、タップ時に
 * 端末標準ブラウザで開く仕様。（他 SNS では無害なため常時付与）
 */
export function buildShareUrl(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const separator = path.includes("?") ? "&" : "?";
  return `${origin}${path}${separator}openExternalBrowser=1`;
}
