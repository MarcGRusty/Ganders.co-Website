-- People who can sign in to Studio, and what they are allowed to do.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  salt TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0,
  session_version INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A role is a named bundle of permissions. Built in roles have system = 1.
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',   -- JSON array of permission keys, "*" means everything
  colour TEXT DEFAULT '',
  system INTEGER NOT NULL DEFAULT 0
);

-- A group is a team of people. Everyone in a group gets the group's roles and permissions.
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]'    -- extra permissions on top of the group's roles
);

CREATE TABLE IF NOT EXISTS user_roles (user_id INTEGER NOT NULL, role_id INTEGER NOT NULL, PRIMARY KEY (user_id, role_id));
CREATE TABLE IF NOT EXISTS user_groups (user_id INTEGER NOT NULL, group_id INTEGER NOT NULL, PRIMARY KEY (user_id, group_id));
CREATE TABLE IF NOT EXISTS group_roles (group_id INTEGER NOT NULL, role_id INTEGER NOT NULL, PRIMARY KEY (group_id, role_id));

-- Custom permissions you define yourself (for example for modules or connections you build).
CREATE TABLE IF NOT EXISTS custom_permissions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT DEFAULT ''
);

INSERT OR IGNORE INTO roles (key, name, description, permissions, colour, system) VALUES
('owner', 'Owner', 'Full control, including people, roles and billing level settings. Cannot be deleted.', '["*"]', '#111A22', 1),
('admin', 'Administrator', 'Runs the whole site day to day, including people and roles.',
 '["dashboard.view","posts.view","posts.edit","posts.publish","posts.delete","pages.view","pages.edit","pages.publish","pages.delete","ideas.use","ventures.manage","inbox.view","inbox.manage","knowledge.manage","media.upload","media.delete","design.manage","ai.use","ai.settings","modules.manage","social.publish","integrations.manage","users.manage"]', '#2B44FF', 1),
('editor', 'Editor', 'Writes, edits and publishes posts and pages. Can use AI and reply to messages.',
 '["dashboard.view","posts.view","posts.edit","posts.publish","posts.delete","pages.view","pages.edit","pages.publish","ideas.use","inbox.view","inbox.manage","knowledge.manage","media.upload","ai.use","social.publish"]', '#2F7A5B', 1),
('writer', 'Writer', 'Drafts posts and uses AI. Cannot publish.',
 '["dashboard.view","posts.view","posts.edit","ideas.use","media.upload","ai.use"]', '#C98A00', 1),
('viewer', 'Viewer', 'Can look around Studio but not change anything.',
 '["dashboard.view","posts.view","pages.view","inbox.view"]', '#6E6E73', 1);
