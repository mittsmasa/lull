ALTER TABLE `invitations` ADD `settled_checkout_session_ids` text;--> statement-breakpoint
-- 既存の Stripe 受領分を「記録済みセッション」として埋める。
-- 空のままだと、導入前に決済されたセッションの webhook 再送で受領額が二重加算される
UPDATE `invitations`
SET `settled_checkout_session_ids` = ',' || `stripe_checkout_session_id` || ','
WHERE `paid_at` IS NOT NULL
  AND `paid_method` = 'stripe'
  AND `stripe_checkout_session_id` IS NOT NULL;
