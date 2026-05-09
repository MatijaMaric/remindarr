CREATE TABLE `achievements` (
  `key` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `threshold` integer NOT NULL,
  `points` integer NOT NULL,
  `title` text NOT NULL,
  `description` text NOT NULL,
  `icon` text NOT NULL,
  `metadata` text
);
--> statement-breakpoint
CREATE TABLE `user_achievements` (
  `user_id` text NOT NULL,
  `achievement_key` text NOT NULL,
  `progress` integer NOT NULL DEFAULT 0,
  `earned_at` text,
  `earned_notified` integer NOT NULL DEFAULT 0,
  `updated_at` text DEFAULT (datetime('now')),
  PRIMARY KEY (`user_id`, `achievement_key`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`achievement_key`) REFERENCES `achievements`(`key`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_user_achievements_earned` ON `user_achievements` (`user_id`, `earned_at`);
--> statement-breakpoint
CREATE TABLE `user_streaks` (
  `user_id` text PRIMARY KEY NOT NULL,
  `current_streak` integer NOT NULL DEFAULT 0,
  `longest_streak` integer NOT NULL DEFAULT 0,
  `last_watch_date` text,
  `updated_at` text DEFAULT (datetime('now')),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `notifiers` ADD COLUMN `achievements_enabled` integer NOT NULL DEFAULT 0;
