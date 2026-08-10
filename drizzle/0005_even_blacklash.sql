ALTER TABLE `invitations` ADD `settled_checkout_session_ids` text;--> statement-breakpoint
-- 既存の Stripe 受領分を「記録済みセッション」として埋める。
-- 空のままだと、導入前に決済されたセッションの webhook 再送で受領額が二重加算される。
--
-- 未設定の行だけを対象にしているため、この UPDATE は単体で再実行しても安全。
-- マイグレーションを本番に流してからデプロイするまでの間に発生した決済は
-- 旧コードが記録するのでこの列が NULL のまま残る。デプロイ後にこの文だけを
-- もう一度流すと、その分を取りこぼさずに埋められる
-- （差額決済で複数セッションが積まれた行は IS NULL 条件で除外される）
UPDATE `invitations`
SET `settled_checkout_session_ids` = ',' || `stripe_checkout_session_id` || ','
WHERE `settled_checkout_session_ids` IS NULL
  AND `paid_at` IS NOT NULL
  AND `paid_method` = 'stripe'
  AND `stripe_checkout_session_id` IS NOT NULL;
