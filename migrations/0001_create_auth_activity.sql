CREATE TABLE auth_activity (
  discord_user_id TEXT PRIMARY KEY,
  discord_username_snapshot TEXT,
  last_successful_oauth_at TEXT NOT NULL
);

CREATE INDEX idx_auth_activity_last_oauth
  ON auth_activity(last_successful_oauth_at);
