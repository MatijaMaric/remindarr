-- Audit and unify FK onDelete behavior across schema.
-- SQLite cannot ALTER existing FK constraints, so each affected table is
-- rebuilt via the standard copy / drop / rename pattern. Indexes are
-- recreated after the rename.
--
-- Summary of FK changes:
--   offers.title_id        -> titles.id         ON DELETE CASCADE
--   offers.provider_id     -> providers.id      ON DELETE RESTRICT
--   scores.title_id        -> titles.id         ON DELETE CASCADE
--   tracked.title_id       -> titles.id         ON DELETE CASCADE (was no action)
--   watched_titles.title_id-> titles.id         ON DELETE CASCADE (was no action)
--   ratings.title_id       -> titles.id         ON DELETE CASCADE (was no action)
--   recommendations.title_id -> titles.id       ON DELETE CASCADE (was no action)
--   invitations.used_by_id -> users.id          ON DELETE SET NULL (was no action)
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
-- ─── offers ──────────────────────────────────────────────────────────────────
CREATE TABLE __new_offers (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title_id` text,
  `provider_id` integer,
  `monetization_type` text,
  `presentation_type` text,
  `price_value` real,
  `price_currency` text,
  `url` text,
  `deep_link` text,
  `available_to` text,
  FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO __new_offers SELECT * FROM offers;
--> statement-breakpoint
DROP TABLE offers;
--> statement-breakpoint
ALTER TABLE __new_offers RENAME TO offers;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_offers_title_id` ON `offers` (`title_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_offers_provider_id` ON `offers` (`provider_id`);
--> statement-breakpoint
-- ─── scores ──────────────────────────────────────────────────────────────────
CREATE TABLE __new_scores (
  `title_id` text PRIMARY KEY NOT NULL,
  `imdb_score` real,
  `imdb_votes` integer,
  `tmdb_score` real,
  FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO __new_scores SELECT * FROM scores;
--> statement-breakpoint
DROP TABLE scores;
--> statement-breakpoint
ALTER TABLE __new_scores RENAME TO scores;
--> statement-breakpoint
-- ─── tracked ─────────────────────────────────────────────────────────────────
CREATE TABLE __new_tracked (
  `title_id` text NOT NULL,
  `user_id` text NOT NULL,
  `tracked_at` text DEFAULT (datetime('now')),
  `notes` text,
  `public` integer DEFAULT 1 NOT NULL,
  `user_status` text,
  `notification_mode` text,
  PRIMARY KEY(`title_id`, `user_id`),
  FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO __new_tracked SELECT title_id, user_id, tracked_at, notes, public, user_status, notification_mode FROM tracked;
--> statement-breakpoint
DROP TABLE tracked;
--> statement-breakpoint
ALTER TABLE __new_tracked RENAME TO tracked;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracked_user_id` ON `tracked` (`user_id`);
--> statement-breakpoint
-- ─── watched_titles ──────────────────────────────────────────────────────────
CREATE TABLE __new_watched_titles (
  `title_id` text NOT NULL,
  `user_id` text NOT NULL,
  `watched_at` text DEFAULT (datetime('now')),
  PRIMARY KEY(`title_id`, `user_id`),
  FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO __new_watched_titles SELECT * FROM watched_titles;
--> statement-breakpoint
DROP TABLE watched_titles;
--> statement-breakpoint
ALTER TABLE __new_watched_titles RENAME TO watched_titles;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_watched_titles_user_id` ON `watched_titles` (`user_id`);
--> statement-breakpoint
-- ─── ratings ─────────────────────────────────────────────────────────────────
CREATE TABLE __new_ratings (
  `user_id` text NOT NULL,
  `title_id` text NOT NULL,
  `rating` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')),
  PRIMARY KEY(`user_id`, `title_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO __new_ratings SELECT * FROM ratings;
--> statement-breakpoint
DROP TABLE ratings;
--> statement-breakpoint
ALTER TABLE __new_ratings RENAME TO ratings;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ratings_title` ON `ratings` (`title_id`);
--> statement-breakpoint
-- ─── recommendations ─────────────────────────────────────────────────────────
CREATE TABLE __new_recommendations (
  `id` text PRIMARY KEY NOT NULL,
  `from_user_id` text NOT NULL,
  `title_id` text NOT NULL,
  `message` text,
  `created_at` text DEFAULT (datetime('now')),
  FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO __new_recommendations SELECT * FROM recommendations;
--> statement-breakpoint
DROP TABLE recommendations;
--> statement-breakpoint
ALTER TABLE __new_recommendations RENAME TO recommendations;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_recommendations_from_title` ON `recommendations` (`from_user_id`, `title_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recommendations_from_user` ON `recommendations` (`from_user_id`);
--> statement-breakpoint
-- ─── invitations ─────────────────────────────────────────────────────────────
CREATE TABLE __new_invitations (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `created_by_id` text NOT NULL,
  `used_by_id` text,
  `created_at` text DEFAULT (datetime('now')),
  `used_at` text,
  `expires_at` text NOT NULL,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`used_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO __new_invitations SELECT * FROM invitations;
--> statement-breakpoint
DROP TABLE invitations;
--> statement-breakpoint
ALTER TABLE __new_invitations RENAME TO invitations;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `invitations_code_unique` ON `invitations` (`code`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_invitations_code` ON `invitations` (`code`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
