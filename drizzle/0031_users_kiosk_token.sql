ALTER TABLE users ADD COLUMN kiosk_token text;
CREATE UNIQUE INDEX IF NOT EXISTS users_kiosk_token_idx ON users(kiosk_token);
