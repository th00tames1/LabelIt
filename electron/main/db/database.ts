import Database from 'better-sqlite3'

let db: Database.Database | null = null

/**
 * Open (or create) a project database at the given path.
 * Runs all pending migrations automatically.
 */
export function openDatabase(dbPath: string): Database.Database {
  try {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    return db
  } catch (error) {
    throw normalizeDatabaseOpenError(error)
  }
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not open. Call openDatabase() first.')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ─── Migration runner ───────────────────────────────────────────────────────

const MIGRATIONS: { filename: string; sql: string }[] = [
  {
    filename: '001_initial.sql',
    sql: `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS project_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS label_classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL,
  shortcut    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id              TEXT PRIMARY KEY,
  filename        TEXT NOT NULL,
  file_path       TEXT NOT NULL UNIQUE,
  thumbnail_path  TEXT,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  file_size       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'unlabeled',
  split           TEXT NOT NULL DEFAULT 'unassigned',
  imported_at     INTEGER NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS annotations (
  id              TEXT PRIMARY KEY,
  image_id        TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  label_class_id  TEXT REFERENCES label_classes(id) ON DELETE SET NULL,
  annotation_type TEXT NOT NULL,
  geometry        TEXT NOT NULL,
  confidence      REAL,
  source          TEXT NOT NULL DEFAULT 'manual',
  is_crowd        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_annotations_image_id      ON annotations(image_id);
CREATE INDEX IF NOT EXISTS idx_annotations_label_class_id ON annotations(label_class_id);
CREATE INDEX IF NOT EXISTS idx_images_status             ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_split              ON images(split);
    `,
  },
  {
    filename: '002_keypoints.sql',
    sql: `
CREATE TABLE IF NOT EXISTS keypoint_definitions (
  id              TEXT PRIMARY KEY,
  label_class_id  TEXT NOT NULL REFERENCES label_classes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL,
  color           TEXT NOT NULL DEFAULT '#FFFFFF'
);

CREATE TABLE IF NOT EXISTS keypoint_skeleton (
  label_class_id  TEXT NOT NULL REFERENCES label_classes(id) ON DELETE CASCADE,
  from_kp_id      TEXT NOT NULL REFERENCES keypoint_definitions(id) ON DELETE CASCADE,
  to_kp_id        TEXT NOT NULL REFERENCES keypoint_definitions(id) ON DELETE CASCADE,
  PRIMARY KEY (label_class_id, from_kp_id, to_kp_id)
);

CREATE INDEX IF NOT EXISTS idx_kp_defs_label_class ON keypoint_definitions(label_class_id);
    `,
  },
  {
    filename: '003_image_flags.sql',
    sql: `ALTER TABLE images ADD COLUMN is_null INTEGER NOT NULL DEFAULT 0;`,
  },
]

interface MigrationRow {
  id: number
  filename: string
  applied_at: number
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set(
    (database.prepare('SELECT filename FROM _migrations').all() as MigrationRow[])
      .map((r) => r.filename)
  )

  for (const { filename, sql } of MIGRATIONS) {
    if (applied.has(filename)) continue
    database.exec(sql)
    database
      .prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)')
      .run(filename, Date.now())
  }
}

function normalizeDatabaseOpenError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)

  if (
    message.includes('better_sqlite3.node is not a valid Win32 application')
    || message.includes('invalid ELF header')
    || message.includes('wrong ELF class')
  ) {
    return new Error(
      'LabelIt could not load its local SQLite module for this OS.\n\n'
      + 'Run `npm install` or `npm run native:fix` in the project root, then restart the app.'
    )
  }

  return error instanceof Error ? error : new Error(message)
}
