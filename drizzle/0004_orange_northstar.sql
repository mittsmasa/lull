ALTER TABLE `companions` ADD `after_party_attending` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `attendance_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `after_party_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `after_party_venue` text;--> statement-breakpoint
ALTER TABLE `events` ADD `after_party_start_time` text;--> statement-breakpoint
ALTER TABLE `events` ADD `after_party_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `payment_note` text;--> statement-breakpoint
ALTER TABLE `invitations` ADD `after_party_attendance` text;--> statement-breakpoint
ALTER TABLE `invitations` ADD `payment_method` text;--> statement-breakpoint
ALTER TABLE `invitations` ADD `paid_at` integer;--> statement-breakpoint
ALTER TABLE `invitations` ADD `paid_method` text;--> statement-breakpoint
ALTER TABLE `invitations` ADD `paid_amount` integer;--> statement-breakpoint
ALTER TABLE `invitations` ADD `stripe_checkout_session_id` text;