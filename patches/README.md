# patches

pnpm の `patchedDependencies` から適用される patch を置く。設定は `pnpm-workspace.yaml`。

キーはバージョン付きで固定する。パッケージを上げると patch が未使用になり、`pnpm install` が `ERR_PNPM_UNUSED_PATCH` で失敗する（exit 1、2026-10-19 に pnpm 11.13.1 で確認）。patch が黙って残り続けることを防ぐための固定。

## @storybook__nextjs-vite@10.6.2.patch

next 16.4 で storybook のストーリーが落ちるのを防ぐ。

### 理由

next 16.4.0 の `useRouter()` は `LayoutRouterContext` から `parentRenderTree.data.bfcacheId` を読む。`parentRenderTree` 側に optional chain が無い（`next/dist/client/components/navigation.js`）。

`@storybook/nextjs-vite` 10.6.2 の App Router モックは `parentRenderTree` を渡さない。next の `RedirectBoundary` が `useRouter()` を呼んだ時点で `Cannot read properties of undefined (reading 'data')` になり、`app-header` と `navigation-sheet` のストーリー 5 件が落ちた。

patch は `parentRenderTree: { data: {} }` を足すだけ。`bfcacheId` は `?? 0` で既定値に落ち、`'_b_0_'` になる。bfcache を持たない場合と同じ値。

### upstream の状況

storybookjs/storybook#36720 で報告され、2026-10-13 に close した。ただし修正を含むリリースはまだ無い。10.6.2 と 11.0.0-alpha.6 の該当チャンク（`dist/_browser-chunks/chunk-342N7CWU.js`）は md5 が一致する（`b3ee7f3a8f3efb77631173ff24ed819c`、2026-10-19 時点）。storybook を上げての回避はできない。

### 撤去条件

storybook を上げるときは、先に patch を外して試す。

1. `pnpm-workspace.yaml` の `patchedDependencies` から該当行を消す
2. `patches/@storybook__nextjs-vite@10.6.2.patch` を消す
3. `pnpm install && pnpm vitest run --project storybook` を実行する

全件 pass なら patch は不要。落ちるなら新しいバージョン向けに作り直す。
