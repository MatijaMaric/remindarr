CREATE TABLE `pinned_titles` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`title_id` text NOT NULL REFERENCES `titles`(`id`) ON DELETE CASCADE,
	`position` integer NOT NULL DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`user_id`, `title_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pinned_titles_user_id` ON `pinned_titles` (`user_id`);
