-- SQLite does not support ALTER COLUMN, so we recreate the table
-- to make webauthn_user_id nullable (Better Auth sends null for it).
CREATE TABLE `passkey_new` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`webauthn_user_id` text,
	`counter` integer NOT NULL DEFAULT 0,
	`device_type` text,
	`backed_up` integer DEFAULT 0,
	`transports` text,
	`credential_id` text NOT NULL,
	`aaguid` text,
	`created_at` text DEFAULT (datetime('now'))
);--> statement-breakpoint
INSERT INTO `passkey_new` SELECT * FROM `passkey`;--> statement-breakpoint
DROP TABLE `passkey`;--> statement-breakpoint
ALTER TABLE `passkey_new` RENAME TO `passkey`;
