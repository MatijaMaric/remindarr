CREATE TABLE `episode_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`title_id` text NOT NULL REFERENCES `titles`(`id`) ON DELETE CASCADE,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`body` text NOT NULL,
	`visibility` text NOT NULL DEFAULT 'public',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_episode_comments_scope` ON `episode_comments` (`title_id`, `season_number`, `episode_number`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_episode_comments_user_created` ON `episode_comments` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `episode_comment_reactions` (
	`comment_id` text NOT NULL REFERENCES `episode_comments`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`emoji` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY (`comment_id`, `user_id`, `emoji`)
);
