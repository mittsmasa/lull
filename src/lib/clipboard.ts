/**
 * クリップボード操作のヘルパー。
 *
 * iOS Safari の制約: `navigator.clipboard.writeText()` は user gesture 直下で
 * 呼ばれないと失敗する。非同期処理（サーバーアクション等）の await を挟むと
 * user gesture が失われるため、サーバーからリンクを取得してからコピーする
 * ユースケースでは `navigator.clipboard.write([new ClipboardItem({...})])` に
 * Blob の Promise を渡すパターンを使う必要がある。
 */

type PlainTextClipboardItem = Record<"text/plain", Promise<Blob>>;

function hasClipboardWrite(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof ClipboardItem !== "undefined"
  );
}

/** 通常のテキストコピー（user gesture 直下で呼ぶ想定） */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/**
 * 非同期処理の結果をクリップボードにコピーする。
 * user gesture を保持するため、ClipboardItem に Blob Promise を渡す。
 */
export async function copyTextFromPromise(
  resolver: () => Promise<string>,
): Promise<void> {
  if (hasClipboardWrite()) {
    const items: PlainTextClipboardItem = {
      "text/plain": resolver().then(
        (text) => new Blob([text], { type: "text/plain" }),
      ),
    };
    await navigator.clipboard.write([new ClipboardItem(items)]);
    return;
  }
  const text = await resolver();
  await navigator.clipboard.writeText(text);
}
