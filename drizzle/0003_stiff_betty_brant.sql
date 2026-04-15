ALTER TABLE `programs` RENAME COLUMN "order" TO "sort_order";--> statement-breakpoint
CREATE TABLE `companions` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`name` text NOT NULL,
	`checked_in` integer DEFAULT false NOT NULL,
	`checked_in_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `companions_invitation_id_idx` ON `companions` (`invitation_id`);--> statement-breakpoint
CREATE TABLE `program_performers` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `program_performers_program_id_idx` ON `program_performers` (`program_id`);--> statement-breakpoint
CREATE INDEX `program_performers_member_id_idx` ON `program_performers` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_performers_unique` ON `program_performers` (`program_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `program_pieces` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`title` text NOT NULL,
	`composer` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `program_pieces_program_id_idx` ON `program_pieces` (`program_id`);--> statement-breakpoint
DROP TABLE `check_ins`;--> statement-breakpoint
DROP INDEX `programs_member_id_idx`;--> statement-breakpoint
DROP INDEX `programs_event_order_unique`;--> statement-breakpoint
ALTER TABLE `programs` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `programs` DROP COLUMN `composer`;--> statement-breakpoint
ALTER TABLE `programs` DROP COLUMN `member_id`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`member_id` text,
	`token` text NOT NULL,
	`inviter_display_name` text NOT NULL,
	`guest_name` text,
	`guest_email` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`checked_in` integer DEFAULT false NOT NULL,
	`checked_in_at` integer,
	`invalidated_at` integer,
	`responded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_invitations`("id", "event_id", "member_id", "token", "inviter_display_name", "guest_name", "guest_email", "status", "checked_in", "checked_in_at", "invalidated_at", "responded_at", "created_at", "updated_at") SELECT "id", "event_id", "member_id", "token", "inviter_display_name", "guest_name", "guest_email", "status", "checked_in", "checked_in_at", "invalidated_at", "responded_at", "created_at", "updated_at" FROM `invitations`;--> statement-breakpoint
DROP TABLE `invitations`;--> statement-breakpoint
ALTER TABLE `__new_invitations` RENAME TO `invitations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`token`);--> statement-breakpoint
CREATE INDEX `invitations_event_id_idx` ON `invitations` (`event_id`);--> statement-breakpoint
CREATE INDEX `invitations_member_id_idx` ON `invitations` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_idx` ON `invitations` (`token`);