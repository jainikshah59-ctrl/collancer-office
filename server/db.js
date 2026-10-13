/* COLLANCER OFFICE — Database layer (node:sqlite, built-in, no native deps).
 *
 * On Vercel the DB path defaults to /tmp (ephemeral per instance). Agents are
 * re-seeded on every cold start so the office always opens with the full team.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.OFFICE_DB_PATH || path.join(__dirname, '../data/office.db');
try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch {}

const db = new DatabaseSync(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  accent TEXT NOT NULL DEFAULT 'sky',
  archetype TEXT NOT NULL DEFAULT 'hacker',
  status TEXT NOT NULL DEFAULT 'idle',
  status_note TEXT DEFAULT '',
  current_task_id TEXT,
  context_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  objective TEXT DEFAULT '',
  agent_id TEXT REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending',
  stage INTEGER NOT NULL DEFAULT 0,
  logs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  recipient TEXT,
  type TEXT NOT NULL DEFAULT 'progress',
  content TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function emit(type, payload) {
  try {
    db.prepare('INSERT INTO events (type, payload) VALUES (?, ?)').run(type, JSON.stringify(payload || {}));
  } catch {}
}

module.exports = { db, emit };
