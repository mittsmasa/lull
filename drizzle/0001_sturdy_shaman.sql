CREATE TABLE `performer_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`token` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`accepted_by_user_id` text,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `performer_invitations_token_unique` ON `performer_invitations` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `performer_invitations_token_idx` ON `performer_invitations` (`token`);--> statement-breakpoint
CREATE INDEX `performer_invitations_event_id_idx` ON `performer_invitations` (`event_id`);