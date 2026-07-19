# ローカル開発ガイド

## セットアップ

### 1. 依存インストール

```bash
pnpm install
```

### 2. `.env.local` を作成

`.env.example` をコピーして最低限の値を埋める。

```bash
cp .env.example .env.local
```

必須の設定値:

| 変数 | 値 | 備考 |
|---|---|---|
| `BETTER_AUTH_SECRET` | 任意の文字列 | dev 用なので適当でよい |
| `BETTER_AUTH_URL` | `http://localhost:3000` | |
| `GOOGLE_CLIENT_ID` | 本物の値 or `emulate-client` | エミュレータ利用時は後者 |
| `GOOGLE_CLIENT_SECRET` | 本物の値 or `emulate-secret` | 同上 |
| `APP_PUBLIC_URL` | `http://localhost:3000` | |

### 3. DB を初期化

ローカルでは SQLite ファイル (`local.db`) が自動作成される。`TURSO_DATABASE_URL` 未設定時のデフォルト。

```bash
pnpm db:push
```

`db:push` はスキーマを DB に直接反映する（マイグレーションファイルを生成せずに済む）。ローカル開発ではこれで十分。

### 4. 開発サーバー起動

```bash
pnpm dev
```

## Google OAuth エミュレータ

本物の Google OAuth クレデンシャルがなくても、エミュレータでログインできる。

### 有効化条件

`.env.local` に以下を **両方** 設定する:

```
GOOGLE_CLIENT_ID=emulate-client
GOOGLE_CLIENT_SECRET=emulate-secret
NEXT_PUBLIC_VERCEL_ENV=preview
```

`NEXT_PUBLIC_VERCEL_ENV=preview` がないとエミュレータが有効にならない。`isPreview` 判定（`src/lib/env.ts`）がこの値を見ている。

### 動作

サインインボタンを押すと、本物の Google ログイン画面の代わりにエミュレータ画面が表示される。任意のメールアドレス・名前でログインできる。

## Stripe（事前支払い）

事前支払い（オンライン決済）機能を動かすには Stripe のテストモード API キーが必要。**未設定でもアプリは動く**（事前支払いの選択肢が表示されないだけ）。

### 環境変数

`.env.local` に以下を設定する（[Stripe ダッシュボード](https://dashboard.stripe.com/test/apikeys) のテストモードキー）:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### webhook のローカル転送

決済完了の反映は webhook（`checkout.session.completed`）経由なので、ローカルでは [Stripe CLI](https://docs.stripe.com/stripe-cli) で転送する:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

起動時に表示される `whsec_...` を `STRIPE_WEBHOOK_SECRET` に設定して dev サーバーを再起動する。

### テストカード

テストモードでは `4242 4242 4242 4242`（有効期限・CVC は任意の未来日/数字）で決済できる。

## よくあるハマりどころ

### DB 関連のエラーが出る

`.env.local` が存在しないか、DB が初期化されていない。

```bash
# .env.local があるか確認
ls -la .env.local

# DB を初期化
pnpm db:push
```

### エミュレータが動かない / 本物の Google 画面が出る

`NEXT_PUBLIC_VERCEL_ENV=preview` が `.env.local` に入っているか確認。追加した場合は dev サーバーの再起動が必要（`NEXT_PUBLIC_*` はビルド時に埋め込まれるため）。

### worktree で動かない

worktree には `.env.local` や `local.db` が共有されない（gitignore 対象のため）。worktree ごとに `.env.local` を作成し、`pnpm db:push` を実行する。

### Resend（メール送信）のエラー

`RESEND_API_KEY` 未設定でも dev では動く。実送信はせず、宛先と件名のみ `console.info` に出力される。`NODE_ENV=production` で未設定の場合のみエラーになる。
