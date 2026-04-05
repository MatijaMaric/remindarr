CREATE TABLE IF NOT EXISTS `episode_ratings` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`episode_id` integer NOT NULL REFERENCES `episodes`(`id`) ON DELETE CASCADE,
	`rating` text NOT NULL,
	`review` text,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`user_id`, `episode_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_episode_ratings_episode` ON `episode_ratings` (`episode_id`);
