ALTER TABLE `users` ADD COLUMN `activity_stream_enabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `activity_kind_visibility` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`kind` text NOT NULL,
	`visibility` text NOT NULL,
	PRIMARY KEY(`user_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `hidden_activity_events` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`event_kind` text NOT NULL,
	`event_key` text NOT NULL,
	PRIMARY KEY(`user_id`, `event_kind`, `event_key`)
);
