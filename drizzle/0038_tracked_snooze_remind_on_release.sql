-- Idempotent: add snooze_until and remind_on_release to tracked.
-- Uses table recreation so it is safe to apply even if these columns
-- were previously added under a different migration name (e.g. 0036).
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_tracked` (
  `title_id` text NOT NULL,
  `user_id` text NOT NULL,
  `tracked_at` text DEFAULT (datetime('now')),
  `notes` text,
  `public` integer NOT NULL DEFAULT 1,
  `user_status` text,
  `notification_mode` text,
  `snooze_until` text,
  `remind_on_release` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`title_id`, `user_id`),
  FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `__new_tracked` (`title_id`, `user_id`, `tracked_at`, `notes`, `public`, `user_status`, `notification_mode`)
  SELECT `title_id`, `user_id`, `tracked_at`, `notes`, `public`, `user_status`, `notification_mode` FROM `tracked`;
--> statement-breakpoint
DROP TABLE `tracked`;
--> statement-breakpoint
ALTER TABLE `__new_tracked` RENAME TO `tracked`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracked_user_id` ON `tracked` (`user_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
