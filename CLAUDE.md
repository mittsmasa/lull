# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Lull（ラル）— ピアノ発表会の招待・座席・当日体験を一つに繋ぐ Web アプリケーション。管理者・出演者・ゲストの 3 ロール構成。詳細は README.md と ARCHITECTURE.md を参照。

## コマンド

```bash
pnpm dev              # Next.js 開発サーバー起動
pnpm build            # プロダクションビルド
pnpm type-check       # TypeScript 型チェック（tsc --noEmit）
pnpm lint             # Biome によるリント
pnpm lint:fix         # Biome リント自動修正
pnpm format           # Biome フォーマット
pnpm test             # Vitest（watch モード）
pnpm vitest run       # テスト 1 回実行（CI 用）
pnpm storybook        # Storybook 起動（port 6006）
pnpm db:generate      # Drizzle マイグレーション生成
pnpm db:migrate       # マイグレーション実行
pnpm db:push          # スキーマをDBに直接反映
pnpm db:studio        # Drizzle Studio（DB GUI）
```

## 技術スタック

- **フレームワーク**: Next.js 16（App Router）/ React 19 / TypeScript
- **パッケージマネージャ**: pnpm
- **CSS**: Tailwind CSS v4 + shadcn/ui（new-york スタイル）
- **API**: Hono RPC を Next.js Route Handler にマウント
- **DB**: SQLite（better-sqlite3）/ Drizzle ORM（本番は Cloudflare D1）
- **認証**: Better Auth（Google OAuth）
- **リンター/フォーマッター**: Biome
- **テスト**: Vitest + Storybook addon-vitest（Playwright ブラウザ）
- **Git hooks**: Lefthook（pre-commit で `biome check --staged`）
- **CI**: GitHub Actions（lint / type-check / test）

## アーキテクチャ

```
src/
├── app/                        # Next.js App Router
│   ├── api/[[...route]]/       # Hono catch-all Route Handler
│   │   └── route.ts            # GET/POST/PUT/DELETE/PATCH → Hono
│   ├── _components/            # ページ固有コンポーネント
│   ├── layout.tsx / page.tsx
│   └── globals.css             # Tailwind CSS v4 エントリ
├── server/                     # Hono API サーバー
│   ├── index.ts                # app 定義・ルート集約・AppType エクスポート
│   └── routes/                 # 個別ルート
├── db/
│   ├── schema.ts               # Drizzle テーブル＋リレーション定義
│   └── index.ts                # DB 接続（singleton）
└── lib/
    ├── auth.ts                 # Better Auth サーバー設定
    ├── auth-client.ts          # Better Auth クライアント
    ├── rpc.ts                  # Hono RPC クライアント（hc<AppType>）
    ├── utils.ts                # cn() 等ユーティリティ
    └── fonts.ts                # フォント設定
```

### API の型安全な通信

Hono RPC を使用。サーバー側で `AppType` をエクスポートし、クライアント側で `hc<AppType>("/")` を通じて型安全に API を呼び出す。新しいルートは `src/server/routes/` に作成し、`src/server/index.ts` で `.route()` で集約する。

### DB スキーマ

`src/db/schema.ts` に Drizzle ORM で全テーブル定義。主要テーブル: users, sessions, accounts, verifications（Better Auth 管理）、events, event_members, invitations, programs, check_ins（ドメイン）。変更後は `pnpm db:generate` → `pnpm db:migrate`。

### 認証

Better Auth + Drizzle アダプタ。`/api/auth/*` を Hono 経由で Better Auth にルーティング。セッションは DB 保存方式。

## コードスタイル（Biome 設定）

- ダブルクォート、セミコロンあり、trailing comma あり
- インデント: スペース 2
- 行幅: 80
- import の自動整理が有効
- パスエイリアス: `@/*` → `./src/*`

## shadcn/ui

`components.json` で設定済み。RSC 対応、アイコンは lucide-react。コンポーネント追加: `npx shadcn@latest add <component>`
