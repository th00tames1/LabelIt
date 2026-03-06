import { getDatabase } from '../database'
import type { ProjectMeta } from '../schema'

export function getProjectMeta(): ProjectMeta {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM project_meta').all() as { key: string; value: string }[]
  const meta: Record<string, string> = {}
  rows.forEach(({ key, value }) => { meta[key] = value })

  return {
    version: meta['version'] ?? '1.0.0',
    name: meta['name'] ?? 'Untitled Project',
    created_at: Number(meta['created_at'] ?? 0),
    image_storage_mode: (meta['image_storage_mode'] ?? 'linked') as 'linked' | 'copied',
  }
}

export function initProjectMeta(name: string): void {
  const db = getDatabase()
  const insert = db.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)')
  const tx = db.transaction(() => {
    insert.run('version', '1.0.0')
    insert.run('name', name)
    insert.run('created_at', String(Date.now()))
    insert.run('image_storage_mode', 'linked')
  })
  tx()
}

export function setProjectName(name: string): void {
  getDatabase().prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)').run('name', name)
}
