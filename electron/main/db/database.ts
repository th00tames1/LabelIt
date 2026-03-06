import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

let db: Database.Database | null = null

/**
 * Open (or create) a project database at the given path.
 * Runs all pending migrations automatically.
 */
export function openDatabase(dbPath: string): Database.Database {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
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

  const migrationsDir = join(app.getAppPath(), 'electron', 'main', 'db', 'migrations')
  const migrationFiles = ['001_initial.sql', '002_keypoints.sql']

  for (const filename of migrationFiles) {
    if (applied.has(filename)) continue

    const sql = readFileSync(join(migrationsDir, filename), 'utf-8')
    database.exec(sql)
    database
      .prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)')
      .run(filename, Date.now())
  }
}
