# patches

pnpm の `patchedDependencies` から適用される patch を置く。設定は `pnpm-workspace.yaml`。

キーはバージョン付きで固定する。パッケージを上げると patch が未使用になり、`pnpm install` が `ERR_PNPM_UNUSED_PATCH` で失敗する（exit 1、2026-10-19 に pnpm 11.13.1 で確認）。patch が黙って残り続けることを防ぐための固定。
