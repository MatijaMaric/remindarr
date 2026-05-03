CREATE TABLE `dismissed_suggestions` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`title_id` text NOT NULL REFERENCES `titles`(`id`) ON DELETE CASCADE,
	`dismissed_at` text NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY(`user_id`, `title_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_dismissed_suggestions_user_id` ON `dismissed_suggestions` (`user_id`);
