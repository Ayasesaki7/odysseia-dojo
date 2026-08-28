CREATE TABLE fingerprint_observations (
  id TEXT PRIMARY KEY,

  discord_user_id TEXT NOT NULL,
  discord_username_snapshot TEXT,

  session_id_hash TEXT NOT NULL UNIQUE,

  browser_fingerprint_hash TEXT,
  canvas_hash TEXT,
  webgl_hash TEXT,
  user_agent_hash TEXT,

  platform TEXT,
  timezone TEXT,
  screen_resolution TEXT,
  language TEXT,
  fingerprint_confidence REAL,

  ip_hash TEXT NOT NULL,
  ip_prefix_hash TEXT,
  country TEXT,
  asn INTEGER,

  payload_version INTEGER NOT NULL DEFAULT 1,
  hash_key_version INTEGER NOT NULL DEFAULT 1,
  captured_at TEXT NOT NULL
);

CREATE INDEX idx_observation_discord
  ON fingerprint_observations(discord_user_id);

CREATE INDEX idx_observation_fingerprint
  ON fingerprint_observations(browser_fingerprint_hash);

CREATE INDEX idx_observation_ip
  ON fingerprint_observations(ip_hash);

CREATE INDEX idx_observation_ip_prefix
  ON fingerprint_observations(ip_prefix_hash);

CREATE INDEX idx_observation_captured_at
  ON fingerprint_observations(captured_at);
