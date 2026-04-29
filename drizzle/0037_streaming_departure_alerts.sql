-- Add `kind` column to streaming_alerts, and widen the unique constraint to
-- include `kind` so arrival and departure records can coexist for the same
-- (user, title, provider) triple.
--
-- SQLite does not support DROP CONSTRAINT, so we must recreate the table.
-- The old unique constraint was an inline UNIQUE(user_id, title_id, provider_id)
-- added by migration 0025 (no named index).
--
-- Also adds streaming_departures_enabled and departure_alert_lead_days to users
-- using table recreation (idempotent: safe to apply even if these columns were
-- previously added under a different migration filename).
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS new_streaming_alerts;
--> statement-breakpoint
CREATE TABLE new_streaming_alerts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  provider_id integer NOT NULL,
  provider_name text NOT NULL,
  alerted_at text NOT NULL DEFAULT (datetime('now')),
  kind text NOT NULL DEFAULT 'arrival',
  UNIQUE(user_id, title_id, provider_id, kind)
);
--> statement-breakpoint
INSERT OR IGNORE INTO new_streaming_alerts SELECT id, user_id, title_id, provider_id, provider_name, alerted_at, 'arrival' FROM streaming_alerts;
--> statement-breakpoint
DROP TABLE streaming_alerts;
--> statement-breakpoint
ALTER TABLE new_streaming_alerts RENAME TO streaming_alerts;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_streaming_alerts_user_title ON streaming_alerts(user_id, title_id);
--> statement-breakpoint
-- Recreate users table to add streaming_departures_enabled and departure_alert_lead_days.
-- Uses table recreation so this migration is idempotent whether or not a previous run
-- under a different migration filename already applied these columns.
DROP TABLE IF EXISTS `__new_users`;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL UNIQUE,
  `display_username` text,
  `email` text,
  `email_verified` integer NOT NULL DEFAULT 0,
  `name` text,
  `image` text,
  `role` text,
  `banned` integer DEFAULT 0,
  `ban_reason` text,
  `ban_expires` integer,
  `created_at` text DEFAULT (datetime('now')),
  `updated_at` text DEFAULT (datetime('now')),
  `password_hash` text,
  `auth_provider` text NOT NULL DEFAULT 'local',
  `provider_subject` text,
  `is_admin` integer NOT NULL DEFAULT 0,
  `profile_public` integer NOT NULL DEFAULT 0,
  `profile_visibility` text NOT NULL DEFAULT 'private',
  `homepage_layout` text,
  `feed_token` text UNIQUE,
  `kiosk_token` text UNIQUE,
  `watchlist_share_token` text UNIQUE,
  `bio` text,
  `activity_stream_enabled` integer NOT NULL DEFAULT 0,
  `streaming_departures_enabled` integer NOT NULL DEFAULT 1,
  `departure_alert_lead_days` integer NOT NULL DEFAULT 7
);
--> statement-breakpoint
INSERT OR IGNORE INTO `__new_users` (
  `id`, `username`, `display_username`, `email`, `email_verified`, `name`, `image`, `role`,
  `banned`, `ban_reason`, `ban_expires`, `created_at`, `updated_at`, `password_hash`,
  `auth_provider`, `provider_subject`, `is_admin`, `profile_public`, `profile_visibility`,
  `homepage_layout`, `feed_token`, `kiosk_token`, `watchlist_share_token`, `bio`,
  `activity_stream_enabled`
)
SELECT
  `id`, `username`, `display_username`, `email`, `email_verified`, `name`, `image`, `role`,
  `banned`, `ban_reason`, `ban_expires`, `created_at`, `updated_at`, `password_hash`,
  `auth_provider`, `provider_subject`, `is_admin`, `profile_public`, `profile_visibility`,
  `homepage_layout`, `feed_token`, `kiosk_token`, `watchlist_share_token`, `bio`,
  `activity_stream_enabled`
FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_auth_provider_subject` ON `users` (`auth_provider`, `provider_subject`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_feed_token_idx` ON `users` (`feed_token`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_kiosk_token_idx` ON `users` (`kiosk_token`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_watchlist_share_token_idx` ON `users` (`watchlist_share_token`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
