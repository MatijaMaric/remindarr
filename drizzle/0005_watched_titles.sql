CREATE TABLE IF NOT EXISTS `watched_titles` (
	`title_id` text NOT NULL,
	`user_id` text NOT NULL,
	`watched_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`title_id`, `user_id`),
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_watched_titles_user_id` ON `watched_titles` (`user_id`);
