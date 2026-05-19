CREATE INDEX `idx_episodes_title_air` ON `episodes` (`title_id`,`air_date`);
--> statement-breakpoint
CREATE INDEX `idx_watched_user_episode` ON `watched_episodes` (`user_id`,`episode_id`);