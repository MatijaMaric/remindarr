CREATE TABLE `streaming_alert_deliveries` (
  `notifier_id` text NOT NULL REFERENCES `notifiers`(`id`) ON DELETE CASCADE,
  `title_id` text NOT NULL REFERENCES `titles`(`id`) ON DELETE CASCADE,
  `provider_id` integer NOT NULL,
  `kind` text NOT NULL,
  PRIMARY KEY (`notifier_id`, `title_id`, `provider_id`, `kind`)
);
