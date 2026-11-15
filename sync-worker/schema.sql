-- EE-INDEX 云同步 D1 schema
-- wrangler d1 execute eeidx-sync --file=schema.sql --remote

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  quota_bytes INTEGER NOT NULL DEFAULT 209715200
);

CREATE TABLE IF NOT EXISTS categories (
  device_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, id)
);

CREATE TABLE IF NOT EXISTS files (
  device_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT,
  category_id TEXT,
  hash TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  PRIMARY KEY (device_id, id)
);

CREATE INDEX IF NOT EXISTS idx_files_device_updated ON files (device_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_categories_device ON categories (device_id);
