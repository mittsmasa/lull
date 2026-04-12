// Vercel preview 判定はこのモジュール経由に統一する。
// `NEXT_PUBLIC_VERCEL_ENV` を見ている理由:
// - client 側でも使う必要があるため `NEXT_PUBLIC_*` 必須
// - `src/app/emulate/[...path]/route.ts` の dynamic import と
//   `next.config.ts` の `turbopack.resolveAlias` は、build 時 literal inline
//   による DCE / alias 切替に依存している。これらの箇所では本モジュールを
//   経由せず、直接 `process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"` を
//   書くこと。定数伝播に頼ると DCE が効かず production bundle に
//   `@emulators/*` 実体が残るリスクがある。
// - Vercel preview scope では `NEXT_PUBLIC_VERCEL_ENV=preview` を手動設定する
//   （`VERCEL_ENV` は自動で入るが、client bundle には露出しないため採用しない）
export const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
