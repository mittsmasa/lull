# データモデル（仮）

## users — 管理者・出演者のアカウント

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | ULID |
| name | text | 表示名 |
| email | text? | メールアドレス |
| avatar_url | text? | アバター画像 |
| auth_provider | text | `'google'` / `'line'` |
| auth_provider_id | text | OAuth プロバイダ側の ID |
| created_at | integer | 作成日時 (Unix ms) |
| updated_at | integer | 更新日時 |

## events — 発表会

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | ULID |
| name | text | 発表会名 |
| description | text? | 説明・サブタイトル |
| venue | text? | 会場名 |
| date | text | 開催日 (`YYYY-MM-DD`) |
| open_time | text? | 開場時刻 (`HH:mm`) |
| start_time | text? | 開演時刻 |
| status | text | `'draft'` → `'inviting'` → `'live'` → `'archived'` |
| total_seats | integer | 座席プール総数 |
| current_program_id | text? | 当日進行中の演目 (FK → programs) |
| created_at | integer | |
| updated_at | integer | |

## event_members — イベントへの出演者・管理者の紐付け

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | ULID |
| event_id | text (FK) | → events |
| user_id | text (FK) | → users |
| role | text | `'admin'` / `'performer'` |
| allotment | integer | 招待枠数（同伴者込みの人数上限） |
| display_name | text? | イベント内での表示名（省略時は user.name） |
| created_at | integer | |
| updated_at | integer | |

## invitations — 招待

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | ULID |
| event_id | text (FK) | → events |
| member_id | text (FK) | → event_members（招待元の出演者） |
| token | text (unique) | ゲストアクセス用トークン |
| guest_name | text | ゲスト名 |
| guest_email | text? | ゲストの連絡先 |
| companion_count | integer | 同伴者数（0 = 本人のみ） |
| status | text | `'pending'` / `'accepted'` / `'declined'` |
| responded_at | integer? | 返答日時 |
| created_at | integer | |
| updated_at | integer | |

## programs — プログラム（演目・休憩・あいさつ等）

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | ULID |
| event_id | text (FK) | → events |
| order | integer | 表示順 |
| type | text | `'performance'` / `'intermission'` / `'greeting'` / `'other'` |
| title | text | 曲名 or 項目名 |
| composer | text? | 作曲者（演奏の場合） |
| member_id | text? (FK) | → event_members（演奏者。演奏以外は null） |
| scheduled_time | text? | 予定時刻 (`HH:mm`) |
| estimated_duration | integer? | 予定時間（分） |
| note | text? | 演奏者コメント・メモ |
| created_at | integer | |
| updated_at | integer | |

## check_ins — 来場チェックイン

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | ULID |
| invitation_id | text (FK) | → invitations |
| checked_in_at | integer | チェックイン時刻 |
| checked_in_by | text (FK) | → event_members（確認した人） |
| head_count | integer | 実際の来場人数（ゲスト本人 + 同伴者） |

## ER 概要

```
users ──1:N──> event_members ──1:N──> invitations ──1:1──> check_ins
                    │
                    └──1:N──> programs

events ──1:N──> event_members
       ──1:N──> programs
       ──1:N──> invitations
```

## 設計メモ

- **allotment** は「同伴者込みの人数上限」。招待ごとに `1 + companion_count` を消費する
- **current_program_id** で「今どの演目か」を追跡（当日リアルタイム進行用）
- ゲストは `users` に入れず、`invitations` に情報を直接持つ（ログイン不要のため）
- ID は ULID を採用（時系列ソート可能・URL-safe）
- タイムスタンプは Unix ミリ秒（integer）で統一
