CREATE TABLE IF NOT EXISTS `cron_jobs` (
	`name` text PRIMARY KEY NOT NULL,
	`cron` text NOT NULL,
	`last_run` text,
	`next_run` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`name` text,
	`overview` text,
	`air_date` text,
	`still_path` text,
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `episodes_title_season_episode` ON `episodes` (`title_id`,`season_number`,`episode_number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_episodes_air_date` ON `episodes` (`air_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_episodes_title_id` ON `episodes` (`title_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`data` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`error` text,
	`run_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jobs_status_run_at` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jobs_name` ON `jobs` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`notify_time` text DEFAULT '09:00' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`last_sent_date` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifiers_user_id` ON `notifiers` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifiers_enabled_time` ON `notifiers` (`enabled`,`notify_time`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title_id` text,
	`provider_id` integer,
	`monetization_type` text,
	`presentation_type` text,
	`price_value` real,
	`price_currency` text,
	`url` text,
	`available_to` text,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_offers_title_id` ON `offers` (`title_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_offers_provider_id` ON `offers` (`provider_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `oidc_states` (
	`state` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `providers` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`technical_name` text,
	`icon_url` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scores` (
	`title_id` text PRIMARY KEY NOT NULL,
	`imdb_score` real,
	`imdb_votes` integer,
	`tmdb_score` real,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_expires_at` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `titles` (
	`id` text PRIMARY KEY NOT NULL,
	`object_type` text NOT NULL,
	`title` text NOT NULL,
	`original_title` text,
	`release_year` integer,
	`release_date` text,
	`runtime_minutes` integer,
	`short_description` text,
	`genres` text,
	`imdb_id` text,
	`tmdb_id` text,
	`poster_url` text,
	`age_certification` text,
	`original_language` text,
	`tmdb_url` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_titles_release_date` ON `titles` (`release_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_titles_object_type` ON `titles` (`object_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tracked` (
	`title_id` text NOT NULL,
	`user_id` text NOT NULL,
	`tracked_at` text DEFAULT (datetime('now')),
	`notes` text,
	PRIMARY KEY(`title_id`, `user_id`),
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text,
	`display_name` text,
	`auth_provider` text DEFAULT 'local' NOT NULL,
	`provider_subject` text,
	`is_admin` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_auth_provider_subject` ON `users` (`auth_provider`,`provider_subject`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `watched_episodes` (
	`episode_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`watched_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`episode_id`, `user_id`),
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE IF EXISTS `schema_version`;
