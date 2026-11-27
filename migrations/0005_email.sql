-- One time sign in links sent by email
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- Every email the site sends, for troubleshooting from Studio
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Make contact messages actionable: replies, notes, who handled it
ALTER TABLE messages ADD COLUMN form TEXT NOT NULL DEFAULT 'contact';
ALTER TABLE messages ADD COLUMN notes TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN replied_at TEXT;
ALTER TABLE messages ADD COLUMN handled_by TEXT DEFAULT '';
