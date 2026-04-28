CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notifier_id TEXT NOT NULL REFERENCES notifiers(id) ON DELETE CASCADE,
  attempted_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'skipped')),
  latency_ms INTEGER,
  http_status INTEGER,
  error_message TEXT,
  event_kind TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_log_notifier ON notification_log(notifier_id, attempted_at DESC);
