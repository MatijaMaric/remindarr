CREATE TABLE IF NOT EXISTS `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`webauthn_user_id` text NOT NULL,
	`counter` integer NOT NULL DEFAULT 0,
	`device_type` text,
	`backed_up` integer DEFAULT 0,
	`transports` text,
	`credential_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
