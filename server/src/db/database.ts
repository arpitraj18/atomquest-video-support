import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { env } from '../env';
import { logger } from '../logger';

/**
 * The schema is declared once here and applied with `CREATE TABLE IF NOT EXISTS`,
 * so first run creates the database and later runs are a no-op. For a project of
 * this size a single declarative schema is clearer than a migration framework.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('agent', 'customer')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('scheduled', 'live', 'ended')),
  agent_id          TEXT NOT NULL REFERENCES users(id),
  agent_name        TEXT NOT NULL,
  invite_code       TEXT NOT NULL UNIQUE,
  created_at        TEXT NOT NULL,
  started_at        TEXT,
  ended_at          TEXT,
  queue_status      TEXT DEFAULT 'scheduled',
  csat_score        INTEGER,
  csat_comment      TEXT,
  disposition       TEXT,
  disposition_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);

CREATE TABLE IF NOT EXISTS participants (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  role         TEXT NOT NULL CHECK (role IN ('agent', 'customer')),
  display_name TEXT NOT NULL,
  user_id      TEXT REFERENCES users(id),
  joined_at    TEXT NOT NULL,
  left_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);

CREATE TABLE IF NOT EXISTS session_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  type       TEXT NOT NULL,
  actor_name TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id, id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  sender_role TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  file_id     TEXT REFERENCES shared_files(id),
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS shared_files (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  uploader_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_session ON shared_files(session_id);

CREATE TABLE IF NOT EXISTS recordings (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  status      TEXT NOT NULL,
  stored_name TEXT,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER,
  started_at  TEXT NOT NULL,
  ended_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_recordings_session ON recordings(session_id);
`;

let db: DatabaseSync | null = null;

/** Opens (and on first run, creates) the database. Safe to call once at startup. */
export function initDatabase(): DatabaseSync {
  if (db) return db;

  const dbPath = resolve(env.DATABASE_PATH);
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new DatabaseSync(dbPath);
  // WAL gives us concurrent reads during a write (e.g. admin dashboard polling while a call mutates state).
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);

  // Schema migrations for new enterprise features
  try { db.exec('ALTER TABLE sessions ADD COLUMN queue_status TEXT DEFAULT "scheduled"'); } catch {}
  try { db.exec('ALTER TABLE sessions ADD COLUMN csat_score INTEGER'); } catch {}
  try { db.exec('ALTER TABLE sessions ADD COLUMN csat_comment TEXT'); } catch {}
  try { db.exec('ALTER TABLE sessions ADD COLUMN disposition TEXT'); } catch {}
  try { db.exec('ALTER TABLE sessions ADD COLUMN disposition_notes TEXT'); } catch {}

  logger.info({ dbPath }, 'database ready');
  return db;
}

/** Returns the live database handle, throwing if the server forgot to initialise it. */
export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database accessed before initDatabase() was called');
  return db;
}

/**
 * Runs a function inside a transaction, rolling back on any thrown error.
 * node:sqlite has no transaction() helper, so we wrap BEGIN/COMMIT explicitly.
 */
export function transaction<T>(fn: () => T): T {
  const handle = getDb();
  handle.exec('BEGIN');
  try {
    const result = fn();
    handle.exec('COMMIT');
    return result;
  } catch (err) {
    handle.exec('ROLLBACK');
    throw err;
  }
}
