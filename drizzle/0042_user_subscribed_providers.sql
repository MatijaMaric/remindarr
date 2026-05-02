CREATE TABLE `user_subscribed_providers` (
	`user_id` text NOT NULL,
	`provider_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`user_id`, `provider_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_user_subscribed_providers_user_id` ON `user_subscribed_providers` (`user_id`);
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `only_mine_filter` integer NOT NULL DEFAULT 0;
