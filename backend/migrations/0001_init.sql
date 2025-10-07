-- Users and messages tables
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash BYTEA NOT NULL,
  dark_mode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  text TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_timestamp_idx ON messages (timestamp DESC);
